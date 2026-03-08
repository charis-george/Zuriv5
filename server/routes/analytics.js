const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { getBusinessPlan, canAccessAnalytics, canAccessProFeatures } = require('../lib/plans');
const { requireBusinessAuth } = require('../middleware/auth');

const supabase = getDb();

// Get sales summary — requires business auth
router.get('/sales/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only view your own analytics' });
    }
    const plan = await getBusinessPlan(businessId);
    if (!canAccessAnalytics(plan)) {
      return res.status(403).json({ error: 'Analytics available on Basic plan and above. Upgrade to unlock.' });
    }
    const { period = 'day' } = req.query; // day, week, month

    const now = new Date();
    let startDate = new Date();

    if (period === 'day') {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
      startDate.setDate(now.getDate() - 7);
    } else if (period === 'month') {
      startDate.setDate(now.getDate() - 30);
    }

    const { data: orders, error } = await supabase
      .from('orders')
      .select('total_amount, status')
      .eq('business_id', businessId)
      .neq('status', 'cancelled')
      .gte('created_at', startDate.toISOString());

    if (error) {
      console.error('Get sales summary error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    let totalOrders = orders?.length ?? 0;
    let totalRevenue = 0;
    let completedRevenue = 0;

    orders?.forEach(order => {
      totalRevenue += order.total_amount || 0;
      if (order.status === 'completed') {
        completedRevenue += order.total_amount || 0;
      }
    });

    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    res.json({
      totalOrders,
      totalRevenue,
      averageOrderValue,
      completedRevenue
    });
  } catch (error) {
    console.error('Get sales summary error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get sales by date — requires business auth
router.get('/sales-by-date/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only view your own analytics' });
    }
    const plan = await getBusinessPlan(businessId);
    if (!canAccessAnalytics(plan)) {
      return res.status(403).json({ error: 'Analytics available on Basic plan and above. Upgrade to unlock.' });
    }
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const { data: orders, error } = await supabase
      .from('orders')
      .select('created_at, total_amount, status')
      .eq('business_id', businessId)
      .neq('status', 'cancelled')
      .gte('created_at', startDate.toISOString());

    if (error) {
      console.error('Get sales by date error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    const salesByDate = {};

    orders?.forEach(order => {
      const date = new Date(order.created_at);
      const dateKey = date.toISOString().split('T')[0];

      if (!salesByDate[dateKey]) {
        salesByDate[dateKey] = {
          date: dateKey,
          orderCount: 0,
          revenue: 0,
          completedRevenue: 0
        };
      }

      salesByDate[dateKey].orderCount++;
      salesByDate[dateKey].revenue += order.total_amount || 0;
      if (order.status === 'completed') {
        salesByDate[dateKey].completedRevenue += order.total_amount || 0;
      }
    });

    res.json(Object.values(salesByDate).sort((a, b) => b.date.localeCompare(a.date)));
  } catch (error) {
    console.error('Get sales by date error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get most ordered items — requires business auth
router.get('/popular-items/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only view your own analytics' });
    }
    const plan = await getBusinessPlan(businessId);
    if (!canAccessAnalytics(plan)) {
      return res.status(403).json({ error: 'Analytics available on Basic plan and above. Upgrade to unlock.' });
    }
    const { limit = 10, days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get orders in the time period
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id')
      .eq('business_id', businessId)
      .neq('status', 'cancelled')
      .gte('created_at', startDate.toISOString());

    if (ordersError) {
      console.error('Get popular items error:', ordersError);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!orders || orders.length === 0) {
      return res.json([]);
    }

    const orderIds = orders.map(o => o.id);

    // Get order items for these orders
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('menu_item_id, quantity, price, order_id')
      .in('order_id', orderIds);

    if (itemsError) {
      console.error('Get popular items error:', itemsError);
      return res.status(500).json({ error: 'Database error' });
    }

    // Get menu item details
    const menuItemIds = [...new Set(orderItems?.map(item => item.menu_item_id) || [])];
    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('id, name, price')
      .eq('business_id', businessId)
      .in('id', menuItemIds);

    const menuItemMap = {};
    menuItems?.forEach(item => {
      menuItemMap[item.id] = item;
    });

    const itemStats = {};

    orderItems?.forEach(item => {
      const menuItemId = item.menu_item_id;
      const menuItem = menuItemMap[menuItemId];
      
      if (!menuItem) return; // Skip if menu item not found

      if (!itemStats[menuItemId]) {
        itemStats[menuItemId] = {
          id: menuItemId,
          name: menuItem.name,
          price: menuItem.price,
          totalQuantity: 0,
          totalRevenue: 0,
          orderCount: new Set()
        };
      }

      itemStats[menuItemId].totalQuantity += item.quantity;
      itemStats[menuItemId].totalRevenue += item.quantity * item.price;
      itemStats[menuItemId].orderCount.add(item.order_id);
    });

    const results = Object.values(itemStats).map(stats => ({
      id: stats.id,
      name: stats.name,
      price: stats.price,
      totalQuantity: stats.totalQuantity,
      totalRevenue: stats.totalRevenue,
      orderCount: stats.orderCount.size
    }));

    results.sort((a, b) => b.totalQuantity - a.totalQuantity);
    res.json(results.slice(0, parseInt(limit)));
  } catch (error) {
    console.error('Get popular items error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get peak hours — requires business auth
router.get('/peak-hours/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only view your own analytics' });
    }
    const plan = await getBusinessPlan(businessId);
    if (!canAccessAnalytics(plan)) {
      return res.status(403).json({ error: 'Analytics available on Basic plan and above. Upgrade to unlock.' });
    }
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const { data: orders, error } = await supabase
      .from('orders')
      .select('created_at, total_amount')
      .eq('business_id', businessId)
      .neq('status', 'cancelled')
      .gte('created_at', startDate.toISOString());

    if (error) {
      console.error('Get peak hours error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    const hourStats = {};

    orders?.forEach(order => {
      const date = new Date(order.created_at);
      const hour = date.getHours().toString().padStart(2, '0');

      if (!hourStats[hour]) {
        hourStats[hour] = {
          hour,
          orderCount: 0,
          revenue: 0
        };
      }

      hourStats[hour].orderCount++;
      hourStats[hour].revenue += order.total_amount || 0;
    });

    const results = Object.values(hourStats).sort((a, b) => a.hour.localeCompare(b.hour));
    res.json(results);
  } catch (error) {
    console.error('Get peak hours error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get profit margins — requires business auth
router.get('/profit-margins/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only view your own analytics' });
    }
    const plan = await getBusinessPlan(businessId);
    if (!canAccessAnalytics(plan)) {
      return res.status(403).json({ error: 'Analytics available on Basic plan and above. Upgrade to unlock.' });
    }
    const { days = 30 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    // Get orders in the time period
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id')
      .eq('business_id', businessId)
      .neq('status', 'cancelled')
      .gte('created_at', startDate.toISOString());

    if (ordersError) {
      console.error('Get profit margins error:', ordersError);
      return res.status(500).json({ error: 'Database error' });
    }

    if (!orders || orders.length === 0) {
      return res.json([]);
    }

    const orderIds = orders.map(o => o.id);

    // Get order items for these orders
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('menu_item_id, quantity, price')
      .in('order_id', orderIds);

    if (itemsError) {
      console.error('Get profit margins error:', itemsError);
      return res.status(500).json({ error: 'Database error' });
    }

    // Get menu item details
    const menuItemIds = [...new Set(orderItems?.map(item => item.menu_item_id) || [])];
    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('id, name, price, cost')
      .eq('business_id', businessId)
      .in('id', menuItemIds);

    const menuItemMap = {};
    menuItems?.forEach(item => {
      menuItemMap[item.id] = item;
    });

    const itemStats = {};

    orderItems?.forEach(item => {
      const menuItemId = item.menu_item_id;
      const menuItem = menuItemMap[menuItemId];
      
      if (!menuItem) return; // Skip if menu item not found

      if (!itemStats[menuItemId]) {
        itemStats[menuItemId] = {
          id: menuItemId,
          name: menuItem.name,
          price: menuItem.price,
          cost: menuItem.cost || 0,
          totalQuantity: 0,
          totalRevenue: 0,
          totalCost: 0
        };
      }

      itemStats[menuItemId].totalQuantity += item.quantity;
      itemStats[menuItemId].totalRevenue += item.quantity * item.price;
      itemStats[menuItemId].totalCost += item.quantity * (menuItem.cost || 0);
    });

    const results = Object.values(itemStats).map(stats => {
      const profit = stats.totalRevenue - stats.totalCost;
      const marginPercentage = stats.totalRevenue > 0 
        ? (profit / stats.totalRevenue) * 100 
        : 0;

      return {
        id: stats.id,
        name: stats.name,
        price: stats.price,
        cost: stats.cost,
        totalQuantity: stats.totalQuantity,
        totalRevenue: stats.totalRevenue,
        totalCost: stats.totalCost,
        profit: profit,
        marginPercentage: marginPercentage
      };
    });

    results.sort((a, b) => b.profit - a.profit);
    res.json(results);
  } catch (error) {
    console.error('Get profit margins error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Customer intelligence (Pro+): repeat customers, avg spend, visit frequency
router.get('/customer-intelligence/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only view your own analytics' });
    }
    const plan = await getBusinessPlan(businessId);
    if (!canAccessProFeatures(plan)) {
      return res.status(403).json({ error: 'Customer intelligence is available on Pro plan and above. Upgrade to unlock.' });
    }
    const { days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, customer_email, total_amount, created_at')
      .eq('business_id', businessId)
      .neq('status', 'cancelled')
      .gte('created_at', startDate.toISOString());

    if (error) {
      console.error('Get customer intelligence error:', error);
      return res.status(500).json({ error: 'Database error' });
    }

    const ordersWithEmail = (orders || []).filter(o => o.customer_email && String(o.customer_email).trim());
    if (ordersWithEmail.length === 0) {
      return res.json({
        uniqueCustomers: 0,
        repeatCustomers: 0,
        repeatRatePct: 0,
        totalOrders: 0,
        totalRevenue: 0,
        avgSpendPerOrder: 0,
        ordersPerCustomer: 0,
        returnWithin10DaysPct: 0
      });
    }

    const byEmail = {};
    ordersWithEmail.forEach(o => {
      const e = String(o.customer_email).trim().toLowerCase();
      if (!byEmail[e]) byEmail[e] = { orders: [], totalSpend: 0 };
      byEmail[e].orders.push(new Date(o.created_at));
      byEmail[e].totalSpend += Number(o.total_amount) || 0;
    });
    const customers = Object.values(byEmail);
    const uniqueCustomers = customers.length;
    const repeatCustomers = customers.filter(c => c.orders.length >= 2).length;
    const totalOrders = ordersWithEmail.length;
    const totalRevenue = ordersWithEmail.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const avgSpendPerOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const ordersPerCustomer = uniqueCustomers > 0 ? totalOrders / uniqueCustomers : 0;
    const repeatRatePct = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0;
    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
    let returnWithin10Days = 0;
    customers.forEach(c => {
      const sorted = [...c.orders].sort((a, b) => a.getTime() - b.getTime());
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].getTime() - sorted[i - 1].getTime() <= tenDaysMs) {
          returnWithin10Days++;
          break;
        }
      }
    });
    const returnWithin10DaysPct = uniqueCustomers > 0 ? (returnWithin10Days / uniqueCustomers) * 100 : 0;

    res.json({
      uniqueCustomers,
      repeatCustomers,
      repeatRatePct,
      totalOrders,
      totalRevenue,
      avgSpendPerOrder,
      ordersPerCustomer,
      returnWithin10DaysPct
    });
  } catch (err) {
    console.error('Get customer intelligence error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
