/**
 * Business Graph (Phase 3): anonymous platform-wide market insights.
 * Pro+ only. No PII or per-business data exposed; only aggregates.
 */

const { getDb } = require('../database');

/**
 * Get anonymous market insights for the platform and optional comparison for one business.
 * @param { number } days - last N days for primary period (e.g. 30)
 * @param { string } [businessId] - if provided, include this business's stats for comparison (no other business data)
 * @returns { Promise<{ platform, yourBusiness?, insights }> }
 */
async function getMarketInsights(days = 30, businessId = null) {
  const supabase = getDb();
  const now = new Date();
  const periodEnd = now;
  const periodStart = new Date(now);
  periodStart.setDate(periodStart.getDate() - days);
  const prevStart = new Date(periodStart);
  prevStart.setDate(prevStart.getDate() - days);

  const periodStartStr = periodStart.toISOString();
  const periodEndStr = periodEnd.toISOString();
  const prevStartStr = prevStart.toISOString();

  // Platform: orders in period (non-cancelled)
  const { data: platformOrders } = await supabase
    .from('orders')
    .select('id, total_amount, created_at')
    .neq('status', 'cancelled')
    .gte('created_at', periodStartStr)
    .lte('created_at', periodEndStr);

  const prevOrdersRes = await supabase
    .from('orders')
    .select('id, total_amount')
    .neq('status', 'cancelled')
    .gte('created_at', prevStartStr)
    .lt('created_at', periodStartStr);
  const prevOrders = prevOrdersRes.data || [];

  const o = platformOrders || [];
  const totalOrders = o.length;
  const totalRevenue = o.reduce((s, x) => s + Number(x.total_amount || 0), 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const prevTotal = prevOrders.length;
  const orderCountTrendPct = prevTotal > 0
    ? Math.round(((totalOrders - prevTotal) / prevTotal) * 100)
    : (totalOrders > 0 ? 100 : 0);

  const hourCounts = {};
  o.forEach(x => {
    const h = new Date(x.created_at).getHours();
    hourCounts[h] = (hourCounts[h] || 0) + 1;
  });
  const peakHours = Object.entries(hourCounts)
    .map(([hour, orderCount]) => ({ hour: parseInt(hour, 10), orderCount }))
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 5);

  const orderIds = o.map(x => x.id);
  let topItemNames = [];
  if (orderIds.length > 0) {
    const { data: orderItems } = await supabase
      .from('order_items')
      .select('menu_item_id, quantity')
      .in('order_id', orderIds);
    const miIds = [...new Set((orderItems || []).map(i => i.menu_item_id))];
    const { data: menuItems } = await supabase
      .from('menu_items')
      .select('id, name')
      .in('id', miIds);
    const nameById = {};
    (menuItems || []).forEach(m => { nameById[m.id] = m.name; });
    const nameCount = {};
    (orderItems || []).forEach(oi => {
      const name = nameById[oi.menu_item_id] || 'Other';
      nameCount[name] = (nameCount[name] || 0) + (oi.quantity || 1);
    });
    topItemNames = Object.entries(nameCount)
      .map(([name, count]) => ({ name, orderCount: count }))
      .sort((a, b) => b.orderCount - a.orderCount)
      .slice(0, 5);
  }

  const platform = {
    totalOrders,
    totalRevenue,
    avgOrderValue,
    orderCountTrendPct,
    peakHours,
    topItemNames,
    periodDays: days
  };

  let yourBusiness = null;
  if (businessId) {
    const { data: bizOrders } = await supabase
      .from('orders')
      .select('id, total_amount')
      .eq('business_id', businessId)
      .neq('status', 'cancelled')
      .gte('created_at', periodStartStr)
      .lte('created_at', periodEndStr);
    const bo = bizOrders || [];
    const bTotal = bo.length;
    const bRevenue = bo.reduce((s, x) => s + Number(x.total_amount || 0), 0);
    yourBusiness = {
      totalOrders: bTotal,
      totalRevenue: bRevenue,
      avgOrderValue: bTotal > 0 ? bRevenue / bTotal : 0
    };
  }

  const insights = [];
  if (platform.totalOrders > 0) {
    if (orderCountTrendPct !== 0) {
      insights.push(
        orderCountTrendPct > 0
          ? `Orders across Zuri are up ${orderCountTrendPct}% compared to the previous ${days} days.`
          : `Orders across Zuri are down ${Math.abs(orderCountTrendPct)}% compared to the previous ${days} days.`
      );
    }
    if (peakHours.length > 0) {
      const top = peakHours[0];
      const hourLabel = top.hour <= 11 ? `${top.hour} AM` : top.hour === 12 ? '12 PM' : `${top.hour - 12} PM`;
      insights.push(`Peak dining time across the platform is around ${hourLabel}.`);
    }
    if (topItemNames.length > 0) {
      insights.push(`Most ordered items on Zuri: ${topItemNames.map(x => x.name).slice(0, 3).join(', ')}.`);
    }
    insights.push(`Platform average order value (last ${days} days): ₦${Math.round(platform.avgOrderValue).toLocaleString()}.`);
  } else {
    insights.push('Not enough platform data yet. Keep growing—insights appear as more businesses use Zuri.');
  }

  return { platform, yourBusiness, insights };
}

module.exports = { getMarketInsights };
