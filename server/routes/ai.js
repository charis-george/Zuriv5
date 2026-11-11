const express = require('express');
const multer = require('multer');
const router = express.Router();

const { getDb } = require('../database');
const { generateStorefrontWithClaude } = require('../lib/storefrontAiGenerate');
const { requireBusinessAuth } = require('../middleware/auth');
const { selectInChunks } = require('../lib/supabaseInChunks');
const {
  getBusinessPlan,
  canAccessAIFeatures,
  canAccessZuriQo,
  canUseStorefrontAIGeneration,
  canAccessOpsAi
} = require('../lib/plans');
const {
  getDailyAiQuota,
  consumeDailyAiCredit,
  assertStorefrontAiAllowed,
  getStorefrontAiLifetimeLimit
} = require('../lib/aiUsageLimits');

const supabase = getDb();

const allowedInsightTypes = new Set([
  'revenue_insights',
  'sales_forecasting',
  'promotions_suggestions',
  'custom'
]);

function isOpsAiPlan(plan) {
  return canAccessOpsAi(plan);
}

function clampInt(n, min, max, fallback) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(x)));
}

function sumMoney(list, key) {
  return list.reduce((acc, row) => acc + (Number(row && row[key]) || 0), 0);
}

function weekdayHourKeyUtc(iso) {
  const d = new Date(iso);
  const day = d.getUTCDay(); // 0..6
  const hour = d.getUTCHours(); // 0..23
  return `${day}_${hour}`;
}

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

const storefrontAiUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 3 }
});

function handleStorefrontAiUpload(req, res, next) {
  storefrontAiUpload.array('referenceImages', 3)(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Each reference image must be 6 MB or smaller.' });
    }
    return res.status(400).json({ error: err.message || 'Invalid upload' });
  });
}

async function assertOwnBusinessAndPlan(req, res, businessId) {
  if (!businessId || typeof businessId !== 'string') {
    res.status(400).json({ error: 'businessId is required' });
    return null;
  }
  if (businessId !== req.businessId) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  const plan = await getBusinessPlan(businessId);
  return { plan };
}

function buildPrompt({ type, businessName, stats, query }) {
  const header = [
    'You are Zuri AI, a business analytics assistant for restaurants/food businesses.',
    'Use the provided stats. If a stat is missing, say so briefly and make conservative suggestions.',
    'Return a clear, practical answer for the business owner. Avoid mentioning you used an API or database.',
    'Format rules:',
    '- Start with a 1-2 sentence summary.',
    '- Then provide 4-7 bullet points with specific actions.',
    '- End with 1 short “Next step” recommendation.'
  ].join('\n');

  const statsBlock = [
    `Business: ${businessName || 'Unknown'}`,
    `Period (days): ${stats.periodDays}`,
    `Completed orders: ${stats.completedOrders}`,
    `Total revenue: ₦${Math.round(stats.totalRevenue).toLocaleString()}`,
    `Avg order value: ₦${Math.round(stats.avgOrderValue).toLocaleString()}`,
    `Top items (last ${stats.periodDays} days): ${
      stats.topItems.length ? stats.topItems.map((t) => `${t.name} (${t.orderCount}x)`).join(', ') : 'N/A'
    }`,
    `Peak ordering hours (UTC) top 3: ${
      stats.peakHours.length ? stats.peakHours.map((h) => `${h.hour}:00 (${h.orderCount}x)`).join(', ') : 'N/A'
    }`
  ].join('\n');

  if (type === 'custom') {
    return [
      header,
      '',
      `Business question: ${query}`,
      '',
      'Use the stats below to answer the question:',
      statsBlock
    ].join('\n');
  }

  const taskByType = {
    revenue_insights:
      'Task: Provide revenue insights, including best-selling items and bundle/upsell ideas to increase revenue.',
    sales_forecasting:
      'Task: Provide sales forecasting insights: demand patterns, likely busy times, and how to prepare staffing/inventory.',
    promotions_suggestions:
      'Task: Provide promotions suggestions for slow days: targeted offers and how to measure impact.'
  };

  return [
    header,
    '',
    taskByType[type] || 'Task: Provide actionable business insights.',
    '',
    'Context stats:',
    statsBlock
  ].join('\n');
}

router.post('/insights', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId, type, query } = req.body || {};
    if (!businessId || typeof businessId !== 'string') {
      return res.status(400).json({ error: 'businessId is required' });
    }
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only request insights for your own business' });
    }
    if (!type || typeof type !== 'string' || !allowedInsightTypes.has(type)) {
      return res.status(400).json({ error: 'Invalid insight type' });
    }
    if (type === 'custom') {
      if (!query || typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'query is required for custom type' });
      }
    }

    const plan = await getBusinessPlan(businessId);
    if (!canAccessAIFeatures(plan)) {
      return res.status(403).json({ error: 'Upgrade to Scale to unlock AI insights.' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: 'Anthropic AI not configured (missing ANTHROPIC_API_KEY).' });
    }

    // Keep prompt sizes predictable; allow override but clamp.
    const periodDays = clampInt(req.body?.periodDays, 7, 90, 30);
    const start = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000);

    // Fetch recent completed orders and basic item aggregates.
    const { data: orders, error: ordersErr } = await supabase
      .from('orders')
      .select('id,status,total_amount,created_at')
      .eq('business_id', businessId)
      .gte('created_at', start.toISOString())
      .limit(4000);

    if (ordersErr) {
      console.error('[ZURI] ai.insights orders query error:', ordersErr);
      return res.status(500).json({ error: 'Failed to load business stats' });
    }

    const list = orders || [];
    const completed = list.filter((o) => o && o.status === 'completed');
    const totalRevenue = sumMoney(completed, 'total_amount');
    const completedOrders = completed.length;
    const avgOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;

    // Peak hours: bucket by UTC hour based on order timestamps.
    const peakCounts = new Map();
    for (const o of list) {
      const iso = o && o.created_at ? String(o.created_at) : null;
      if (!iso) continue;
      const h = new Date(iso).getUTCHours();
      peakCounts.set(h, (peakCounts.get(h) || 0) + 1);
    }
    const peakHours = [...peakCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour, orderCount]) => ({ hour, orderCount }));

    // Top items: aggregate quantities from recent completed orders.
    const orderIds = completed.map((o) => o.id).filter(Boolean).slice(0, 2000);
    let topItems = [];
    if (orderIds.length > 0) {
      const { data: lines, error: liErr } = await selectInChunks(
        supabase,
        'order_items',
        'menu_item_id,quantity',
        'order_id',
        orderIds
      );

      if (liErr) {
        console.error('[ZURI] ai.insights order_items query error:', liErr);
      } else {
        const counts = new Map();
        for (const l of lines || []) {
          const mid = l && l.menu_item_id ? l.menu_item_id : null;
          if (!mid) continue;
          counts.set(mid, (counts.get(mid) || 0) + (Number(l.quantity) || 0));
        }

        const topIds = [...counts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id]) => id);

        if (topIds.length > 0) {
          const { data: namesData, error: nErr } = await supabase
            .from('menu_items')
            .select('id,name')
            .in('id', topIds);

          if (nErr) {
            console.error('[ZURI] ai.insights menu_items query error:', nErr);
          } else {
            const nameById = (namesData || []).reduce((acc, m) => {
              acc[m.id] = m.name || 'Item';
              return acc;
            }, {});
            topItems = topIds.map((id) => ({
              name: nameById[id] || 'Menu item',
              orderCount: counts.get(id) || 0
            }));
          }
        }
      }
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('name')
      .eq('id', businessId)
      .single();

    const anthropic = new (require('@anthropic-ai/sdk'))({ apiKey });
    // Use a model string supported by the Anthropic SDK docs by default.
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

    const prompt = buildPrompt({
      type,
      businessName: business?.name,
      stats: {
        periodDays,
        completedOrders,
        totalRevenue,
        avgOrderValue,
        topItems,
        peakHours
      },
      query
    });

    const msg = await anthropic.messages.create({
      model,
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    });

    const content0 = msg && Array.isArray(msg.content) ? msg.content[0] : null;
    const insight =
      (typeof content0 === 'string' ? content0 : content0 && typeof content0.text === 'string' ? content0.text : null) ||
      (msg && typeof msg.content === 'string' ? msg.content : null) ||
      '';

    const cleaned = insight.trim() || 'No response from AI.';
    res.json({ insight: cleaned });
  } catch (err) {
    console.error('[ZURI] ai.insights error:', err);
    res.status(500).json({
      error: 'Failed to generate AI insight',
      details: err && err.message ? err.message : String(err)
    });
  }
});

/**
 * GET /api/ai/signals?businessId=...
 * Lightweight, non-chatbot “always-on” signals for the dashboard.
 */
router.get('/signals', requireBusinessAuth, async (req, res) => {
  try {
    const businessId = typeof req.query.businessId === 'string' ? req.query.businessId : '';
    const ok = await assertOwnBusinessAndPlan(req, res, businessId);
    if (!ok) return;
    if (!isOpsAiPlan(ok.plan)) return res.status(403).json({ error: 'Upgrade to Scale to unlock live operations signals.' });

    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const last30m = new Date(Date.now() - 30 * 60 * 1000);
    const lookbackDays = 28;
    const lookbackStart = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000);

    const [{ data: recentOrders, error: rErr }, { data: menuItems, error: mErr }] = await Promise.all([
      supabase
        .from('orders')
        .select('id,total_amount,created_at,payment_status')
        .eq('business_id', businessId)
        .gte('created_at', lookbackStart.toISOString())
        .limit(8000),
      supabase
        .from('menu_items')
        .select('id,name,available,stock_on_hand,low_stock_threshold')
        .eq('business_id', businessId)
        .limit(5000)
    ]);

    if (rErr) return res.status(500).json({ error: 'Failed to load order signals' });
    if (mErr) return res.status(500).json({ error: 'Failed to load menu signals' });

    const orders = recentOrders || [];
    const paid = orders.filter((o) => o && o.payment_status === 'paid');
    const paidToday = paid.filter((o) => o.created_at && new Date(o.created_at) >= todayStart);
    const paidLast30m = paid.filter((o) => o.created_at && new Date(o.created_at) >= last30m);

    // Rush hour indicator: compare last 30m order rate to typical for this weekday+hour.
    const slotKeyNow = weekdayHourKeyUtc(now.toISOString());
    const sameSlotPast = paid.filter((o) => {
      if (!o.created_at) return false;
      const d = new Date(o.created_at);
      if (d >= todayStart) return false;
      return weekdayHourKeyUtc(d.toISOString()) === slotKeyNow;
    });
    const baselinePerHour = sameSlotPast.length / Math.max(1, lookbackDays / 7);
    const last30mRatePerHour = paidLast30m.length * 2;
    const rushRatio = baselinePerHour > 0 ? last30mRatePerHour / baselinePerHour : paidLast30m.length > 0 ? 2 : 0;

    // Today’s top items: compute from today’s paid orders via order_items.
    const paidTodayIds = paidToday.map((o) => o.id).filter(Boolean).slice(0, 5000);
    let topItems = [];
    if (paidTodayIds.length) {
      const { data: lines } = await selectInChunks(
        supabase,
        'order_items',
        'menu_item_id,quantity,order_id',
        'order_id',
        paidTodayIds
      );
      const counts = new Map();
      for (const l of lines || []) {
        const id = l.menu_item_id;
        if (!id) continue;
        counts.set(id, (counts.get(id) || 0) + (Number(l.quantity) || 0));
      }
      const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([id]) => id);
      if (topIds.length) {
        const { data: names } = await supabase.from('menu_items').select('id,name').in('id', topIds);
        const nameById = (names || []).reduce((acc, it) => {
          acc[it.id] = it.name || 'Item';
          return acc;
        }, {});
        topItems = topIds.map((id) => ({ id, name: nameById[id] || 'Menu item', orderCount: counts.get(id) || 0 }));
      }
    }

    // Anomaly (heuristic): compare revenue so far to avg revenue for same weekday scaled by fraction-of-day.
    const minutesSinceStart = Math.max(1, Math.floor((Date.now() - todayStart.getTime()) / 60000));
    const revenueSoFar = sumMoney(paidToday, 'total_amount');

    const sameWeekdayPast = paid.filter((o) => {
      if (!o.created_at) return false;
      const d = new Date(o.created_at);
      return d < todayStart && d.getUTCDay() === now.getUTCDay();
    });
    const fracDay = clamp01(minutesSinceStart / (24 * 60));
    const pastDayRevenue = {};
    for (const o of sameWeekdayPast) {
      const dayKey = String(o.created_at).slice(0, 10);
      pastDayRevenue[dayKey] = (pastDayRevenue[dayKey] || 0) + (Number(o.total_amount) || 0);
    }
    const pastRevs = Object.values(pastDayRevenue);
    const avgFullDay = pastRevs.length ? pastRevs.reduce((a, b) => a + b, 0) / pastRevs.length : 0;
    const expectedSoFar = avgFullDay * fracDay;
    const anomaly =
      expectedSoFar > 0
        ? {
            expectedSoFar,
            revenueSoFar,
            deltaPct: Math.round(((revenueSoFar - expectedSoFar) / expectedSoFar) * 1000) / 10
          }
        : null;

    // Low stock flags: stock vs threshold + velocity projection (last 2h).
    const items = menuItems || [];
    const tracked = items.filter((i) => i.stock_on_hand != null && Number(i.stock_on_hand) >= 0);
    const last2h = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const paidLast2h = paid.filter((o) => o.created_at && new Date(o.created_at) >= last2h);
    const paidLast2hIds = paidLast2h.map((o) => o.id).filter(Boolean).slice(0, 4000);
    const velocityByItem = new Map();
    if (paidLast2hIds.length) {
      const { data: lines2h } = await selectInChunks(
        supabase,
        'order_items',
        'menu_item_id,quantity,order_id',
        'order_id',
        paidLast2hIds
      );
      for (const l of lines2h || []) {
        const id = l.menu_item_id;
        if (!id) continue;
        velocityByItem.set(id, (velocityByItem.get(id) || 0) + (Number(l.quantity) || 0));
      }
    }
    const lowStock = tracked
      .map((it) => {
        const stock = Number(it.stock_on_hand) || 0;
        const threshold = it.low_stock_threshold != null ? Number(it.low_stock_threshold) || 0 : 0;
        const qty2h = velocityByItem.get(it.id) || 0;
        const perHour = qty2h / 2;
        const projectedHoursLeft = perHour > 0 ? stock / perHour : null;
        const isLow = threshold > 0 ? stock <= threshold : stock <= 0;
        const willRunOutSoon = projectedHoursLeft != null && projectedHoursLeft <= 1.5;
        if (!isLow && !willRunOutSoon) return null;
        return {
          id: it.id,
          name: it.name || 'Item',
          stockOnHand: stock,
          lowStockThreshold: threshold || null,
          projectedHoursLeft
        };
      })
      .filter(Boolean)
      .slice(0, 12);

    res.set('Cache-Control', 'no-store');
    res.json({
      businessId,
      generatedAt: new Date().toISOString(),
      rush: {
        last30mOrders: paidLast30m.length,
        baselinePerHour,
        rushRatio
      },
      anomaly,
      todayTopItems: topItems,
      lowStock
    });
  } catch (e) {
    console.error('[ZURI] ai.signals error:', e);
    res.status(500).json({ error: 'Failed to load AI signals' });
  }
});

/**
 * POST /api/ai/menu/description
 * Suggest a short, compelling menu item description in the house style.
 */
router.post('/menu/description', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId, itemName, categoryName } = req.body || {};
    const ok = await assertOwnBusinessAndPlan(req, res, businessId);
    if (!ok) return;
    if (!canUseStorefrontAIGeneration(ok.plan)) {
      return res.status(403).json({ error: 'AI menu assist is temporarily unavailable.' });
    }

    const credit = await consumeDailyAiCredit(businessId, ok.plan, 'AI');
    if (!credit.ok) {
      return res.status(credit.status || 429).json({ error: credit.error, quota: credit.quota });
    }

    if (!itemName || typeof itemName !== 'string' || !itemName.trim()) {
      return res.status(400).json({ error: 'itemName is required' });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return res.status(503).json({ error: 'AI not configured' });

    // Pull a few existing descriptions to match tone.
    const { data: samples } = await supabase
      .from('menu_items')
      .select('description')
      .eq('business_id', businessId)
      .not('description', 'is', null)
      .limit(6);

    const styleSamples = (samples || [])
      .map((s) => (s.description && String(s.description).trim()) || '')
      .filter(Boolean)
      .slice(0, 4);

    const anthropic = new (require('@anthropic-ai/sdk'))({ apiKey });
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

    const prompt = [
      'You write menu item descriptions for a restaurant ordering app.',
      'Write ONE short description (1–2 sentences), warm and appetizing, not overly poetic.',
      'Avoid emojis. Avoid quotes. Do not mention pricing. Keep it under 160 characters.',
      categoryName ? `Category: ${categoryName}` : '',
      `Item name: ${itemName}`,
      styleSamples.length ? `Style examples from this menu:\n- ${styleSamples.join('\n- ')}` : '',
      '',
      'Return only the description text.'
    ]
      .filter(Boolean)
      .join('\n');

    const msg = await anthropic.messages.create({
      model,
      max_tokens: 120,
      messages: [{ role: 'user', content: prompt }]
    });

    const content0 = msg && Array.isArray(msg.content) ? msg.content[0] : null;
    const text =
      (typeof content0 === 'string'
        ? content0
        : content0 && typeof content0.text === 'string'
          ? content0.text
          : '') || '';

    const cleaned = String(text).trim().replace(/\s+/g, ' ');
    if (!cleaned) return res.status(500).json({ error: 'No AI response' });
    res.json({ description: cleaned.slice(0, 200) });
  } catch (e) {
    console.error('[ZURI] ai.menu.description error:', e);
    res.status(500).json({ error: 'Failed to generate description' });
  }
});

/**
 * GET /api/ai/briefing?businessId=...&days=1
 * Daily briefing card summary (yesterday by default).
 */
router.get('/briefing', requireBusinessAuth, async (req, res) => {
  try {
    const businessId = typeof req.query.businessId === 'string' ? req.query.businessId : '';
    const ok = await assertOwnBusinessAndPlan(req, res, businessId);
    if (!ok) return;
    if (!isOpsAiPlan(ok.plan)) return res.status(403).json({ error: 'Upgrade to Scale to unlock this feature.' });

    const now = new Date();
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); // today 00:00 UTC
    const start = new Date(end.getTime() - 24 * 60 * 60 * 1000); // yesterday 00:00 UTC

    const { data: orders, error } = await supabase
      .from('orders')
      .select('id,total_amount,created_at,payment_status')
      .eq('business_id', businessId)
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString())
      .limit(8000);
    if (error) return res.status(500).json({ error: 'Failed to load briefing' });

    const paid = (orders || []).filter((o) => o.payment_status === 'paid');
    const totalOrders = paid.length;
    const totalRevenue = sumMoney(paid, 'total_amount');
    const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

    // busiest hour
    const byHour = new Map();
    for (const o of paid) {
      const h = new Date(o.created_at).getUTCHours();
      byHour.set(h, (byHour.get(h) || 0) + 1);
    }
    const busiest = [...byHour.entries()].sort((a, b) => b[1] - a[1])[0];

    // top item
    const ids = paid.map((o) => o.id).filter(Boolean);
    let topItem = null;
    if (ids.length) {
      const { data: lines } = await selectInChunks(
        supabase,
        'order_items',
        'menu_item_id,quantity,order_id',
        'order_id',
        ids
      );
      const counts = new Map();
      for (const l of lines || []) counts.set(l.menu_item_id, (counts.get(l.menu_item_id) || 0) + (Number(l.quantity) || 0));
      const topId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      if (topId) {
        const { data: mi } = await supabase.from('menu_items').select('name').eq('id', topId).single();
        topItem = { name: mi?.name || 'Item', count: counts.get(topId) || 0 };
      }
    }

    res.set('Cache-Control', 'no-store');
    res.json({
      date: start.toISOString().slice(0, 10),
      totalOrders,
      totalRevenue,
      avgOrderValue,
      topItem,
      busiestHourUtc: busiest ? { hour: busiest[0], orderCount: busiest[1] } : null
    });
  } catch (e) {
    console.error('[ZURI] ai.briefing error:', e);
    res.status(500).json({ error: 'Failed to load briefing' });
  }
});

/**
 * GET /api/ai/slow-hours?businessId=...&days=60
 * Detect slow hours by weekday/hour for this business.
 */
router.get('/slow-hours', requireBusinessAuth, async (req, res) => {
  try {
    const businessId = typeof req.query.businessId === 'string' ? req.query.businessId : '';
    const ok = await assertOwnBusinessAndPlan(req, res, businessId);
    if (!ok) return;
    if (!isOpsAiPlan(ok.plan)) return res.status(403).json({ error: 'Upgrade to Scale to unlock this feature.' });

    const days = clampInt(req.query.days, 14, 120, 60);
    const start = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const { data: orders, error } = await supabase
      .from('orders')
      .select('created_at,payment_status,total_amount')
      .eq('business_id', businessId)
      .gte('created_at', start.toISOString())
      .limit(8000);
    if (error) return res.status(500).json({ error: 'Failed to load slow hours' });

    const paid = (orders || []).filter((o) => o.payment_status === 'paid');
    const buckets = new Map(); // key day_hour -> {count,revenue}
    for (const o of paid) {
      const d = new Date(o.created_at);
      const key = `${d.getUTCDay()}_${d.getUTCHours()}`;
      const prev = buckets.get(key) || { orderCount: 0, revenue: 0 };
      prev.orderCount += 1;
      prev.revenue += Number(o.total_amount) || 0;
      buckets.set(key, prev);
    }

    const rows = [...buckets.entries()].map(([key, v]) => {
      const [weekday, hour] = key.split('_').map((x) => Number(x));
      return { weekday, hour, orderCount: v.orderCount, revenue: v.revenue };
    });
    // find slowest 3 by order count (but require some history)
    rows.sort((a, b) => a.orderCount - b.orderCount);
    const slow = rows.slice(0, 3);

    res.set('Cache-Control', 'no-store');
    res.json({ periodDays: days, slowHours: slow });
  } catch (e) {
    console.error('[ZURI] ai.slow-hours error:', e);
    res.status(500).json({ error: 'Failed to load slow hours' });
  }
});

/**
 * POST /api/ai/storefront-generate
 * Claude-powered storefront design from a prompt + optional reference images.
 * Growth: one generation; Scale+: unlimited.
 */
router.post('/storefront-generate', requireBusinessAuth, handleStorefrontAiUpload, async (req, res) => {
  try {
    const businessId =
      typeof req.body?.businessId === 'string'
        ? req.body.businessId
        : typeof req.body?.businessId === 'number'
          ? String(req.body.businessId)
          : '';
    const prompt = String(req.body?.prompt || req.body?.designPrompt || '').trim();
    const storeName = typeof req.body?.storeName === 'string' ? req.body.storeName : '';
    const taglineHint = typeof req.body?.taglineHint === 'string' ? req.body.taglineHint : '';

    let currentConfig = {};
    let currentDetails = {};
    try {
      if (req.body?.currentConfig) {
        currentConfig =
          typeof req.body.currentConfig === 'string'
            ? JSON.parse(req.body.currentConfig)
            : req.body.currentConfig;
      }
      if (req.body?.currentDetails) {
        currentDetails =
          typeof req.body.currentDetails === 'string'
            ? JSON.parse(req.body.currentDetails)
            : req.body.currentDetails;
      }
    } catch {
      return res.status(400).json({ error: 'Invalid currentConfig or currentDetails JSON.' });
    }

    if (!businessId) {
      return res.status(400).json({ error: 'businessId is required' });
    }
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!prompt || prompt.length < 12) {
      return res.status(400).json({ error: 'Please describe your desired storefront design (at least 12 characters).' });
    }

    const plan = await getBusinessPlan(businessId);
    if (!canUseStorefrontAIGeneration(plan)) {
      return res.status(403).json({ error: 'AI storefront generation is temporarily unavailable.' });
    }

    const { data: business, error: bErr } = await supabase
      .from('businesses')
      .select('id,name,business_mode,storefront_ai_generations,storefront_config,storefront_details')
      .eq('id', businessId)
      .single();
    if (bErr || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    const gate = await assertStorefrontAiAllowed(businessId, plan);
    if (!gate.ok) {
      return res.status(gate.status || 403).json({ error: gate.error, quota: gate.quota });
    }

    const baseConfig = { ...(business.storefront_config || {}), ...(currentConfig || {}) };
    const baseDetails = { ...(business.storefront_details || {}), ...(currentDetails || {}) };
    if (storeName) baseDetails.name = storeName;
    if (taglineHint) baseDetails.tagline = taglineHint;

    const referenceImages = (req.files || []).filter(
      (f) => f && f.mimetype && String(f.mimetype).startsWith('image/')
    );

    let generatedConfig;
    let generatedDetails;
    let reasoning = null;

    try {
      const aiResult = await generateStorefrontWithClaude({
        prompt,
        businessName: business.name,
        businessMode: business.business_mode || 'menu',
        currentConfig: baseConfig,
        currentDetails: baseDetails,
        referenceImages
      });
      generatedConfig = aiResult.storefrontConfig;
      generatedDetails = aiResult.storefrontDetails;
      reasoning = aiResult.reasoning;
    } catch (aiErr) {
      const status = aiErr?.status || 500;
      if (status === 503 || status === 502) {
        return res.status(status).json({ error: aiErr.message || 'AI generation failed' });
      }
      console.error('[ZURI] ai.storefront-generate claude error:', aiErr);
      return res.status(500).json({ error: 'Failed to generate storefront with AI' });
    }

    const used = Number(
      gate.quota?.used ?? business.storefront_ai_generations ?? 0
    );
    const nextUsed = used + 1;
    const lifetimeLimit = getStorefrontAiLifetimeLimit(plan);
    const unlimited = lifetimeLimit === 0;

    const { error: upErr } = await supabase
      .from('businesses')
      .update({
        storefront_config: generatedConfig,
        storefront_details: generatedDetails,
        storefront_ai_generations: nextUsed
      })
      .eq('id', businessId);
    if (upErr) {
      console.error('[ZURI] ai.storefront-generate update error:', upErr);
      return res.status(500).json({ error: 'Failed to save generated storefront' });
    }

    try {
      const io = req.app && req.app.get ? req.app.get('io') : null;
      if (io) {
        io.to(`storefront-${businessId}`).emit('storefront-updated', {
          businessId,
          config: generatedConfig,
          details: generatedDetails
        });
      }
    } catch (e) {
      console.error('[ZURI] ai.storefront-generate socket error:', e);
    }

    const remaining = unlimited ? null : Math.max(0, lifetimeLimit - nextUsed);
    return res.json({
      success: true,
      storefrontConfig: generatedConfig,
      storefrontDetails: generatedDetails,
      reasoning,
      generationsUsed: nextUsed,
      generationsRemainingOnGrowth: remaining,
      quota: {
        used: nextUsed,
        limit: unlimited ? null : lifetimeLimit,
        remaining,
        unlimited
      }
    });
  } catch (e) {
    console.error('[ZURI] ai.storefront-generate error:', e);
    return res.status(500).json({ error: 'Failed to generate storefront' });
  }
});

/**
 * GET /api/ai/quota — daily AI credits + storefront generation remaining.
 */
router.get('/quota', requireBusinessAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const plan = await getBusinessPlan(businessId);
    const daily = await getDailyAiQuota(businessId, plan);
    const storefront = await assertStorefrontAiAllowed(businessId, plan);
    return res.json({
      plan,
      daily,
      storefront: storefront.quota,
      zuriQoAvailable: canAccessZuriQo(plan),
      insightsAvailable: canAccessAIFeatures(plan)
    });
  } catch (err) {
    console.error('[ZURI] ai.quota error:', err);
    return res.status(500).json({ error: 'Could not load AI quota' });
  }
});

/**
 * POST /api/ai/chat
 * ZuriQO floating bar — tiered query / draft / confirm-action / agentic.
 */
router.post('/chat', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId, message, preferredTier, history } = req.body || {};
    if (!businessId || typeof businessId !== 'string') {
      return res.status(400).json({ error: 'businessId is required' });
    }
    if (businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only chat for your own business' });
    }
    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'message is required' });
    }

    const plan = await getBusinessPlan(businessId);
    if (!canAccessZuriQo(plan)) {
      return res.status(403).json({ error: 'ZuriQO is temporarily unavailable.' });
    }

    const credit = await consumeDailyAiCredit(businessId, plan, 'ZuriQO');
    if (!credit.ok) {
      return res.status(credit.status || 429).json({ error: credit.error, quota: credit.quota });
    }

    const { handleZuriQoChat } = require('../lib/zuriQoChat');
    const result = await handleZuriQoChat({
      businessId,
      message: message.trim(),
      preferredTier,
      history
    });
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    return res.json({ ...result.data, quota: credit.quota });
  } catch (err) {
    console.error('[ZURI] ai.chat error:', err);
    return res.status(500).json({ error: 'ZuriQO couldn’t answer right now. Please try again.' });
  }
});

/**
 * POST /api/ai/chat/confirm — execute a Tier 3 proposed action after human confirm.
 */
router.post('/chat/confirm', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId, actionType, payload } = req.body || {};
    if (!businessId || businessId !== req.businessId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const plan = await getBusinessPlan(businessId);
    if (!canAccessZuriQo(plan)) {
      return res.status(403).json({ error: 'ZuriQO is temporarily unavailable.' });
    }
    const { confirmZuriQoAction } = require('../lib/zuriQoChat');
    const result = await confirmZuriQoAction({ businessId, actionType, payload });
    if (result.error) return res.status(result.status || 500).json({ error: result.error });
    return res.json(result.data);
  } catch (err) {
    console.error('[ZURI] ai.chat.confirm error:', err);
    return res.status(500).json({ error: 'Could not apply that change. Please try again.' });
  }
});

module.exports = router;
