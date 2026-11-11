const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { selectInChunks } = require('./supabaseInChunks');

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  return e || null;
}

function statsFromOrderRows(rows) {
  const orders = rows || [];
  const totalOrders = orders.length;
  if (totalOrders < 1) return null;
  const totalAmount = orders.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
  return {
    avgOrderValue: totalAmount / totalOrders,
    totalOrders,
    businessCount: new Set(orders.map((o) => o.business_id).filter(Boolean)).size
  };
}

async function getOrCreateNetworkCustomer(email) {
  const norm = normalizeEmail(email);
  if (!norm) return {};
  const supabase = getDb();
  // Prefer querying `email_normalized` when available (newer schema), otherwise fall back to `email`.
  let existing = null;
  {
    const { data, error } = await supabase
      .from('zuri_network_customers')
      .select('id')
      .eq('email_normalized', norm)
      .maybeSingle();
    if (!error) {
      existing = data;
    } else {
      const { data: data2, error: error2 } = await supabase
        .from('zuri_network_customers')
        .select('id')
        .eq('email', norm)
        .maybeSingle();
      if (error2) {
        console.error('getOrCreateNetworkCustomer select:', error2);
        return {};
      }
      existing = data2;
    }
  }
  if (existing?.id) return { id: existing.id };

  const id = uuidv4();
  // Insert both columns when `email_normalized` exists; retry without it for older schemas.
  let created = null;
  let insErr = null;
  {
    const attempt = await supabase
      .from('zuri_network_customers')
      .insert({ id, email: norm, email_normalized: norm })
      .select('id')
      .single();
    created = attempt.data;
    insErr = attempt.error;
    if (insErr) {
      const retry = await supabase
        .from('zuri_network_customers')
        .insert({ id, email: norm })
        .select('id')
        .single();
      created = retry.data;
      insErr = retry.error;
    }
  }

  if (!insErr && created?.id) return { id: created.id };

  const { data: again } = await supabase
    .from('zuri_network_customers')
    .select('id')
    .eq('email_normalized', norm)
    .maybeSingle();
  if (again?.id) return { id: again.id };

  const { data: again2 } = await supabase
    .from('zuri_network_customers')
    .select('id')
    .eq('email', norm)
    .maybeSingle();
  if (again2?.id) return { id: again2.id };

  if (insErr) console.error('getOrCreateNetworkCustomer insert:', insErr);
  return {};
}

async function updateCustomerStats(_zuriCustomerId) {
  return undefined;
}

async function getStatsByEmail(customerEmail) {
  const norm = normalizeEmail(customerEmail);
  if (!norm) return null;
  const supabase = getDb();
  const { data: cust } = await supabase
    .from('zuri_network_customers')
    .select('id')
    .eq('email', norm)
    .maybeSingle();
  if (!cust?.id) return null;

  const { data: rows, error } = await supabase
    .from('orders')
    .select('total_amount, business_id')
    .eq('zuri_customer_id', cust.id);
  if (error) {
    console.error('getStatsByEmail orders:', error);
    return null;
  }
  return statsFromOrderRows(rows);
}

async function getStatsForCustomerIds(customerIds) {
  const map = new Map();
  const ids = [...new Set((customerIds || []).filter(Boolean))];
  if (ids.length === 0) return map;

  const supabase = getDb();
  const { data: rows, error } = await selectInChunks(
    supabase,
    'orders',
    'zuri_customer_id, total_amount, business_id',
    'zuri_customer_id',
    ids
  );

  if (error) {
    console.error('getStatsForCustomerIds:', error);
    return map;
  }

  const byCustomer = {};
  for (const o of rows || []) {
    const cid = o.zuri_customer_id;
    if (!cid) continue;
    if (!byCustomer[cid]) byCustomer[cid] = [];
    byCustomer[cid].push(o);
  }

  for (const id of ids) {
    const stats = statsFromOrderRows(byCustomer[id]);
    if (stats) map.set(id, stats);
  }
  return map;
}

module.exports = {
  getOrCreateNetworkCustomer,
  updateCustomerStats,
  getStatsByEmail,
  getStatsForCustomerIds
};
