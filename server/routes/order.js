const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { requireBusinessAuth } = require('../middleware/auth');
const { getOrCreateNetworkCustomer, updateCustomerStats, getStatsByEmail, getStatsForCustomerIds } = require('../lib/zuri-network');
const { queueBusinessEmail } = require('../lib/notifications');
const { resolveActivePresetId, matchesPreset } = require('../lib/menuPresets');

const supabase = getDb();

function normalizeCatalogMode(value) {
  return value === 'ticketing' ? 'ticketing' : 'menu';
}

// Create order
router.post('/', async (req, res) => {
  try {
    const { businessId, customerName, customerPhone, customerEmail, guestToken, items } = req.body;

    if (!businessId || !items || items.length === 0) {
      return res.status(400).json({ error: 'Business ID and items are required' });
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('business_mode')
      .eq('id', businessId)
      .maybeSingle();
    const activeMode = normalizeCatalogMode(business?.business_mode);
    const activePresetId = await resolveActivePresetId(businessId, activeMode);

    const menuItemIds = [...new Set(items.map(item => item.menuItemId).filter(Boolean))];
    if (menuItemIds.length === 0) {
      return res.status(400).json({ error: 'Valid menu item IDs are required' });
    }

    let menuItems = [];
    let menuError = null;
    try {
      const resMenu = await supabase
        .from('menu_items')
          .select('id, name, price, estimated_prep_time, item_mode, preset_id')
        .eq('business_id', businessId)
        .in('id', menuItemIds);
      menuItems = resMenu.data || [];
      menuError = resMenu.error || null;
    } catch (e) {
      menuError = e;
    }

    if (menuError) {
      const msg = String(menuError?.message || menuError || '').toLowerCase()
      if (msg.includes('estimated_prep_time')) {
        // Backward compatibility: older DBs may not have this column yet.
        const resMenuFallback = await supabase
          .from('menu_items')
          .select('id, name, price, item_mode')
          .eq('business_id', businessId)
          .in('id', menuItemIds);
        if (resMenuFallback.error) {
          console.error('Menu fetch error (fallback):', resMenuFallback.error);
          return res.status(500).json({ error: 'Failed to load menu' });
        }
        menuItems = resMenuFallback.data || [];
      } else {
        console.error('Menu fetch error:', menuError);
        return res.status(500).json({ error: 'Failed to load menu' });
      }
    }

    const scopedItems = (menuItems || []).filter(
      (m) =>
        (!m.item_mode || normalizeCatalogMode(m.item_mode) === activeMode) &&
        matchesPreset(m, activePresetId)
    );
    const menuMap = scopedItems.reduce((acc, m) => ({ ...acc, [m.id]: m }), {});
    const missingIds = menuItemIds.filter(id => !menuMap[id]);
    if (missingIds.length > 0) {
      return res.status(400).json({ error: 'One or more items are not on the menu or do not belong to this business' });
    }

    let totalAmount = 0;
    let estimatedPrepTimeWeightedSum = 0;
    let estimatedPrepTimeWeightedQty = 0;
    const orderItems = [];
    for (const item of items) {
      const menuItem = menuMap[item.menuItemId];
      if (!menuItem) continue;
      const qty = Math.min(99, Math.max(1, parseInt(item.quantity, 10) || 1));
      const price = Number(menuItem.price) || 0;
      totalAmount += price * qty;

      const itemPrep = Number(menuItem.estimated_prep_time)
      const safeItemPrep = Number.isFinite(itemPrep) ? itemPrep : 15
      estimatedPrepTimeWeightedSum += safeItemPrep * qty;
      estimatedPrepTimeWeightedQty += qty;

      orderItems.push({
        id: uuidv4(),
        order_id: null,
        menu_item_id: item.menuItemId,
        quantity: qty,
        price,
        special_notes: typeof item.specialNotes === 'string' ? item.specialNotes.slice(0, 500) : null
      });
    }

    if (orderItems.length === 0 || totalAmount <= 0) {
      return res.status(400).json({ error: 'Order must have at least one item with a valid price' });
    }

    const orderId = uuidv4();
    orderItems.forEach(oi => { oi.order_id = orderId; });

    let zuriCustomerId = null;
    const { resolveGuestCustomerId } = require('../lib/guest-personalization');
    if (customerEmail && String(customerEmail).trim()) {
      const resolved = await getOrCreateNetworkCustomer(customerEmail);
      if (resolved.id) zuriCustomerId = resolved.id;
    } else if (guestToken && String(guestToken).trim()) {
      zuriCustomerId = await resolveGuestCustomerId({ guestToken: String(guestToken).trim() });
    }

    const orderPayload = {
      id: orderId,
      business_id: businessId,
      customer_name: customerName || null,
      customer_phone: customerPhone || null,
      customer_email: customerEmail || null,
      status: 'pending',
      total_amount: totalAmount,
      estimated_prep_time:
        estimatedPrepTimeWeightedQty > 0 ? Math.round(estimatedPrepTimeWeightedSum / estimatedPrepTimeWeightedQty) : 15,
      payment_status: 'pending'
    };
    if (zuriCustomerId) orderPayload.zuri_customer_id = zuriCustomerId;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select()
      .single();

    if (orderError) {
      console.error('Create order error:', orderError);
      return res.status(500).json({ error: 'Failed to create order' });
    }

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    if (itemsError) {
      console.error('Create order items error:', itemsError);
      return res.status(500).json({ error: 'Failed to create order items' });
    }

    if (zuriCustomerId) {
      await updateCustomerStats(zuriCustomerId);
      await supabase
        .from('zuri_network_customers')
        .update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', zuriCustomerId);
    }

    const orderItemsWithNames = orderItems.map(oi => ({
      menuItemId: oi.menu_item_id,
      menuItemName: (menuMap[oi.menu_item_id] && menuMap[oi.menu_item_id].name) || 'Unknown Item',
      quantity: oi.quantity,
      price: oi.price,
      specialNotes: oi.special_notes
    }));

    const orderResponse = {
      ...order,
      items: orderItemsWithNames
    };
    if (zuriCustomerId) {
      const stats = await getStatsByEmail(customerEmail);
      if (stats) {
        orderResponse.zuriCustomerStats = stats;
        orderResponse.returningZuriCustomer = true;
      }
    }

    // Emit real-time notification to business
    const io = req.app.get('io');
    if (io) {
      io.to(`business-${businessId}`).emit('new-order', orderResponse);
    }

    // Email notification to business (best effort)
    const itemLines = (orderItemsWithNames || []).map(it => `- ${it.quantity}× ${it.menuItemName} (${it.price.toFixed ? it.price.toFixed(2) : it.price})`).join('\n')
    queueBusinessEmail({
      businessId,
      subject: `New order received (${orderResponse.status})`,
      text: [
        `You received a new order from ${orderResponse.customer_name || 'a guest'}.`,
        ``,
        `Order: #${String(orderResponse.id).slice(0, 8).toUpperCase()}`,
        `Total: ₦${Number(orderResponse.total_amount || orderResponse.totalAmount || 0).toFixed(2)}`,
        `Phone: ${orderResponse.customer_phone || '—'}`,
        ``,
        `Items:`,
        itemLines || '(no items)',
        ``,
        `Open your dashboard to start preparing.`
      ].join('\n')
    })

    res.json(orderResponse);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Get orders for a business — requires business auth
router.get('/business/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only view your own business orders' });
    }
    const { status, limit = 50 } = req.query;

    let query = supabase
      .from('orders')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (status) {
      query = query.eq('status', status);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error('Get orders error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    const customerIds = [...new Set((orders || []).map(o => o.zuri_customer_id).filter(Boolean))];
    const statsMap = await getStatsForCustomerIds(customerIds);

    // Get order items for each order
    const ordersWithItems = await Promise.all(
      orders.map(async (order) => {
        const { data: orderItems } = await supabase
          .from('order_items')
          .select('menu_item_id, quantity, price, special_notes')
          .eq('order_id', order.id);

        if (!orderItems || orderItems.length === 0) {
          return { ...order, items: [] };
        }

        // Get menu item names
        const menuItemIds = orderItems.map(item => item.menu_item_id);
        const { data: menuItems } = await supabase
          .from('menu_items')
          .select('id, name')
          .in('id', menuItemIds);

        const menuItemMap = {};
        menuItems?.forEach(item => {
          menuItemMap[item.id] = item.name;
        });

        const items = orderItems.map(item => ({
          menuItemId: item.menu_item_id,
          menuItemName: menuItemMap[item.menu_item_id] || 'Unknown Item',
          quantity: item.quantity,
          price: item.price,
          specialNotes: item.special_notes
        }));

        const out = { ...order, items };
        if (order.zuri_customer_id) {
          const stats = statsMap.get(order.zuri_customer_id);
          if (stats && stats.totalOrders >= 1) {
            out.returningZuriCustomer = true;
            out.zuriCustomerStats = {
              avgOrderValue: stats.avgOrderValue,
              totalOrders: stats.totalOrders,
              businessCount: stats.businessCount
            };
          }
        }
        return out;
      })
    );

    res.json(ordersWithItems);
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get order details
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*')
      .eq('id', id)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Get order items
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('menu_item_id, quantity, price, special_notes')
      .eq('order_id', id);

    if (!orderItems || orderItems.length === 0) {
      return res.json({ ...order, items: [] });
    }

    // Get menu item names
    const menuItemIds = orderItems.map(item => item.menu_item_id);
    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('id, name')
      .in('id', menuItemIds);

    const menuItemMap = {};
    menuItems?.forEach(item => {
      menuItemMap[item.id] = item.name;
    });

    const items = orderItems.map(item => ({
      menuItemId: item.menu_item_id,
      menuItemName: menuItemMap[item.menu_item_id] || 'Unknown Item',
      quantity: item.quantity,
      price: item.price,
      specialNotes: item.special_notes
    }));

    const result = { ...order, items };
    if (order.zuri_customer_id) {
      const statsMap = await getStatsForCustomerIds([order.zuri_customer_id]);
      const stats = statsMap.get(order.zuri_customer_id);
      if (stats && stats.totalOrders >= 1) {
        result.returningZuriCustomer = true;
        result.zuriCustomerStats = {
          avgOrderValue: stats.avgOrderValue,
          totalOrders: stats.totalOrders,
          businessCount: stats.businessCount
        };
      }
    }
    res.json(result);
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update order status — requires business auth
router.patch('/:id/status', requireBusinessAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['pending', 'preparing', 'ready', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const updateData = { status };
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data: order, error } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', id)
      .eq('business_id', req.businessId)
      .select()
      .single();

    if (error) {
      console.error('Update order status error:', error);
      return res.status(500).json({ error: 'Failed to update order' });
    }
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io && order) {
      io.to(`business-${order.business_id}`).emit('order-updated', order);
    }

    // Email notification on meaningful updates (non-blocking)
    if (order && ['preparing', 'ready', 'completed'].includes(order.status)) {
      const itemCount = Array.isArray(order.items) ? order.items.length : undefined
      queueBusinessEmail({
        businessId: order.business_id,
        subject: `Order status updated: ${order.status}`,
        text: [
          `Order status changed: ${order.status}`,
          ``,
          `Order: #${String(order.id).slice(0, 8).toUpperCase()}`,
          `Total: ₦${Number(order.total_amount || 0).toFixed(2)}`,
          `Customer: ${order.customer_name || 'Guest'} (${order.customer_phone || '—'})`,
          itemCount != null ? `Items: ${itemCount}` : null
        ].filter(Boolean).join('\n')
      })
    }

    res.json(order);
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

module.exports = router;
