const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { agentLog } = require('../debug-log');

const supabase = getDb();

// Create order
router.post('/', async (req, res) => {
  // #region agent log
  agentLog({ location: 'order.js:POST', message: 'Order POST received', data: { businessId: req.body?.businessId, itemCount: req.body?.items?.length }, hypothesisId: 'H1' });
  // #endregion
  try {
    const { businessId, customerName, customerPhone, customerEmail, items, estimatedPrepTime } = req.body;

    if (!businessId || !items || items.length === 0) {
      return res.status(400).json({ error: 'Business ID and items are required' });
    }

    const orderId = uuidv4();
    let totalAmount = 0;

    // Calculate total
    items.forEach(item => {
      totalAmount += item.price * item.quantity;
    });

    // Create order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .insert({
        id: orderId,
        business_id: businessId,
        customer_name: customerName || null,
        customer_phone: customerPhone || null,
        customer_email: customerEmail || null,
        status: 'pending',
        total_amount: totalAmount,
        estimated_prep_time: estimatedPrepTime || 15,
        payment_status: 'pending'
      })
      .select()
      .single();

    // #region agent log
    agentLog({ location: 'order.js:orderInsert', message: 'Order insert result', data: { orderError: orderError?.message || null, orderId }, hypothesisId: 'H2' });
    // #endregion

    if (orderError) {
      console.error('Create order error:', orderError);
      return res.status(500).json({ error: 'Failed to create order' });
    }

    // Create order items
    const orderItems = items.map(item => ({
      id: uuidv4(),
      order_id: orderId,
      menu_item_id: item.menuItemId,
      quantity: item.quantity,
      price: item.price,
      special_notes: item.specialNotes || null
    }));

    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);

    // #region agent log
    agentLog({ location: 'order.js:orderItemsInsert', message: 'Order items insert result', data: { itemsError: itemsError?.message || null }, hypothesisId: 'H2' });
    // #endregion

    if (itemsError) {
      console.error('Create order items error:', itemsError);
      return res.status(500).json({ error: 'Failed to create order items' });
    }

    // Get menu item names for response
    const menuItemIds = items.map(item => item.menuItemId);
    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('id, name')
      .in('id', menuItemIds);

    const menuItemMap = {};
    menuItems?.forEach(item => {
      menuItemMap[item.id] = item.name;
    });

    const orderItemsWithNames = items.map(item => ({
      menuItemId: item.menuItemId,
      menuItemName: menuItemMap[item.menuItemId] || 'Unknown Item',
      quantity: item.quantity,
      price: item.price,
      specialNotes: item.specialNotes
    }));

    const orderResponse = {
      ...order,
      items: orderItemsWithNames
    };

    // Emit real-time notification to business
    const io = req.app.get('io');
    if (io) {
      io.to(`business-${businessId}`).emit('new-order', orderResponse);
    }

    res.json(orderResponse);
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// Get orders for a business
router.get('/business/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
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

        return {
          ...order,
          items
        };
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

    res.json({
      ...order,
      items
    });
  } catch (error) {
    console.error('Get order error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Update order status
router.patch('/:id/status', async (req, res) => {
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
      .select()
      .single();

    if (error) {
      console.error('Update order status error:', error);
      return res.status(500).json({ error: 'Failed to update order' });
    }

    // Emit real-time update
    const io = req.app.get('io');
    if (io && order) {
      io.to(`business-${order.business_id}`).emit('order-updated', order);
    }

    res.json(order);
  } catch (error) {
    console.error('Update order status error:', error);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

module.exports = router;
