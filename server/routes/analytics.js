const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { requireBusinessAuth } = require('../middleware/auth');

const supabase = getDb();

function assertOwnBusiness(req, res, businessId) {
  if (businessId !== req.businessId) {
    res.status(403).json({ error: 'You can only view analytics for your own business' });
    return false;
  }
  return true;
}

function startOfUtcDay(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function periodStart(period) {
  const now = new Date();
  if (period === 'week') {
    return addDays(startOfUtcDay(now), -7);
  }
  if (period === 'year') {
    return new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  }
  // month (default): calendar month UTC
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** @param {string} iso */
function toDateKey(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

/** @param {string} iso */
function hourBucketUtc(iso) {
  if (!iso) return '0';
  const h = new Date(iso).getUTCHours();
  return String(h);
}

// Sales summary for period (month | week | year)
router.get('/sales/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (!assertOwnBusiness(req, res, businessId)) return;

    const period = typeof req.query.period === 'string' ? req.query.period : 'month';
    const start = periodStart(period);

    const { data: orders, error } = await supabase
      .from('orders')
      .select('status, total_amount')
      .eq('business_id', businessId)
      .gte('created_at', start.toISOString());

    if (error) {
      console.error('analytics sales error:', error);
      return res.status(500).json({ error: 'Failed to load analytics' });
    }

    const list = orders || [];
    const totalOrders = list.length;
    const totalRevenue = list.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const completed = list.filter((o) => o.status === 'completed');
    const completedRevenue = completed.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    res.json({
      totalOrders,
      totalRevenue,
      averageOrderValue,
      completedRevenue
    });
  } catch (e) {
    console.error('analytics sales error:', e);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

router.get('/sales-by-date/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (!assertOwnBusiness(req, res, businessId)) return;

    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
    const end = new Date();
    const start = addDays(startOfUtcDay(end), -(days - 1));

    const { data: orders, error } = await supabase
      .from('orders')
      .select('status, total_amount, created_at')
      .eq('business_id', businessId)
      .gte('created_at', start.toISOString());

    if (error) {
      console.error('analytics sales-by-date error:', error);
      return res.status(500).json({ error: 'Failed to load analytics' });
    }

    const byDate = new Map();
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i);
      byDate.set(toDateKey(d.toISOString()), {
        date: toDateKey(d.toISOString()),
        orderCount: 0,
        revenue: 0,
        completedRevenue: 0
      });
    }

    for (const o of orders || []) {
      const key = toDateKey(o.created_at);
      if (!byDate.has(key)) continue;
      const row = byDate.get(key);
      row.orderCount += 1;
      const amt = Number(o.total_amount) || 0;
      row.revenue += amt;
      if (o.status === 'completed') row.completedRevenue += amt;
    }

    res.json(Array.from(byDate.values()));
  } catch (e) {
    console.error('analytics sales-by-date error:', e);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

router.get('/popular-items/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (!assertOwnBusiness(req, res, businessId)) return;

    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 90));
    const start = addDays(new Date(), -days);

    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select('id')
      .eq('business_id', businessId)
      .gte('created_at', start.toISOString());

    if (oErr) {
      console.error('analytics popular orders error:', oErr);
      return res.status(500).json({ error: 'Failed to load analytics' });
    }

    const orderIds = (orders || []).map((o) => o.id);
    if (orderIds.length === 0) return res.json([]);

    const { data: lines, error: liErr } = await supabase
      .from('order_items')
      .select('menu_item_id, quantity, price')
      .in('order_id', orderIds);

    if (liErr) {
      console.error('analytics popular items error:', liErr);
      return res.status(500).json({ error: 'Failed to load analytics' });
    }

    const itemIds = [...new Set((lines || []).map((l) => l.menu_item_id).filter(Boolean))];
    if (itemIds.length === 0) return res.json([]);

    const { data: menuItems, error: mErr } = await supabase
      .from('menu_items')
      .select('id, name, price')
      .eq('business_id', businessId)
      .in('id', itemIds);

    if (mErr) {
      console.error('analytics menu lookup error:', mErr);
      return res.status(500).json({ error: 'Failed to load analytics' });
    }

    const menuMap = (menuItems || []).reduce((acc, m) => {
      acc[m.id] = m;
      return acc;
    }, {});

    const agg = new Map();
    for (const line of lines || []) {
      const mid = line.menu_item_id;
      const menu = menuMap[mid];
      if (!menu) continue;
      const qty = Number(line.quantity) || 0;
      const unit = Number(line.price) || 0;
      const prev = agg.get(mid) || {
        id: mid,
        name: menu.name,
        price: Number(menu.price) || 0,
        totalQuantity: 0,
        totalRevenue: 0,
        orderCount: 0
      };
      prev.totalQuantity += qty;
      prev.totalRevenue += qty * unit;
      prev.orderCount += 1;
      agg.set(mid, prev);
    }

    const sorted = [...agg.values()].sort((a, b) => b.totalQuantity - a.totalQuantity);
    res.json(sorted.slice(0, limit));
  } catch (e) {
    console.error('analytics popular-items error:', e);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

router.get('/peak-hours/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (!assertOwnBusiness(req, res, businessId)) return;

    const days = Math.min(90, Math.max(1, parseInt(req.query.days, 10) || 30));
    const start = addDays(new Date(), -days);

    const { data: orders, error } = await supabase
      .from('orders')
      .select('total_amount, created_at')
      .eq('business_id', businessId)
      .gte('created_at', start.toISOString());

    if (error) {
      console.error('analytics peak-hours error:', error);
      return res.status(500).json({ error: 'Failed to load analytics' });
    }

    const buckets = new Map();
    for (let h = 0; h < 24; h++) {
      buckets.set(String(h), { hour: String(h), orderCount: 0, revenue: 0 });
    }

    for (const o of orders || []) {
      const hk = hourBucketUtc(o.created_at);
      const b = buckets.get(hk);
      if (!b) continue;
      b.orderCount += 1;
      b.revenue += Number(o.total_amount) || 0;
    }

    res.json(Array.from(buckets.values()));
  } catch (e) {
    console.error('analytics peak-hours error:', e);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

router.get('/profit-margins/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (!assertOwnBusiness(req, res, businessId)) return;

    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 90));
    const start = addDays(new Date(), -days);

    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select('id')
      .eq('business_id', businessId)
      .gte('created_at', start.toISOString());

    if (oErr) {
      console.error('analytics profit orders error:', oErr);
      return res.status(500).json({ error: 'Failed to load analytics' });
    }

    const orderIds = (orders || []).map((o) => o.id);
    if (orderIds.length === 0) return res.json([]);

    const { data: lines, error: liErr } = await supabase
      .from('order_items')
      .select('menu_item_id, quantity, price')
      .in('order_id', orderIds);

    if (liErr) {
      console.error('analytics profit lines error:', liErr);
      return res.status(500).json({ error: 'Failed to load analytics' });
    }

    const itemIds = [...new Set((lines || []).map((l) => l.menu_item_id).filter(Boolean))];
    if (itemIds.length === 0) return res.json([]);

    const { data: menuItems, error: mErr } = await supabase
      .from('menu_items')
      .select('id, name, price, cost')
      .eq('business_id', businessId)
      .in('id', itemIds);

    if (mErr) {
      console.error('analytics profit menu error:', mErr);
      return res.status(500).json({ error: 'Failed to load analytics' });
    }

    const menuMap = (menuItems || []).reduce((acc, m) => {
      acc[m.id] = m;
      return acc;
    }, {});

    const agg = new Map();
    for (const line of lines || []) {
      const mid = line.menu_item_id;
      const menu = menuMap[mid];
      if (!menu) continue;
      const qty = Number(line.quantity) || 0;
      const unitPrice = Number(line.price) || 0;
      const unitCost = menu.cost != null ? Number(menu.cost) || 0 : 0;
      const prev = agg.get(mid) || {
        id: mid,
        name: menu.name,
        price: Number(menu.price) || 0,
        cost: unitCost,
        totalQuantity: 0,
        totalRevenue: 0,
        totalCost: 0,
        profit: 0,
        marginPercentage: 0
      };
      prev.totalQuantity += qty;
      prev.totalRevenue += qty * unitPrice;
      prev.totalCost += qty * unitCost;
      agg.set(mid, prev);
    }

    const out = [...agg.values()].map((row) => {
      const profit = row.totalRevenue - row.totalCost;
      const marginPercentage =
        row.totalRevenue > 0 ? (profit / row.totalRevenue) * 100 : 0;
      return { ...row, profit, marginPercentage };
    });

    out.sort((a, b) => b.marginPercentage - a.marginPercentage);
    res.json(out);
  } catch (e) {
    console.error('analytics profit-margins error:', e);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

router.get('/customer-intelligence/:businessId', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.params;
    if (!assertOwnBusiness(req, res, businessId)) return;

    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const start = addDays(new Date(), -days);

    const { data: orders, error } = await supabase
      .from('orders')
      .select('customer_email, customer_phone, total_amount, created_at')
      .eq('business_id', businessId)
      .gte('created_at', start.toISOString());

    if (error) {
      console.error('analytics customer-intelligence error:', error);
      return res.status(500).json({ error: 'Failed to load analytics' });
    }

    const list = orders || [];
    const keyFor = (o) => {
      const e = (o.customer_email && String(o.customer_email).trim().toLowerCase()) || '';
      if (e) return `e:${e}`;
      const p = (o.customer_phone && String(o.customer_phone).trim()) || '';
      if (p) return `p:${p}`;
      return null;
    };

    const byCustomer = new Map();
    for (const o of list) {
      const k = keyFor(o);
      if (!k) continue;
      if (!byCustomer.has(k)) byCustomer.set(k, []);
      byCustomer.get(k).push(o);
    }

    const uniqueCustomers = byCustomer.size;
    let repeatCustomers = 0;
    let returnWithin10 = 0;
    for (const [, custOrders] of byCustomer) {
      if (custOrders.length >= 2) repeatCustomers += 1;
      if (custOrders.length >= 2) {
        const sorted = [...custOrders].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        const first = new Date(sorted[0].created_at).getTime();
        const second = new Date(sorted[1].created_at).getTime();
        if (second - first <= 10 * 24 * 60 * 60 * 1000) returnWithin10 += 1;
      }
    }

    const totalOrders = list.length;
    const totalRevenue = list.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const avgSpendPerOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const ordersPerCustomer = uniqueCustomers > 0 ? totalOrders / uniqueCustomers : 0;
    const repeatRatePct =
      uniqueCustomers > 0 ? Math.round((repeatCustomers / uniqueCustomers) * 1000) / 10 : 0;
    const returnWithin10DaysPct =
      uniqueCustomers > 0 ? Math.round((returnWithin10 / uniqueCustomers) * 1000) / 10 : 0;

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
  } catch (e) {
    console.error('analytics customer-intelligence error:', e);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

module.exports = router;
