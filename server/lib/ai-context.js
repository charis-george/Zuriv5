const { getDb } = require('../database');
const { canAccessAnalytics } = require('./plans');

const supabase = getDb();

/**
 * Fetches all business context needed for AI insights (sales, popular items, peak hours, menu).
 * Used only after plan is verified as Zuri Plus/Enterprise.
 */
async function getAIContext(businessId, plan) {
  const hasAnalytics = canAccessAnalytics(plan);

  const [businessRes, menuRes] = await Promise.all([
    supabase.from('businesses').select('name').eq('id', businessId).single(),
    supabase.from('categories').select('id, name, display_order').eq('business_id', businessId).order('display_order')
  ]);

  const businessName = businessRes.data?.name || 'This business';
  const categories = menuRes.error ? [] : (menuRes.data || []);

  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id, name, description, price, cost, category_id, display_order')
    .eq('business_id', businessId)
    .order('display_order');

  const menuByCategory = {};
  categories.forEach(c => {
    menuByCategory[c.name] = (menuItems || [])
      .filter(i => i.category_id === c.id)
      .map(i => ({ name: i.name, description: i.description || '', price: i.price, cost: i.cost || 0 }));
  });
  const uncategorized = (menuItems || []).filter(i => !i.category_id);
  if (uncategorized.length) menuByCategory['Uncategorized'] = uncategorized.map(i => ({ name: i.name, description: i.description || '', price: i.price, cost: i.cost || 0 }));

  let salesWeek = null;
  let salesMonth = null;
  let popularItems = [];
  let peakHours = [];
  let profitMargins = [];
  let customerIntelligence = null;

  if (hasAnalytics) {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - 7);
    const monthStart = new Date(now);
    monthStart.setDate(now.getDate() - 30);

    const [ordersWeek, ordersMonth, ordersForItems, ordersForPeak, ordersForMargins] = await Promise.all([
      supabase.from('orders').select('total_amount, status').eq('business_id', businessId).gte('created_at', weekStart.toISOString()),
      supabase.from('orders').select('total_amount, status').eq('business_id', businessId).gte('created_at', monthStart.toISOString()),
      supabase.from('orders').select('id').eq('business_id', businessId).gte('created_at', monthStart.toISOString()),
      supabase.from('orders').select('created_at, total_amount').eq('business_id', businessId).gte('created_at', monthStart.toISOString()),
      supabase.from('orders').select('id').eq('business_id', businessId).gte('created_at', monthStart.toISOString())
    ]);

    const oWeek = ordersWeek.data || [];
    const oMonth = ordersMonth.data || [];
    salesWeek = {
      totalOrders: oWeek.length,
      totalRevenue: oWeek.reduce((s, o) => s + (o.total_amount || 0), 0),
      completedRevenue: oWeek.filter(o => o.status === 'completed').reduce((s, o) => s + (o.total_amount || 0), 0)
    };
    salesMonth = {
      totalOrders: oMonth.length,
      totalRevenue: oMonth.reduce((s, o) => s + (o.total_amount || 0), 0),
      completedRevenue: oMonth.filter(o => o.status === 'completed').reduce((s, o) => s + (o.total_amount || 0), 0)
    };

    const orderIds = (ordersForItems.data || []).map(o => o.id);
    if (orderIds.length > 0) {
      const { data: orderItems } = await supabase
        .from('order_items')
        .select('menu_item_id, quantity, price, order_id')
        .in('order_id', orderIds);
      const itemIds = [...new Set((orderItems || []).map(i => i.menu_item_id))];
      const { data: items } = await supabase.from('menu_items').select('id, name, price').eq('business_id', businessId).in('id', itemIds);
      const nameMap = {};
      (items || []).forEach(i => { nameMap[i.id] = i; });
      const agg = {};
      (orderItems || []).forEach(oi => {
        const name = nameMap[oi.menu_item_id]?.name;
        if (!name) return;
        if (!agg[name]) agg[name] = { quantity: 0, revenue: 0, orders: new Set() };
        agg[name].quantity += oi.quantity;
        agg[name].revenue += oi.quantity * oi.price;
        agg[name].orders.add(oi.order_id);
      });
      popularItems = Object.entries(agg)
        .map(([name, v]) => ({ name, quantity: v.quantity, revenue: v.revenue, orderCount: v.orders.size }))
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 15);
    }

    const ordersPeak = ordersForPeak.data || [];
    const hourAgg = {};
    ordersPeak.forEach(o => {
      const h = new Date(o.created_at).getHours();
      hourAgg[h] = (hourAgg[h] || 0) + 1;
    });
    peakHours = Object.entries(hourAgg)
      .map(([hour, count]) => ({ hour: parseInt(hour, 10), orderCount: count }))
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 10);

    const orderIdsM = (ordersForMargins.data || []).map(o => o.id);
    if (orderIdsM.length > 0) {
      const { data: oiList } = await supabase.from('order_items').select('menu_item_id, quantity, price').in('order_id', orderIdsM);
      const miIds = [...new Set((oiList || []).map(i => i.menu_item_id))];
      const { data: miList } = await supabase.from('menu_items').select('id, name, price, cost').eq('business_id', businessId).in('id', miIds);
      const costMap = {};
      (miList || []).forEach(m => { costMap[m.id] = m; });
      const marginAgg = {};
      (oiList || []).forEach(oi => {
        const m = costMap[oi.menu_item_id];
        if (!m) return;
        if (!marginAgg[m.name]) marginAgg[m.name] = { revenue: 0, cost: 0 };
        marginAgg[m.name].revenue += oi.quantity * oi.price;
        marginAgg[m.name].cost += oi.quantity * (m.cost || 0);
      });
      profitMargins = Object.entries(marginAgg)
        .map(([name, v]) => ({
          name,
          revenue: v.revenue,
          cost: v.cost,
          profit: v.revenue - v.cost,
          marginPct: v.revenue > 0 ? ((v.revenue - v.cost) / v.revenue) * 100 : 0
        }))
        .sort((a, b) => b.profit - a.profit)
        .slice(0, 10);
    }

    // Customer intelligence (by customer_email): repeat rate, avg spend, visit frequency
    const { data: ordersForCustomers } = await supabase
      .from('orders')
      .select('id, customer_email, total_amount, created_at')
      .eq('business_id', businessId)
      .neq('status', 'cancelled')
      .gte('created_at', monthStart.toISOString());
    const ordersWithEmail = (ordersForCustomers || []).filter(o => o.customer_email && String(o.customer_email).trim());
    if (ordersWithEmail.length > 0) {
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
      const totalOrdersCI = ordersWithEmail.length;
      const totalRevenueCI = ordersWithEmail.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
      const avgSpend = uniqueCustomers > 0 ? totalRevenueCI / totalOrdersCI : 0;
      const ordersPerCustomer = uniqueCustomers > 0 ? totalOrdersCI / uniqueCustomers : 0;
      const repeatRatePct = uniqueCustomers > 0 ? (repeatCustomers / uniqueCustomers) * 100 : 0;
      const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
      let returnWithin10Days = 0;
      customers.forEach(c => {
        const sorted = c.orders.sort((a, b) => a - b);
        for (let i = 1; i < sorted.length; i++) {
          if (sorted[i] - sorted[i - 1] <= tenDaysMs) {
            returnWithin10Days++;
            break;
          }
        }
      });
      const returnWithin10DaysPct = uniqueCustomers > 0 ? (returnWithin10Days / uniqueCustomers) * 100 : 0;
      customerIntelligence = {
        uniqueCustomers,
        repeatCustomers,
        repeatRatePct,
        totalOrders: totalOrdersCI,
        totalRevenue: totalRevenueCI,
        avgSpendPerOrder: avgSpend,
        ordersPerCustomer,
        returnWithin10DaysPct
      };
    }
  }

  return {
    businessName,
    menuByCategory,
    salesWeek,
    salesMonth,
    popularItems,
    peakHours,
    profitMargins,
    customerIntelligence,
    hasAnalytics
  };
}

function formatContextForPrompt(ctx) {
  const parts = [
    `Business: ${ctx.businessName}`,
    '',
    'Menu (by category):',
    JSON.stringify(ctx.menuByCategory, null, 2)
  ];
  if (ctx.hasAnalytics) {
    parts.push('', 'Sales (last 7 days):', JSON.stringify(ctx.salesWeek, null, 2));
    parts.push('', 'Sales (last 30 days):', JSON.stringify(ctx.salesMonth, null, 2));
    parts.push('', 'Popular items (last 30 days):', JSON.stringify(ctx.popularItems, null, 2));
    parts.push('', 'Peak hours (order count by hour, last 30 days):', JSON.stringify(ctx.peakHours, null, 2));
    parts.push('', 'Profit margins by item (last 30 days):', JSON.stringify(ctx.profitMargins, null, 2));
    if (ctx.customerIntelligence) {
      parts.push('', 'Customer intelligence (last 30 days, by customer email):', JSON.stringify(ctx.customerIntelligence, null, 2));
    }
  } else {
    parts.push('', '(No sales/analytics data available for this business.)');
  }
  return parts.join('\n');
}

module.exports = { getAIContext, formatContextForPrompt };
