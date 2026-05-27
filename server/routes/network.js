const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { requireBusinessAuth } = require('../middleware/auth');

const supabase = getDb();

function addDays(d, n) {
  const x = new Date(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function hourUtc(iso) {
  if (!iso) return 0;
  return new Date(iso).getUTCHours();
}

/**
 * Anonymous platform aggregates for Growth+ dashboard (Business Graph).
 * GET /market-insights?days=30
 */
router.get('/market-insights', requireBusinessAuth, async (req, res) => {
  try {
    const periodDays = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
    const start = addDays(new Date(), -periodDays);
    const mid = addDays(new Date(), -Math.floor(periodDays / 2));

    const { data: orders, error: oErr } = await supabase
      .from('orders')
      .select('id, created_at, total_amount, business_id')
      .gte('created_at', start.toISOString())
      .limit(8000);

    if (oErr) {
      console.error('network market-insights orders error:', oErr);
      return res.status(500).json({ error: 'Failed to load market insights' });
    }

    const list = orders || [];
    const firstHalf = list.filter((o) => new Date(o.created_at) < mid);
    const secondHalf = list.filter((o) => new Date(o.created_at) >= mid);
    const trendBase = firstHalf.length || 1;
    const orderCountTrendPct = Math.round(((secondHalf.length - firstHalf.length) / trendBase) * 1000) / 10;

    const totalOrders = list.length;
    const totalRevenue = list.reduce((s, o) => s + (Number(o.total_amount) || 0), 0);
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    const hourBuckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, orderCount: 0 }));
    for (const o of list) {
      const h = hourUtc(o.created_at);
      hourBuckets[h].orderCount += 1;
    }

    const orderIds = list.map((o) => o.id);
    let topItemNames = [];

    if (orderIds.length > 0) {
      const { data: lines, error: liErr } = await supabase
        .from('order_items')
        .select('menu_item_id, quantity')
        .in('order_id', orderIds.slice(0, 5000));

      if (!liErr && lines && lines.length > 0) {
        const counts = new Map();
        for (const l of lines) {
          const id = l.menu_item_id;
          if (!id) continue;
          counts.set(id, (counts.get(id) || 0) + (Number(l.quantity) || 0));
        }
        const topIds = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 40)
          .map(([id]) => id);

        if (topIds.length > 0) {
          const { data: names } = await supabase
            .from('menu_items')
            .select('id, name')
            .in('id', topIds);

          const nameById = (names || []).reduce((acc, m) => {
            acc[m.id] = m.name || 'Item';
            return acc;
          }, {});

          topItemNames = topIds
            .map((id) => ({
              name: nameById[id] || 'Menu item',
              orderCount: counts.get(id) || 0
            }))
            .filter((x) => x.orderCount > 0)
            .slice(0, 20);
        }
      }
    }

    const insights = [];
    if (totalOrders > 0) {
      insights.push(
        `Across the network, businesses recorded ${totalOrders.toLocaleString()} orders in the last ${periodDays} days.`
      );
      insights.push(
        `Platform-wide average order value is about ₦${Math.round(avgOrderValue).toLocaleString()}.`
      );
      const peak = hourBuckets.reduce((a, b) => (b.orderCount > a.orderCount ? b : a), hourBuckets[0]);
      if (peak && peak.orderCount > 0) {
        insights.push(`Peak ordering activity on the platform tends to cluster around ${peak.hour}:00 UTC.`);
      }
    } else {
      insights.push('Not enough platform order data yet for network-level trends.');
    }

    const bid = req.businessId;
    const yours = list.filter((o) => o.business_id === bid);
    const yourBusiness =
      yours.length > 0
        ? {
            totalOrders: yours.length,
            totalRevenue: yours.reduce((s, o) => s + (Number(o.total_amount) || 0), 0),
            avgOrderValue:
              yours.length > 0
                ? yours.reduce((s, o) => s + (Number(o.total_amount) || 0), 0) / yours.length
                : 0
          }
        : undefined;

    res.json({
      platform: {
        totalOrders,
        totalRevenue,
        avgOrderValue,
        orderCountTrendPct,
        peakHours: hourBuckets,
        topItemNames,
        periodDays
      },
      yourBusiness,
      insights
    });
  } catch (e) {
    console.error('network market-insights error:', e);
    res.status(500).json({ error: 'Failed to load market insights' });
  }
});

module.exports = router;
