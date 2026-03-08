/**
 * Zuri Network: cross-business customer identity.
 * Resolution (getOrCreateNetworkCustomer), stats update, and stats lookup.
 */

const { getDb } = require('../database');

function normalizeEmail(email) {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  return e || null;
}

/**
 * Get or create a Zuri Network customer by email. Returns { id } or { error }.
 * @param { string } email - raw customer email
 * @returns { Promise<{ id: string } | { error: string }> }
 */
async function getOrCreateNetworkCustomer(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return { error: 'Invalid email' };

  const supabase = getDb();
  const { data: existing } = await supabase
    .from('zuri_network_customers')
    .select('id')
    .eq('email_normalized', normalized)
    .single();

  if (existing) {
    return { id: existing.id };
  }

  const now = new Date().toISOString();
  const { data: inserted, error } = await supabase
    .from('zuri_network_customers')
    .insert({
      email_normalized: normalized,
      first_seen_at: now,
      last_seen_at: now,
      updated_at: now
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const { data: retry } = await supabase
        .from('zuri_network_customers')
        .select('id')
        .eq('email_normalized', normalized)
        .single();
      if (retry) return { id: retry.id };
    }
    console.error('zuri_network getOrCreateNetworkCustomer', error);
    return { error: error.message || 'Failed to create network customer' };
  }
  return { id: inserted.id };
}

/**
 * Recompute and upsert stats for a Zuri Network customer.
 * @param { string } zuriCustomerId - UUID
 */
async function updateCustomerStats(zuriCustomerId) {
  if (!zuriCustomerId) return;
  const supabase = getDb();

  const { data: orders, error: ordersError } = await supabase
    .from('orders')
    .select('total_amount, created_at, business_id')
    .eq('zuri_customer_id', zuriCustomerId)
    .neq('status', 'cancelled');

  if (ordersError || !orders || orders.length === 0) {
    await supabase.from('zuri_network_customer_stats').upsert({
      zuri_customer_id: zuriCustomerId,
      total_orders: 0,
      total_spend: 0,
      avg_order_value: 0,
      business_count: 0,
      last_order_at: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'zuri_customer_id' });
    return;
  }

  const totalOrders = orders.length;
  const totalSpend = orders.reduce((s, o) => s + Number(o.total_amount || 0), 0);
  const avgOrderValue = totalOrders > 0 ? totalSpend / totalOrders : 0;
  const businessIds = new Set(orders.map(o => o.business_id));
  const lastOrderAt = orders.reduce((max, o) => {
    const t = o.created_at ? new Date(o.created_at).getTime() : 0;
    return t > max ? t : max;
  }, 0);

  await supabase.from('zuri_network_customer_stats').upsert({
    zuri_customer_id: zuriCustomerId,
    total_orders: totalOrders,
    total_spend: totalSpend,
    avg_order_value: avgOrderValue,
    business_count: businessIds.size,
    last_order_at: lastOrderAt ? new Date(lastOrderAt).toISOString() : null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'zuri_customer_id' });
}

/**
 * Get stats for one or more Zuri customer IDs. Returns Map<id, stats>.
 * @param { string[] } zuriCustomerIds
 * @returns { Promise<Map<string, { totalOrders, totalSpend, avgOrderValue, businessCount }>> }
 */
async function getStatsForCustomerIds(zuriCustomerIds) {
  const ids = [...new Set(zuriCustomerIds)].filter(Boolean);
  if (ids.length === 0) return new Map();

  const supabase = getDb();
  const { data: rows } = await supabase
    .from('zuri_network_customer_stats')
    .select('zuri_customer_id, total_orders, total_spend, avg_order_value, business_count')
    .in('zuri_customer_id', ids);

  const map = new Map();
  (rows || []).forEach(r => {
    map.set(r.zuri_customer_id, {
      totalOrders: r.total_orders || 0,
      totalSpend: Number(r.total_spend) || 0,
      avgOrderValue: Number(r.avg_order_value) || 0,
      businessCount: r.business_count || 0
    });
  });
  return map;
}

/**
 * Get stats by normalized email (for storefront / API). Returns null if not found or no stats.
 * @param { string } email
 * @returns { Promise<{ returningZuriCustomer: true, avgOrderValue, totalOrders, businessCount } | null> }
 */
async function getStatsByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const supabase = getDb();
  const { data: customer } = await supabase
    .from('zuri_network_customers')
    .select('id')
    .eq('email_normalized', normalized)
    .single();
  if (!customer) return null;

  const { data: stats } = await supabase
    .from('zuri_network_customer_stats')
    .select('total_orders, total_spend, avg_order_value, business_count')
    .eq('zuri_customer_id', customer.id)
    .single();

  if (!stats || stats.total_orders < 1) return null;
  return {
    returningZuriCustomer: true,
    avgOrderValue: Number(stats.avg_order_value) || 0,
    totalOrders: stats.total_orders || 0,
    businessCount: stats.business_count || 0
  };
}

module.exports = {
  normalizeEmail,
  getOrCreateNetworkCustomer,
  updateCustomerStats,
  getStatsForCustomerIds,
  getStatsByEmail
};
