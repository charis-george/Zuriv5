const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { requireBusinessAuth } = require('../middleware/auth');
const { getOrCreateNetworkCustomer, updateCustomerStats, getStatsByEmail, getStatsForCustomerIds } = require('../lib/zuri-network');
const { queueBusinessEmail } = require('../lib/notifications');
const { queueOrderReceiptOnce } = require('../lib/orderReceiptEmail');
const { resolveActivePresetId, resolvePresetIdFromStorefront, matchesPreset } = require('../lib/menuPresets');
const { canAcceptOrders, canAcceptPayments, statusMessage } = require('../lib/businessStatus');
const { refundOrderPayment } = require('../lib/paystack-refund');
const { validateOrderTicketQuantities, getTicketsSoldMap } = require('../lib/ticketQuantityRules');
const { notifyBusinessNewOrder } = require('../lib/webPush');
const { sendTicketInviteEmail } = require('../lib/ticketInviteEmail');
const { selectInChunks } = require('../lib/supabaseInChunks');

const supabase = getDb();

function validateGuestContact({ customerName, customerPhone, customerEmail }) {
  const name = customerName ? String(customerName).trim() : '';
  const phone = customerPhone ? String(customerPhone).trim() : '';
  const email = customerEmail ? String(customerEmail).trim() : '';
  if (!name || name.length < 2) return 'Name is required';
  if (!phone || phone.replace(/\D/g, '').length < 7) return 'A valid phone number is required';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'A valid email is required';
  return null;
}

function normalizeCatalogMode(value) {
  return value === 'ticketing' ? 'ticketing' : 'menu';
}

async function resolveOrderCatalogPresetId(businessId, activeMode, { eventSlug, storefrontSlug } = {}) {
  const fromStorefront = await resolvePresetIdFromStorefront(
    businessId,
    storefrontSlug ? String(storefrontSlug).trim() : '',
    eventSlug ? String(eventSlug).trim() : ''
  );
  if (fromStorefront) return fromStorefront;
  return resolveActivePresetId(businessId, activeMode);
}

const MENU_ITEM_SELECT =
  'id, name, price, estimated_prep_time, item_mode, preset_id, max_per_user, group_size, min_per_order, pricing_type';

// Create order
router.post('/', async (req, res) => {
  try {
    const { businessId, customerName, customerPhone, customerEmail, guestToken, items, eventSlug, storefrontSlug } = req.body;

    if (!businessId || !items || items.length === 0) {
      return res.status(400).json({ error: 'Business ID and items are required' });
    }

    const guestErr = validateGuestContact({ customerName, customerPhone, customerEmail });
    if (guestErr) return res.status(400).json({ error: guestErr });

    const { data: business } = await supabase
      .from('businesses')
      .select('business_mode, account_status')
      .eq('id', businessId)
      .maybeSingle();

    if (!business) return res.status(404).json({ error: 'Business not found' });
    if (!canAcceptOrders(business.account_status)) {
      return res.status(403).json({ error: statusMessage(business.account_status) || 'This venue is unavailable' });
    }

    const activeMode = normalizeCatalogMode(business?.business_mode);
    const activePresetId = await resolveOrderCatalogPresetId(businessId, activeMode, { eventSlug, storefrontSlug });

    const menuItemIds = [...new Set(items.map(item => item.menuItemId).filter(Boolean))];
    if (menuItemIds.length === 0) {
      return res.status(400).json({ error: 'Valid menu item IDs are required' });
    }

    let menuItems = [];
    let menuError = null;
    try {
      const resMenu = await supabase
        .from('menu_items')
          .select(MENU_ITEM_SELECT)
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
          .select('id, name, price, item_mode, pricing_type')
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

    const inviteOnlyIds = menuItemIds.filter((id) => menuMap[id]?.pricing_type === 'invite_only');
    if (inviteOnlyIds.length > 0) {
      return res.status(403).json({
        error: 'One or more tickets are invite-only. Ask the organizer to send you an invite link.'
      });
    }

    if (activeMode === 'ticketing') {
      const ticketsSoldMap = await getTicketsSoldMap(supabase, businessId, menuItemIds);
      const ticketRuleErr = validateOrderTicketQuantities(menuMap, items, ticketsSoldMap);
      if (ticketRuleErr) {
        return res.status(400).json({ error: ticketRuleErr });
      }
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

    if (orderItems.length === 0) {
      return res.status(400).json({ error: 'Order must have at least one item' });
    }

    const isFreeOrder = totalAmount <= 0;

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
      status: isFreeOrder ? 'pending' : 'pending',
      total_amount: totalAmount,
      estimated_prep_time:
        estimatedPrepTimeWeightedQty > 0 ? Math.round(estimatedPrepTimeWeightedSum / estimatedPrepTimeWeightedQty) : 15,
      payment_status: isFreeOrder ? 'paid' : 'pending',
      payment_method: isFreeOrder ? 'free' : null
    };
    if (zuriCustomerId) orderPayload.zuri_customer_id = zuriCustomerId;
    if (eventSlug && String(eventSlug).trim()) orderPayload.event_slug = String(eventSlug).trim().slice(0, 80);

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

    // Ticketing: unpaid checkouts are not real sales yet — notify only when paid (or free/complimentary).
    const deferVenueAlerts =
      activeMode === 'ticketing' && orderPayload.payment_status !== 'paid';

    if (!deferVenueAlerts) {
      const io = req.app.get('io');
      if (io) {
        io.to(`business-${businessId}`).emit('new-order', orderResponse);
      }

      notifyBusinessNewOrder(
        businessId,
        orderResponse,
        activeMode === 'ticketing' ? { title: 'New ticket sale' } : undefined
      ).catch((e) => {
        console.error('[ZURI] push new-order error:', e?.message || e);
      });

      const itemLines = (orderItemsWithNames || []).map(it => `- ${it.quantity}× ${it.menuItemName} (${it.price.toFixed ? it.price.toFixed(2) : it.price})`).join('\n')
      queueBusinessEmail({
        businessId,
        subject: activeMode === 'ticketing'
          ? `New ticket sale (${orderResponse.status})`
          : `New order received (${orderResponse.status})`,
        text: [
          activeMode === 'ticketing'
            ? `You received a new paid ticket sale from ${orderResponse.customer_name || 'a guest'}.`
            : `You received a new order from ${orderResponse.customer_name || 'a guest'}.`,
          ``,
          `Order: #${String(orderResponse.id).slice(0, 8).toUpperCase()}`,
          `Total: ₦${Number(orderResponse.total_amount || orderResponse.totalAmount || 0).toFixed(2)}`,
          `Phone: ${orderResponse.customer_phone || '—'}`,
          ``,
          `Items:`,
          itemLines || '(no items)',
          ``,
          activeMode === 'ticketing'
            ? `Open your dashboard to confirm the sale.`
            : `Open your dashboard to start preparing.`
        ].join('\n')
      });
    } else {
      // Still emit so connected dashboards can refresh (list stays paid-only).
      const io = req.app.get('io');
      if (io) {
        io.to(`business-${businessId}`).emit('new-order', orderResponse);
      }
    }

    if (isFreeOrder) {
      queueOrderReceiptOnce({
        orderId,
        paidAt: new Date().toISOString(),
        reference: orderId
      });
    }

    res.json(orderResponse);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Send invite-only ticket order to a guest (business dashboard)
router.post('/ticket-invite', requireBusinessAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const {
      menuItemId,
      quantity,
      customerName,
      customerEmail,
      customerPhone,
      deliveryMode,
      eventSlug,
      storefrontSlug
    } = req.body;

    if (!menuItemId || !customerName || !customerEmail) {
      return res.status(400).json({ error: 'Ticket, guest name, and email are required' });
    }

    const guestErr = validateGuestContact({ customerName, customerPhone, customerEmail });
    if (guestErr) return res.status(400).json({ error: guestErr });

    const mode = deliveryMode === 'complimentary' ? 'complimentary' : 'payment_link';
    const qty = Math.min(99, Math.max(1, parseInt(quantity, 10) || 1));

    const { data: business } = await supabase
      .from('businesses')
      .select('business_mode, account_status, name, email')
      .eq('id', businessId)
      .maybeSingle();

    if (!business) return res.status(404).json({ error: 'Business not found' });
    if (business.business_mode !== 'ticketing') {
      return res.status(400).json({ error: 'Ticket invites are only available for ticketing businesses' });
    }
    if (!canAcceptOrders(business.account_status)) {
      return res.status(403).json({ error: statusMessage(business.account_status) || 'This venue is unavailable' });
    }

    const activeMode = normalizeCatalogMode(business.business_mode);
    const activePresetId = await resolveOrderCatalogPresetId(businessId, activeMode, { eventSlug, storefrontSlug });

    const { data: menuItem, error: menuError } = await supabase
      .from('menu_items')
      .select(MENU_ITEM_SELECT)
      .eq('business_id', businessId)
      .eq('id', menuItemId)
      .maybeSingle();

    if (menuError || !menuItem) {
      return res.status(404).json({ error: 'Ticket not found' });
    }

    if (
      (menuItem.item_mode && normalizeCatalogMode(menuItem.item_mode) !== activeMode) ||
      !matchesPreset(menuItem, activePresetId)
    ) {
      return res.status(400).json({ error: 'This ticket is not on the active catalog' });
    }

    if (menuItem.pricing_type !== 'invite_only') {
      return res.status(400).json({ error: 'Only invite-only tickets can be sent this way' });
    }

    const menuMap = { [menuItem.id]: menuItem };
    const ticketsSoldMap = await getTicketsSoldMap(supabase, businessId, [menuItemId]);
    const ticketRuleErr = validateOrderTicketQuantities(menuMap, [{ menuItemId, quantity: qty }], ticketsSoldMap);
    if (ticketRuleErr) {
      return res.status(400).json({ error: ticketRuleErr });
    }

    const price = Number(menuItem.price) || 0;
    const totalAmount = price * qty;
    const isComplimentary = mode === 'complimentary' || totalAmount <= 0;

    if (!isComplimentary && !canAcceptPayments(business.account_status)) {
      return res.status(403).json({ error: statusMessage(business.account_status) || 'Payments are not available for this venue' });
    }

    const orderId = uuidv4();
    const orderItems = [{
      id: uuidv4(),
      order_id: orderId,
      menu_item_id: menuItemId,
      quantity: qty,
      price,
      special_notes: 'invite_only'
    }];

    const orderPayload = {
      id: orderId,
      business_id: businessId,
      customer_name: String(customerName).trim(),
      customer_phone: customerPhone ? String(customerPhone).trim() : null,
      customer_email: String(customerEmail).trim().toLowerCase(),
      status: 'pending',
      total_amount: totalAmount,
      estimated_prep_time: 15,
      payment_status: isComplimentary ? 'paid' : 'pending',
      payment_method: isComplimentary ? 'invite_complimentary' : 'invite_pending'
    };
    if (eventSlug && String(eventSlug).trim()) {
      orderPayload.event_slug = String(eventSlug).trim().slice(0, 80);
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert(orderPayload)
      .select()
      .single();

    if (orderError) {
      console.error('Ticket invite order error:', orderError);
      return res.status(500).json({ error: 'Failed to create invite order' });
    }

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    if (itemsError) {
      console.error('Ticket invite items error:', itemsError);
      return res.status(500).json({ error: 'Failed to create invite order items' });
    }

    const orderItemsWithNames = [{
      menuItemId,
      menuItemName: menuItem.name || 'Ticket',
      quantity: qty,
      price
    }];

    const emailResult = await sendTicketInviteEmail({
      order,
      business,
      items: orderItemsWithNames,
      deliveryMode: mode,
      eventSlug: eventSlug ? String(eventSlug).trim() : null
    });

    if (emailResult?.skipped) {
      console.warn('[ZURI] Ticket invite API: email did not send', {
        orderId,
        deliveryMode: mode,
        reason: emailResult.reason,
        cause: emailResult.cause || emailResult.reason
      });
      if (isComplimentary && emailResult.reason !== 'no_customer_email') {
        return res.status(503).json({
          success: false,
          error: 'Ticket was created but the QR email could not be queued. Retry in a moment.',
          orderId,
          deliveryMode: mode,
          email: emailResult
        });
      }
    }

    res.json({
      success: true,
      orderId,
      deliveryMode: mode,
      paymentStatus: order.payment_status,
      email: emailResult
    });
  } catch (error) {
    console.error('Ticket invite error:', error);
    res.status(500).json({ error: 'Failed to send ticket invite' });
  }
});

// Get orders for a business — requires business auth
router.get('/business/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only view your own business orders' });
    }
    const { status, payment_status: paymentStatus, limit = 50 } = req.query;

    let query = supabase
      .from('orders')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (status) {
      query = query.eq('status', status);
    }
    if (paymentStatus && typeof paymentStatus === 'string') {
      query = query.eq('payment_status', paymentStatus);
    }

    const { data: orders, error } = await query;

    if (error) {
      console.error('Get orders error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    const customerIds = [...new Set((orders || []).map(o => o.zuri_customer_id).filter(Boolean))];
    const statsMap = await getStatsForCustomerIds(customerIds);

    const orderIds = (orders || []).map((o) => o.id).filter(Boolean);
    let allOrderItems = [];
    if (orderIds.length) {
      const { data: batchedItems, error: itemsErr } = await selectInChunks(
        supabase,
        'order_items',
        'order_id, menu_item_id, quantity, price, special_notes',
        'order_id',
        orderIds
      );
      if (itemsErr) {
        console.error('Get order items batch error:', itemsErr?.message || itemsErr);
        return res.status(500).json({ error: 'Database error' });
      }
      allOrderItems = batchedItems || [];
    }

    const itemsByOrder = new Map();
    for (const row of allOrderItems) {
      if (!itemsByOrder.has(row.order_id)) itemsByOrder.set(row.order_id, []);
      itemsByOrder.get(row.order_id).push(row);
    }

    const menuItemIds = [...new Set(allOrderItems.map((row) => row.menu_item_id).filter(Boolean))];
    const menuItemMap = {};
    if (menuItemIds.length) {
      const { data: menuItems } = await supabase
        .from('menu_items')
        .select('id, name')
        .in('id', menuItemIds);
      menuItems?.forEach((item) => {
        menuItemMap[item.id] = item.name;
      });
    }

    const ordersWithItems = (orders || []).map((order) => {
      const orderItems = itemsByOrder.get(order.id) || [];
      const items = orderItems.map((item) => ({
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
    });

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

/** Business-initiated refund (ticketing cancellations, disputes) */
router.post('/:id/refund', requireBusinessAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const { amountNaira, reason } = req.body || {};

    const { data: order } = await supabase
      .from('orders')
      .select('id, business_id, payment_status')
      .eq('id', id)
      .single();

    if (!order || order.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const result = await refundOrderPayment(id, { amountNaira, reason });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error('Business refund error:', error);
    res.status(500).json({ error: 'Refund failed' });
  }
});

/** Guest or venue dispute escalation */
router.post('/:id/dispute', async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, raisedBy, customerEmail } = req.body || {};

    const { data: order } = await supabase
      .from('orders')
      .select('id, business_id, customer_email')
      .eq('id', id)
      .single();

    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (raisedBy === 'guest' && customerEmail) {
      const norm = String(customerEmail).trim().toLowerCase();
      if (order.customer_email && order.customer_email.toLowerCase() !== norm) {
        return res.status(403).json({ error: 'Email does not match order' });
      }
    }

    const { data, error } = await supabase
      .from('disputes')
      .insert({
        order_id: id,
        business_id: order.business_id,
        raised_by: ['guest', 'venue', 'platform'].includes(raisedBy) ? raisedBy : 'guest',
        reason: reason ? String(reason).slice(0, 1000) : null
      })
      .select()
      .single();

    if (error) return res.status(500).json({ error: 'Failed to open dispute' });
    res.json(data);
  } catch (error) {
    console.error('Create dispute error:', error);
    res.status(500).json({ error: 'Failed to open dispute' });
  }
});

module.exports = router;
