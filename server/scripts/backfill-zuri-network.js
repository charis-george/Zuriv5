/**
 * Backfill Zuri Network: set zuri_customer_id on existing orders that have customer_email,
 * then recompute stats for all affected network customers.
 * Run once after applying migration 011_zuri_network.sql.
 *
 * Usage: node server/scripts/backfill-zuri-network.js
 * Requires: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in server/.env
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in server/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function normalizeEmail(email) {
  if (typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  return e || null;
}

async function getOrCreateNetworkCustomer(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const { data: existing } = await supabase
    .from('zuri_network_customers')
    .select('id')
    .eq('email_normalized', normalized)
    .single();
  if (existing) return existing.id;
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
      return retry?.id || null;
    }
    console.error('Create network customer error', error);
    return null;
  }
  return inserted?.id || null;
}

async function updateCustomerStats(zuriCustomerId) {
  const { data: orders } = await supabase
    .from('orders')
    .select('total_amount, created_at, business_id')
    .eq('zuri_customer_id', zuriCustomerId)
    .neq('status', 'cancelled');
  if (!orders || orders.length === 0) {
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
  const businessCount = new Set(orders.map(o => o.business_id)).size;
  const lastOrderAt = orders.reduce((max, o) => {
    const t = o.created_at ? new Date(o.created_at).getTime() : 0;
    return t > max ? t : max;
  }, 0);
  await supabase.from('zuri_network_customer_stats').upsert({
    zuri_customer_id: zuriCustomerId,
    total_orders: totalOrders,
    total_spend: totalSpend,
    avg_order_value: avgOrderValue,
    business_count: businessCount,
    last_order_at: lastOrderAt ? new Date(lastOrderAt).toISOString() : null,
    updated_at: new Date().toISOString()
  }, { onConflict: 'zuri_customer_id' });
}

async function main() {
  const { data: orders, error } = await supabase
    .from('orders')
    .select('id, customer_email, zuri_customer_id')
    .not('customer_email', 'is', null);
  if (error) {
    console.error('Fetch orders error', error);
    process.exit(1);
  }
  const toBackfill = (orders || []).filter(o => o.customer_email && String(o.customer_email).trim() && !o.zuri_customer_id);
  console.log('Found', toBackfill.length, 'orders with email and no zuri_customer_id');
  const customerIdsToUpdate = new Set();
  let updated = 0;
  for (const order of toBackfill) {
    const zuriCustomerId = await getOrCreateNetworkCustomer(order.customer_email);
    if (!zuriCustomerId) continue;
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ zuri_customer_id: zuriCustomerId })
      .eq('id', order.id);
    if (updateErr) {
      console.error('Update order error', order.id, updateErr);
      continue;
    }
    updated++;
    customerIdsToUpdate.add(zuriCustomerId);
  }
  console.log('Updated', updated, 'orders');
  console.log('Recomputing stats for', customerIdsToUpdate.size, 'network customers...');
  for (const id of customerIdsToUpdate) {
    await updateCustomerStats(id);
  }
  console.log('Done.');
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
