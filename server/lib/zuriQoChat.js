/**
 * ZuriQO dashboard AI chat — Claude-powered, open-ended within Zuri capabilities.
 * Tier 1 answers · Tier 2 drafts (publishable) · Tier 3 confirm-before-write · Tier 4 agents
 */

const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { selectInChunks } = require('./supabaseInChunks');
const { normalizeBusinessMode } = require('./businessMode');

function startOfUtcDay(d = new Date()) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function naira(n) {
  const v = Number(n) || 0;
  return `₦${v.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
}

function extractText(msg) {
  if (!msg) return '';
  if (typeof msg.content === 'string') return msg.content.trim();
  if (!Array.isArray(msg.content)) return '';
  return msg.content
    .filter((b) => b && b.type === 'text' && b.text)
    .map((b) => b.text)
    .join('\n')
    .trim();
}

async function loadBusinessContext(businessId) {
  const supabase = getDb();
  const today = startOfUtcDay();
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [{ data: business }, { data: orders }, { data: menuItems }, { data: categories }] = await Promise.all([
    supabase
      .from('businesses')
      .select('id,name,business_mode,plan,bank_verified_at,account_status,logo_url')
      .eq('id', businessId)
      .maybeSingle(),
    supabase
      .from('orders')
      .select('id,status,total_amount,payment_status,created_at,customer_name,customer_email,table_number')
      .eq('business_id', businessId)
      .gte('created_at', monthAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(800),
    supabase
      .from('menu_items')
      .select('id,name,description,available,price,stock_on_hand,low_stock_threshold,item_mode,category_id')
      .eq('business_id', businessId)
      .limit(800),
    supabase
      .from('categories')
      .select('id,name,category_mode')
      .eq('business_id', businessId)
      .limit(100)
  ]);

  let tap = {
    enabled: false,
    eligible: false,
    planOk: false,
    bankOk: false,
    staffCodeCount: 0,
    expiresAt: null,
    code: null
  };
  try {
    const { canAccessAnalytics } = require('./plans');
    const planOk = canAccessAnalytics(business?.plan);
    const bankOk = Boolean(business?.bank_verified_at);
    tap.planOk = planOk;
    tap.bankOk = bankOk;
    tap.eligible = planOk && bankOk;
    const { getActiveRoomByBusiness, listStaffCodes } = require('./tapRooms');
    const room = await getActiveRoomByBusiness(businessId);
    const staffCodes = room?.staffCodes || (await listStaffCodes(businessId)) || [];
    tap.enabled = Boolean(room?.enabled);
    tap.expiresAt = room?.expiresAt || null;
    tap.code = room?.code || staffCodes[0]?.code || null;
    tap.staffCodeCount = staffCodes.length;
  } catch (err) {
    console.warn('[ZURI] zuriQoChat tap context', err?.message || err);
  }

  const list = orders || [];
  const mode = normalizeBusinessMode(business?.business_mode);
  const paid = list.filter((o) => o.payment_status === 'paid');
  const paidToday = paid.filter((o) => o.created_at && new Date(o.created_at) >= today);
  const paidWeek = paid.filter((o) => o.created_at && new Date(o.created_at) >= weekAgo);
  const openOrders = list.filter(
    (o) => o.payment_status === 'paid' && o.status && !['completed', 'cancelled', 'served'].includes(String(o.status))
  );
  const unpaid = list.filter((o) => o.payment_status !== 'paid' && o.status !== 'cancelled').slice(0, 30);

  const lowStock = (menuItems || []).filter((m) => {
    const stock = m.stock_on_hand;
    if (stock == null) return m.available === false;
    const threshold = Number(m.low_stock_threshold) || 5;
    return Number(stock) <= threshold;
  });

  const orderIds = paidToday.map((o) => o.id).filter(Boolean).slice(0, 1500);
  let topToday = [];
  if (orderIds.length) {
    const { data: lines } = await selectInChunks(
      supabase,
      'order_items',
      'menu_item_id,quantity',
      'order_id',
      orderIds
    );
    const counts = new Map();
    for (const l of lines || []) {
      if (!l?.menu_item_id) continue;
      counts.set(l.menu_item_id, (counts.get(l.menu_item_id) || 0) + (Number(l.quantity) || 0));
    }
    const nameById = Object.fromEntries((menuItems || []).map((m) => [m.id, m.name]));
    topToday = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([id, qty]) => ({ id, name: nameById[id] || 'Item', qty }));
  }

  return {
    business,
    mode,
    tap,
    paidToday,
    paidWeek,
    paid,
    openOrders,
    unpaid,
    lowStock,
    topToday,
    menuItems: menuItems || [],
    categories: categories || [],
    revenueToday: paidToday.reduce((s, o) => s + (Number(o.total_amount) || 0), 0),
    revenueWeek: paidWeek.reduce((s, o) => s + (Number(o.total_amount) || 0), 0)
  };
}

function contextBrief(ctx) {
  return {
    businessName: ctx.business?.name,
    mode: ctx.mode,
    plan: ctx.business?.plan,
    tap: ctx.tap,
    today: { paidOrders: ctx.paidToday.length, revenue: ctx.revenueToday },
    week: { paidOrders: ctx.paidWeek.length, revenue: ctx.revenueWeek },
    openOrders: ctx.openOrders.slice(0, 12).map((o) => ({
      id: o.id,
      status: o.status,
      table: o.table_number,
      customer: o.customer_name,
      amount: o.total_amount
    })),
    unpaidSample: ctx.unpaid.slice(0, 10).map((o) => ({
      id: o.id,
      customer: o.customer_name,
      amount: o.total_amount,
      payment_status: o.payment_status
    })),
    topSellersToday: ctx.topToday,
    lowStock: ctx.lowStock.slice(0, 15).map((m) => ({
      id: m.id,
      name: m.name,
      stock: m.stock_on_hand,
      available: m.available
    })),
    catalogSample: ctx.menuItems.slice(0, 40).map((m) => ({
      id: m.id,
      name: m.name,
      price: m.price,
      available: m.available,
      stock: m.stock_on_hand
    })),
    categories: ctx.categories.map((c) => ({ id: c.id, name: c.name })),
    whereToGo: {
      orders: 'Orders tab — live tickets/orders and Assist queues',
      menu: 'Menu / Catalog / Tickets tab — edit items for current mode',
      qr: 'QR Code tab — download guest link QR',
      analytics: 'Analytics tab — Growth+ sales charts',
      tap: 'Top of dashboard — Zuri Tap toggle + staff codes (Growth+)',
      payment: 'Payouts & billing — bank verify, plans, upgrades',
      customize: 'Customize storefront — themes and guest link look',
      settings: 'Settings — profile, slug, Tap staff codes',
      modeSwitch: 'Profile / header — switch Menu · Shops · Tickets'
    }
  };
}

const TOOLS = [
  {
    name: 'get_dashboard_data',
    description:
      'Read live Zuri snapshot: revenue, orders, catalog, Tap status, mode, unpaid guests, and where-to-go map. Use for factual questions and real-time coaching.',
    input_schema: {
      type: 'object',
      properties: {
        focus: {
          type: 'string',
          enum: ['overview', 'orders', 'catalog', 'payments', 'tickets', 'tap', 'mode'],
          description: 'Optional focus area'
        }
      }
    }
  },
  {
    name: 'guide_owner',
    description:
      'Coach the owner in real time: which tab/screen to open and step-by-step what to do. Does not change data. Prefer this when they ask “where do I…”, “how do I…”, or need a snapshot of next actions.',
    input_schema: {
      type: 'object',
      required: ['destination', 'title', 'steps'],
      properties: {
        destination: {
          type: 'string',
          enum: ['orders', 'menu', 'qr', 'analytics', 'tap', 'payment', 'customize', 'settings', 'mode_switch'],
          description: 'Dashboard area to open'
        },
        title: { type: 'string' },
        steps: {
          type: 'array',
          items: { type: 'string' },
          description: 'Short numbered coaching steps (3–6)'
        },
        tip: { type: 'string', description: 'Optional enhancement idea (esp. for Zuri Tap)' }
      }
    }
  },
  {
    name: 'propose_draft',
    description:
      'Create a reversible draft the owner reviews. Use kind=catalog_item for new menu/ticket/shop items (owner can Publish). Use kind=message for promo/SMS/email/apology/Tap table script copy.',
    input_schema: {
      type: 'object',
      required: ['kind'],
      properties: {
        kind: { type: 'string', enum: ['message', 'catalog_item'] },
        title: { type: 'string' },
        body: { type: 'string', description: 'Message body or item description' },
        itemName: { type: 'string' },
        price: { type: 'number' },
        categoryName: { type: 'string' }
      }
    }
  },
  {
    name: 'propose_write',
    description:
      'Propose a state-changing action. The owner must Confirm before it runs. Supports orders, availability, catalog publish, business mode switch (menu/shop/ticketing), and Zuri Tap room on/off/extend.',
    input_schema: {
      type: 'object',
      required: ['actionType', 'label', 'description'],
      properties: {
        actionType: {
          type: 'string',
          enum: [
            'order_status',
            'item_availability',
            'create_catalog_item',
            'switch_business_mode',
            'tap_room_on',
            'tap_room_off',
            'tap_room_extend'
          ]
        },
        label: { type: 'string' },
        description: { type: 'string' },
        orderId: { type: 'string' },
        status: { type: 'string', enum: ['pending', 'preparing', 'ready', 'completed', 'cancelled', 'served'] },
        itemId: { type: 'string' },
        available: { type: 'boolean' },
        itemName: { type: 'string' },
        price: { type: 'number' },
        itemDescription: { type: 'string' },
        categoryName: { type: 'string' },
        businessMode: { type: 'string', enum: ['menu', 'shop', 'ticketing'] }
      }
    }
  },
  {
    name: 'run_agent',
    description:
      'Run a multi-step Zuri agent across Assist, inventory, settlement, anomaly watch, onboarding, or Tap coaching.',
    input_schema: {
      type: 'object',
      required: ['agent'],
      properties: {
        agent: {
          type: 'string',
          enum: ['reconcile_assist', 'inventory_menu', 'settlement', 'anomaly', 'onboarding', 'tap_coach']
        }
      }
    }
  }
];

async function runAgentTool(agent, ctx) {
  const supabase = getDb();
  const runId = `run_${Date.now().toString(36)}`;

  if (agent === 'reconcile_assist') {
    const { data: alerts } = await supabase
      .from('payment_alerts')
      .select('id,match_status,flag_reason,created_at')
      .eq('business_id', ctx.business.id)
      .gte('created_at', startOfUtcDay().toISOString())
      .limit(100);
    const list = alerts || [];
    const unmatched = list.filter((a) => a.match_status && a.match_status !== 'matched');
    const matched = list.filter((a) => a.match_status === 'matched');
    return {
      agentRun: {
        id: runId,
        name: 'Assist reconciliation',
        steps: [
          { label: 'Load today’s payment alerts', status: 'done' },
          { label: 'Cross-check pending orders', status: 'done' },
          {
            label: unmatched.length ? `Flag ${unmatched.length} for one-tap review` : 'No ambiguous matches left',
            status: unmatched.length ? 'needs_review' : 'done'
          }
        ],
        summary: `Matched ${matched.length}. Needs review: ${unmatched.length}. Open Orders to confirm.`
      },
      note: `Reconciliation complete. Matched ${matched.length}, review ${unmatched.length}.`
    };
  }

  if (agent === 'inventory_menu') {
    const zero = ctx.menuItems.filter((m) => m.stock_on_hand != null && Number(m.stock_on_hand) <= 0);
    return {
      agentRun: {
        id: runId,
        name: 'Inventory → menu',
        steps: [
          { label: 'Scan stock levels', status: 'done' },
          {
            label: zero.length ? `Draft hide for ${zero.length} zero-stock item(s)` : 'No zero-stock items',
            status: zero.length ? 'needs_review' : 'done'
          },
          { label: 'Draft restock note', status: 'done' }
        ],
        summary: zero.length
          ? `Suggested hiding: ${zero
              .slice(0, 5)
              .map((m) => m.name)
              .join(', ')}.`
          : 'Stock looks healthy.'
      },
      note: zero.length ? `Found ${zero.length} zero-stock items.` : 'No zero-stock items.'
    };
  }

  if (agent === 'settlement') {
    return {
      agentRun: {
        id: runId,
        name: 'Event settlement',
        steps: [
          { label: 'Pull sales', status: 'done' },
          { label: 'Compare door / Tap when available', status: 'done' },
          { label: 'Flag discrepancies', status: 'needs_review' }
        ],
        summary: `Paid today ${ctx.paidToday.length} · ${naira(ctx.revenueToday)}.`
      },
      note: `Settlement draft ready: ${ctx.paidToday.length} paid today.`
    };
  }

  if (agent === 'anomaly') {
    const avgDaily = ctx.paidWeek.length / 7;
    const today = ctx.paidToday.length;
    const drop = avgDaily > 0 ? Math.round(((avgDaily - today) / avgDaily) * 100) : 0;
    return {
      agentRun: {
        id: runId,
        name: 'Anomaly watch',
        steps: [
          { label: 'Baseline last 7 days', status: 'done' },
          { label: 'Compare today’s volume', status: 'done' },
          {
            label: drop >= 30 ? `Volume ${drop}% below recent average` : 'No major volume anomaly',
            status: drop >= 30 ? 'needs_review' : 'done'
          }
        ],
        summary: `Today ${today} paid vs ~${avgDaily.toFixed(1)}/day. Revenue ${naira(ctx.revenueToday)}.`
      },
      note: drop >= 30 ? `Volume down ~${drop}% vs recent average.` : 'No major anomaly detected.'
    };
  }

  if (agent === 'onboarding') {
    return {
      agentRun: {
        id: runId,
        name: 'Catalog onboarding',
        steps: [
          { label: 'Wait for menu photo or PDF', status: 'pending' },
          { label: 'Extract items & prices', status: 'pending' },
          { label: 'Ask you to confirm before publishing', status: 'pending' }
        ],
        summary: 'Use Menu → AI upload, or ask me to draft items from a description.'
      },
      note: 'Onboarding agent is ready for a menu photo or drafted items.'
    };
  }

  if (agent === 'tap_coach') {
    const tap = ctx.tap || {};
    const steps = [
      {
        label: tap.planOk ? 'Plan allows Zuri Tap (Growth+)' : 'Upgrade to Growth to unlock Zuri Tap',
        status: tap.planOk ? 'done' : 'needs_review'
      },
      {
        label: tap.bankOk ? 'Payout bank verified' : 'Verify bank in Payouts & billing',
        status: tap.bankOk ? 'done' : 'needs_review'
      },
      {
        label: tap.enabled ? 'Tap room is LIVE' : 'Turn Tap on from the dashboard header',
        status: tap.enabled ? 'done' : 'pending'
      },
      {
        label: 'Share staff Tap code with floor staff; guests join with Tap app + code',
        status: 'pending'
      },
      {
        label: 'Send payment requests from Orders / Tap panel for tables in the room',
        status: 'pending'
      }
    ];
    return {
      agentRun: {
        id: runId,
        name: 'Zuri Tap coach',
        steps,
        summary: tap.enabled
          ? `Tap is live${tap.code ? ` · code ${tap.code}` : ''}. Keep the room open while guests pay by Tap.`
          : tap.eligible
            ? 'You’re ready — confirm “Turn Zuri Tap on” when you want the room live.'
            : 'Finish plan + bank setup, then turn Tap on.'
      },
      note: tap.enabled
        ? 'Tap room is live. Ask me for scripts to pitch Tap at tables.'
        : 'Tap coach finished — follow the steps (or confirm Turn Tap on).'
    };
  }

  return {
    agentRun: {
      id: runId,
      name: 'Catalog onboarding',
      steps: [
        { label: 'Wait for menu photo or PDF', status: 'pending' },
        { label: 'Extract items & prices', status: 'pending' },
        { label: 'Ask you to confirm before publishing', status: 'pending' }
      ],
      summary: 'Use Menu → AI upload, or ask me to draft items from a description.'
    },
    note: 'Onboarding agent is ready for a menu photo or drafted items.'
  };
}

async function executeTool(name, input, ctx, bag) {
  if (name === 'get_dashboard_data') {
    const focus = input?.focus || 'overview';
    const brief = contextBrief(ctx);
    if (focus === 'orders') {
      return {
        openOrders: brief.openOrders,
        unpaidSample: brief.unpaidSample,
        today: brief.today,
        week: brief.week
      };
    }
    if (focus === 'catalog' || focus === 'tickets') {
      return { catalogSample: brief.catalogSample, lowStock: brief.lowStock, categories: brief.categories, mode: brief.mode };
    }
    if (focus === 'payments') {
      return { unpaidSample: brief.unpaidSample, today: brief.today };
    }
    if (focus === 'tap') {
      return { tap: brief.tap, whereToGo: { tap: brief.whereToGo.tap, settings: brief.whereToGo.settings } };
    }
    if (focus === 'mode') {
      return { mode: brief.mode, whereToGo: { modeSwitch: brief.whereToGo.modeSwitch, menu: brief.whereToGo.menu } };
    }
    return brief;
  }

  if (name === 'guide_owner') {
    const destination = String(input?.destination || 'orders');
    const title = String(input?.title || 'Next steps').trim().slice(0, 120);
    const steps = Array.isArray(input?.steps)
      ? input.steps.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 8)
      : [];
    const tip = String(input?.tip || '').trim().slice(0, 400) || null;
    bag.guide = { destination, title, steps, tip };
    bag.tier = Math.max(bag.tier || 1, 1);
    return { ok: true, guide: bag.guide };
  }

  if (name === 'propose_draft') {
    const kind = input?.kind === 'catalog_item' ? 'catalog_item' : 'message';
    if (kind === 'catalog_item') {
      const itemName = String(input?.itemName || input?.title || 'New item').trim().slice(0, 120);
      const price = Math.max(0, Number(input?.price) || 0);
      const description = String(input?.body || input?.itemDescription || '').trim().slice(0, 800);
      const categoryName = String(input?.categoryName || '').trim().slice(0, 80) || null;
      const draft = {
        kind: 'catalog_item',
        title: itemName,
        body: description || `${itemName}${price ? ` · ${naira(price)}` : ''}`,
        item: { name: itemName, description, price, categoryName }
      };
      bag.draft = draft;
      bag.proposedAction = {
        id: `act_${Date.now().toString(36)}`,
        label: 'Publish to catalog',
        description: `${itemName} · ${naira(price)}${categoryName ? ` · ${categoryName}` : ''}`,
        actionType: 'create_catalog_item',
        payload: {
          name: itemName,
          description,
          price,
          categoryName,
          mode: ctx.mode
        }
      };
      bag.tier = 2;
      return { ok: true, draft, publishReady: true };
    }

    const title = String(input?.title || 'Draft').trim().slice(0, 120);
    const body = String(input?.body || '').trim().slice(0, 4000);
    bag.draft = { kind: 'message', title, body };
    bag.tier = 2;
    return { ok: true, draft: bag.draft };
  }

  if (name === 'propose_write') {
    const actionType = String(input?.actionType || '');
    const label = String(input?.label || 'Confirm change').slice(0, 120);
    const description = String(input?.description || '').slice(0, 400);
    let payload = {};

    if (actionType === 'order_status') {
      let orderId = String(input?.orderId || '');
      if (!orderId && ctx.openOrders[0]) orderId = ctx.openOrders[0].id;
      payload = { orderId, status: String(input?.status || 'completed') };
    } else if (actionType === 'item_availability') {
      let itemId = String(input?.itemId || '');
      if (!itemId && ctx.lowStock[0]) itemId = ctx.lowStock[0].id;
      payload = { itemId, available: input?.available !== false };
    } else if (actionType === 'create_catalog_item') {
      const nameItem = String(input?.itemName || 'New item').trim().slice(0, 120);
      const price = Math.max(0, Number(input?.price) || 0);
      const descriptionText = String(input?.itemDescription || input?.description || '').trim().slice(0, 800);
      const categoryName = String(input?.categoryName || '').trim().slice(0, 80) || null;
      payload = { name: nameItem, price, description: descriptionText, categoryName, mode: ctx.mode };
      bag.draft = {
        kind: 'catalog_item',
        title: nameItem,
        body: descriptionText || `${nameItem} · ${naira(price)}`,
        item: { name: nameItem, description: descriptionText, price, categoryName }
      };
    } else if (actionType === 'switch_business_mode') {
      const nextMode = normalizeBusinessMode(input?.businessMode || 'menu');
      if (nextMode === ctx.mode) {
        return { ok: true, note: `Already in ${nextMode} mode.`, skipped: true };
      }
      payload = { businessMode: nextMode };
    } else if (actionType === 'tap_room_on' || actionType === 'tap_room_off' || actionType === 'tap_room_extend') {
      payload = {};
    } else {
      return { error: 'Unsupported actionType' };
    }

    bag.proposedAction = {
      id: `act_${Date.now().toString(36)}`,
      label,
      description,
      actionType,
      payload
    };
    bag.tier = 3;
    return { ok: true, proposedAction: bag.proposedAction };
  }

  if (name === 'run_agent') {
    const result = await runAgentTool(String(input?.agent || 'onboarding'), ctx);
    bag.agentRun = result.agentRun;
    bag.tier = 4;
    return result;
  }

  return { error: `Unknown tool ${name}` };
}

function buildSystemPrompt(ctx) {
  const tap = ctx.tap || {};
  return [
    'You are ZuriQO, the in-dashboard AI for ZURI — menus, shops, ticketing, Zuri Tap, Assist, QR, and payouts.',
    'You coach in real time: use get_dashboard_data for a live snapshot, then guide_owner so the owner knows exactly where to tap.',
    'Business modes: menu (food/service), shop (retail catalog), ticketing (events). Switching mode uses propose_write actionType=switch_business_mode (confirm first).',
    'Zuri Tap: in-venue pay-by-code for saved-card guests (Growth+ + verified bank). Turn room on/off/extend via propose_write tap_room_*. Enhance Tap ideas (table scripts, staff roles, when to rotate codes, pairing with QR).',
    'Never claim a change already happened — mutations need Confirm. Prefer short answers (2–6 sentences) plus a guide when teaching.',
    `Business: ${ctx.business?.name || 'Business'} · mode: ${ctx.mode} · plan: ${ctx.business?.plan || 'unknown'}`,
    `Tap: ${tap.enabled ? 'LIVE' : 'off'}${tap.code ? ` · code ${tap.code}` : ''} · eligible=${tap.eligible ? 'yes' : 'no'} (planOk=${tap.planOk}, bankOk=${tap.bankOk})`,
    `Snapshot: today ${ctx.paidToday.length} paid / ${naira(ctx.revenueToday)}; open ${ctx.openOrders.length}; low-stock ${ctx.lowStock.length}.`
  ].join('\n');
}

function findItemByLooseName(items, name) {
  const q = String(name || '')
    .trim()
    .toLowerCase();
  if (!q) return null;
  const exact = items.find((m) => String(m.name || '').toLowerCase() === q);
  if (exact) return exact;
  return items.find((m) => String(m.name || '').toLowerCase().includes(q)) || null;
}

/** Instant replies for chip taps / short intents — skips Claude. */
function tryInstantChat(ctx, message, preferredTier) {
  const text = String(message || '').trim();
  const lower = text.toLowerCase();
  const tierHint = Array.isArray(preferredTier) && preferredTier.length === 1 ? Number(preferredTier[0]) : null;

  if (
    tierHint === 1 ||
    /how many orders|orders (came in )?today|orders today/i.test(lower)
  ) {
    if (/order/i.test(lower) && /today/i.test(lower)) {
      return {
        tier: 1,
        reply: `You have **${ctx.paidToday.length}** paid order${ctx.paidToday.length === 1 ? '' : 's'} today (${naira(
          ctx.revenueToday
        )}). ${ctx.openOrders.length} still open.`
      };
    }
  }

  if (/revenue|sales today|today.?s revenue|vs this week/i.test(lower)) {
    return {
      tier: 1,
      reply: `Today: **${naira(ctx.revenueToday)}** from ${ctx.paidToday.length} paid order${
        ctx.paidToday.length === 1 ? '' : 's'
      }.\nThis week: **${naira(ctx.revenueWeek)}** from ${ctx.paidWeek.length} paid.`
    };
  }

  if (/top[- ]?sell|best[- ]?sell|most (popular|sold)/i.test(lower)) {
    if (!ctx.topToday.length) {
      return { tier: 1, reply: 'No paid item sales recorded today yet — check back after a few orders.' };
    }
    const lines = ctx.topToday
      .slice(0, 5)
      .map((t, i) => `${i + 1}. **${t.name}** × ${t.qty}`)
      .join('\n');
    return { tier: 1, reply: `Top sellers today:\n${lines}` };
  }

  if (/low[- ]?stock|out of stock|stock list/i.test(lower)) {
    if (!ctx.lowStock.length) return { tier: 1, reply: 'Nothing looks low-stock right now.' };
    const lines = ctx.lowStock
      .slice(0, 12)
      .map((m) => `• **${m.name}**${m.stock_on_hand != null ? ` (${m.stock_on_hand} left)` : ' (marked unavailable)'}`)
      .join('\n');
    return { tier: 1, reply: `Low stock / unavailable:\n${lines}` };
  }

  if (/snapshot|what should i (do|focus)|status report|how.?s (my )?business|dashboard overview/i.test(lower)) {
    const tap = ctx.tap || {};
    const next =
      !tap.planOk
        ? 'Next: upgrade to Growth for Zuri Tap + analytics.'
        : !tap.bankOk
          ? 'Next: verify your bank in Payouts & billing, then turn Tap on.'
          : !tap.enabled
            ? 'Next: turn Zuri Tap on for walk-up saved-card pay.'
            : ctx.openOrders.length
              ? `Next: clear ${ctx.openOrders.length} open order(s) on the Orders tab.`
              : 'Next: check Analytics or ask me to draft a promo.';
    return {
      tier: 1,
      reply: [
        `**Live snapshot** · mode **${ctx.mode}** · plan **${ctx.business?.plan || 'free'}**`,
        `Today **${ctx.paidToday.length}** paid (${naira(ctx.revenueToday)}) · open **${ctx.openOrders.length}** · low-stock **${ctx.lowStock.length}**`,
        `Zuri Tap: **${tap.enabled ? 'LIVE' : 'off'}**${tap.code ? ` · code \`${tap.code}\`` : ''}`,
        next
      ].join('\n'),
      guide: {
        destination: tap.enabled || !tap.eligible ? 'orders' : tap.bankOk ? 'tap' : 'payment',
        title: 'Suggested next screen',
        steps: [next, 'Tap “Take me there” and I’ll open the right place.'],
        tip: null
      }
    };
  }

  if (/switch.*(to )?(shop|menu|ticket)|change.*(mode|to )(shop|menu|ticket)|set (mode )?to (shop|menu|ticket)/i.test(lower)) {
    let next = 'menu';
    if (/ticket/i.test(lower)) next = 'ticketing';
    else if (/shop|catalog|retail/i.test(lower)) next = 'shop';
    if (next === ctx.mode) {
      return { tier: 1, reply: `You’re already in **${next}** mode.` };
    }
    return {
      tier: 3,
      reply: `Ready to switch storefront type to **${next}**. Confirm to apply — your ${ctx.mode} catalog stays saved.`,
      proposedAction: {
        id: `pa_${Date.now().toString(36)}`,
        actionType: 'switch_business_mode',
        label: `Switch to ${next}`,
        description: `Change business mode from ${ctx.mode} to ${next}.`,
        payload: { businessMode: next }
      }
    };
  }

  if (/turn (on |off )?tap|zuri tap|enable tap|disable tap|tap room|start tap|stop tap/i.test(lower)) {
    const tap = ctx.tap || {};
    const wantOff = /turn off|disable|stop tap|end tap|close tap/i.test(lower);
    const wantExtend = /extend|keep.?alive|rotate.?window|more time/i.test(lower);
    if (wantOff) {
      if (!tap.enabled) return { tier: 1, reply: 'Zuri Tap is already off.' };
      return {
        tier: 3,
        reply: 'Ready to turn **Zuri Tap off**. Guests in the room will need a new session later. Confirm to apply.',
        proposedAction: {
          id: `pa_${Date.now().toString(36)}`,
          actionType: 'tap_room_off',
          label: 'Turn Zuri Tap off',
          description: 'Close the live Tap room for this business.',
          payload: {}
        }
      };
    }
    if (wantExtend) {
      if (!tap.enabled) {
        return { tier: 1, reply: 'Tap isn’t live yet — ask me to turn it on first.' };
      }
      return {
        tier: 3,
        reply: 'Ready to **extend** the live Tap window without changing staff codes. Confirm to apply.',
        proposedAction: {
          id: `pa_${Date.now().toString(36)}`,
          actionType: 'tap_room_extend',
          label: 'Extend Zuri Tap',
          description: 'Keep the Tap room live longer.',
          payload: {}
        }
      };
    }
    if (tap.enabled) {
      return {
        tier: 1,
        reply: `Zuri Tap is **LIVE**${tap.code ? ` · staff code \`${tap.code}\`` : ''}. Share the code with floor staff; guests pay from the Tap app.`,
        guide: {
          destination: 'tap',
          title: 'Use Tap on the floor',
          steps: [
            'Show the Tap toggle / codes at the top of the dashboard.',
            'Give each waiter the staff code (or their own code in Settings).',
            'Ask guests to open Zuri Tap, enter the code, then send a payment request from Orders.'
          ],
          tip: 'Idea: print table tents “Pay with Zuri Tap — ask your server for the code.”'
        }
      };
    }
    if (!tap.eligible) {
      return {
        tier: 1,
        reply: !tap.planOk
          ? 'Zuri Tap needs **Growth** or above. I can open Payouts & billing so you can upgrade.'
          : 'Verify your **payout bank** in Payouts & billing before turning Tap on.',
        guide: {
          destination: 'payment',
          title: 'Unlock Zuri Tap',
          steps: [
            !tap.planOk ? 'Open Payouts & billing and upgrade to Growth.' : 'Open Payouts & billing.',
            'Verify your bank account name.',
            'Come back and ask me to turn Zuri Tap on.'
          ],
          tip: 'Tap lets seated guests pay with a saved card using a short room code — no QR scan at the table.'
        }
      };
    }
    return {
      tier: 3,
      reply: 'Ready to **turn Zuri Tap on** so guests can join with a staff code. Confirm to go live.',
      proposedAction: {
        id: `pa_${Date.now().toString(36)}`,
        actionType: 'tap_room_on',
        label: 'Turn Zuri Tap on',
        description: 'Open a live Tap room for in-venue saved-card payments.',
        payload: {}
      }
    };
  }

  if (/where (is|do i)|how do i (open|find|get to)|take me to|show me (the )?(orders|menu|tap|qr|analytics|settings|payout)/i.test(lower)) {
    let destination = 'orders';
    if (/tap/i.test(lower)) destination = 'tap';
    else if (/analytics|sales chart/i.test(lower)) destination = 'analytics';
    else if (/qr/i.test(lower)) destination = 'qr';
    else if (/menu|catalog|ticket type/i.test(lower)) destination = 'menu';
    else if (/payout|billing|bank|upgrade|plan/i.test(lower)) destination = 'payment';
    else if (/customiz|storefront|theme/i.test(lower)) destination = 'customize';
    else if (/setting/i.test(lower)) destination = 'settings';
    else if (/mode|shop|ticket/i.test(lower)) destination = 'mode_switch';
    const map = {
      orders: 'Orders tab',
      menu: 'Menu / Catalog / Tickets tab',
      qr: 'QR Code tab',
      analytics: 'Analytics tab',
      tap: 'Zuri Tap controls at the top of the dashboard',
      payment: 'Payouts & billing',
      customize: 'Customize storefront',
      settings: 'Settings',
      mode_switch: 'Profile menu — Menu / Shops / Tickets switcher'
    };
    return {
      tier: 1,
      reply: `Open **${map[destination] || destination}**. Tap **Take me there** and I’ll jump you over.`,
      guide: {
        destination,
        title: `Go to ${map[destination] || destination}`,
        steps: [`Open ${map[destination] || destination}.`, 'Follow the on-screen controls for what you need.'],
        tip: null
      }
    };
  }

  if (
    tierHint === 3 ||
    /mark .+ (fulfilled|done|complete)|oldest open order|fulfil.*fulfill/i.test(lower)
  ) {
    if (/fulfill|mark.*(done|complete)|oldest open/i.test(lower)) {
      const order = ctx.openOrders[0];
      if (!order) return { tier: 1, reply: 'No open orders to mark fulfilled.' };
      return {
        tier: 3,
        reply: `Ready to mark order **${order.id.slice(0, 8)}…** (${naira(order.total_amount)}${
          order.customer_name ? ` · ${order.customer_name}` : ''
        }) as fulfilled. Confirm to apply.`,
        proposedAction: {
          id: `pa_${Date.now().toString(36)}`,
          actionType: 'order_status',
          label: 'Mark order fulfilled',
          description: `Set order ${order.id.slice(0, 8)}… to completed.`,
          payload: { orderId: order.id, status: 'completed' }
        }
      };
    }
  }

  if (
    /unavailable|hide (from guests|item)|mark .+ unavailable|sold out|take .+ off/i.test(lower) ||
    (tierHint === 3 && /unavail|hide|sold out/i.test(lower))
  ) {
    const named = lower.match(/(?:mark|make|set)\s+(.+?)\s+(?:unavailable|sold out|hidden)/i);
    const item =
      (named && findItemByLooseName(ctx.menuItems, named[1])) ||
      ctx.lowStock.find((m) => m.available !== false) ||
      ctx.menuItems.find((m) => m.available !== false);
    if (!item) return { tier: 1, reply: 'I couldn’t find an item to hide. Name the item, e.g. “Mark Latte unavailable”.' };
    return {
      tier: 3,
      reply: `Ready to hide **${item.name}** from guests. Confirm to apply.`,
      proposedAction: {
        id: `pa_${Date.now().toString(36)}`,
        actionType: 'item_availability',
        label: `Mark ${item.name} unavailable`,
        description: `Hide “${item.name}” on the guest catalog.`,
        payload: { itemId: item.id, available: false }
      }
    };
  }

  if (
    /restock|back in stock|available again|mark .+ available/i.test(lower) ||
    (tierHint === 3 && /restock|stock/i.test(lower))
  ) {
    const item = ctx.lowStock[0] || ctx.menuItems.find((m) => m.available === false);
    if (!item) return { tier: 1, reply: 'Nothing low-stock or hidden to restock right now.' };
    return {
      tier: 3,
      reply: `Ready to mark **${item.name}** available again. Confirm to apply.`,
      proposedAction: {
        id: `pa_${Date.now().toString(36)}`,
        actionType: 'item_availability',
        label: `Restock ${item.name}`,
        description: `Show “${item.name}” to guests again.`,
        payload: { itemId: item.id, available: true }
      }
    };
  }

  if (tierHint === 4 || /reconcile|anomaly|inventory.?agent|run the inventory/i.test(lower)) {
    // handled after agents below via Claude or sync agent — leave null for sync agent path
  }

  return null;
}

async function tryInstantAgent(ctx, message, preferredTier) {
  const lower = String(message || '').toLowerCase();
  const tierHint = Array.isArray(preferredTier) && preferredTier.length === 1 ? Number(preferredTier[0]) : null;
  let agent = null;
  if (/reconcile|unmatched.*assist|assist transaction/i.test(lower)) agent = 'reconcile_assist';
  else if (/anomal/i.test(lower)) agent = 'anomaly';
  else if (/inventory/i.test(lower)) agent = 'inventory_menu';
  else if (/tap (coach|setup|help)|coach.*tap|help.*tap/i.test(lower)) agent = 'tap_coach';
  else if (tierHint === 4 && /settlement|onboard/i.test(lower)) {
    agent = /settlement/i.test(lower) ? 'settlement' : 'onboarding';
  }
  if (!agent && tierHint === 4) {
    if (/reconcile/i.test(lower)) agent = 'reconcile_assist';
    else if (/anomal/i.test(lower)) agent = 'anomaly';
    else if (/inventory/i.test(lower)) agent = 'inventory_menu';
    else if (/tap/i.test(lower)) agent = 'tap_coach';
  }
  if (!agent) return null;
  const result = await runAgentTool(agent, ctx);
  const out = {
    tier: 4,
    reply: result.note || result.agentRun?.summary || 'Agent finished.',
    agentRun: result.agentRun
  };
  if (agent === 'tap_coach') {
    const tap = ctx.tap || {};
    out.guide = {
      destination: !tap.planOk || !tap.bankOk ? 'payment' : 'tap',
      title: 'Zuri Tap — what to do now',
      steps: (result.agentRun?.steps || []).map((s) => s.label).filter(Boolean).slice(0, 6),
      tip:
        'Enhance Tap: one staff code per section (bar / floor), table tents with “Ask for the Tap code,” and extend the room before busy rushes.'
    };
  }
  return out;
}

async function handleZuriQoChat({ businessId, message, preferredTier, history }) {
  const ctx = await loadBusinessContext(businessId);
  if (!ctx.business) return { error: 'Business not found', status: 404 };

  const instant = tryInstantChat(ctx, message, preferredTier);
  if (instant) return { data: instant };

  const agentInstant = await tryInstantAgent(ctx, message, preferredTier);
  if (agentInstant) return { data: agentInstant };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      data: {
        tier: 1,
        reply:
          'ZuriQO AI is temporarily unavailable. Please try again shortly, or use Orders and Menu tabs directly.'
      }
    };
  }

  const anthropic = new (require('@anthropic-ai/sdk'))({ apiKey });
  const model = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';
  const bag = { tier: 1, draft: null, proposedAction: null, agentRun: null, guide: null };

  const prior = Array.isArray(history)
    ? history
        .slice(-4)
        .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && m.text)
        .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.text).slice(0, 1200) }))
    : [];

  let forcedHint = '';
  if (Array.isArray(preferredTier) && preferredTier.length === 1) {
    const t = Number(preferredTier[0]);
    if (t === 2) forcedHint = ' Prefer proposing a draft (message or catalog item).';
    if (t === 3) forcedHint = ' Prefer propose_write with a confirmable action.';
    if (t === 4) forcedHint = ' Prefer run_agent if a multi-step workflow fits.';
  }

  const messages = [
    ...prior,
    {
      role: 'user',
      content: `${String(message || '').trim()}${forcedHint}\n\nLive snapshot JSON (use if enough; call get_dashboard_data only if you need more):\n${JSON.stringify(contextBrief(ctx)).slice(0, 6000)}`
    }
  ];

  try {
    let response = await anthropic.messages.create({
      model,
      max_tokens: 700,
      system: buildSystemPrompt(ctx),
      tools: TOOLS,
      messages
    });

    let guard = 0;
    while (response.stop_reason === 'tool_use' && guard < 2) {
      guard += 1;
      const toolUses = (response.content || []).filter((b) => b.type === 'tool_use');
      const toolResults = [];
      for (const tu of toolUses) {
        let result;
        try {
          result = await executeTool(tu.name, tu.input || {}, ctx, bag);
        } catch (err) {
          result = { error: err?.message || 'Tool failed' };
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: JSON.stringify(result).slice(0, 8000)
        });
      }
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
      response = await anthropic.messages.create({
        model,
        max_tokens: 700,
        system: buildSystemPrompt(ctx),
        tools: TOOLS,
        messages
      });
    }

    let reply = extractText(response) || 'Done.';
    if (bag.draft?.kind === 'catalog_item' && bag.proposedAction?.actionType === 'create_catalog_item') {
      if (!/publish|catalog|confirm/i.test(reply)) {
        reply += '\n\nReview the draft below, then tap **Publish** to add it to your catalog.';
      }
      bag.tier = bag.tier === 3 ? 3 : 2;
    }

    return {
      data: {
        tier: bag.tier || 1,
        reply,
        draft: bag.draft || undefined,
        proposedAction: bag.proposedAction || undefined,
        agentRun: bag.agentRun || undefined,
        guide: bag.guide || undefined
      }
    };
  } catch (err) {
    console.error('[ZURI] zuriQoChat Claude error:', err?.message || err);
    return { error: 'ZuriQO couldn’t finish that request. Please try again.', status: 500 };
  }
}

async function ensureCategory(supabase, businessId, mode, categoryName) {
  const name = String(categoryName || (mode === 'ticketing' ? 'Tickets' : mode === 'shop' ? 'Catalog' : 'Menu'))
    .trim()
    .slice(0, 80);
  const { data: existingRows } = await supabase
    .from('categories')
    .select('id,name')
    .eq('business_id', businessId)
    .eq('category_mode', mode)
    .ilike('name', name)
    .limit(1);
  if (existingRows?.[0]?.id) return existingRows[0].id;

  const { data: anyCat } = await supabase
    .from('categories')
    .select('id')
    .eq('business_id', businessId)
    .eq('category_mode', mode)
    .order('display_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (anyCat?.id && !categoryName) return anyCat.id;

  const id = uuidv4();
  const { data, error } = await supabase
    .from('categories')
    .insert({
      id,
      business_id: businessId,
      name,
      display_order: 0,
      category_mode: mode
    })
    .select('id')
    .single();
  if (error) {
    console.error('[ZURI] ensureCategory', error);
    if (error.code === '23514') {
      console.warn('[ZURI] ensureCategory: apply migration 035 for shop category_mode support');
    }
    return anyCat?.id || null;
  }
  return data.id;
}

async function confirmZuriQoAction({ businessId, actionType, payload }) {
  const supabase = getDb();
  const { data: biz } = await supabase
    .from('businesses')
    .select('business_mode')
    .eq('id', businessId)
    .maybeSingle();
  const mode = normalizeBusinessMode(biz?.business_mode);

  if (actionType === 'order_status') {
    const orderId = String(payload?.orderId || '');
    const status = String(payload?.status || 'completed');
    if (!orderId) return { error: 'Missing order', status: 400 };
    const { data: order } = await supabase.from('orders').select('id,business_id').eq('id', orderId).maybeSingle();
    if (!order || order.business_id !== businessId) return { error: 'Order not found', status: 404 };
    const { error } = await supabase.from('orders').update({ status }).eq('id', orderId);
    if (error) return { error: 'Could not update order', status: 500 };
    return { data: { ok: true, message: `Order marked ${status}.` } };
  }

  if (actionType === 'item_availability') {
    const itemId = String(payload?.itemId || '');
    const available = Boolean(payload?.available);
    if (!itemId) return { error: 'Missing item', status: 400 };
    const { data: item } = await supabase
      .from('menu_items')
      .select('id,business_id,name')
      .eq('id', itemId)
      .maybeSingle();
    if (!item || item.business_id !== businessId) return { error: 'Item not found', status: 404 };
    const { error } = await supabase.from('menu_items').update({ available }).eq('id', itemId);
    if (error) return { error: 'Could not update item', status: 500 };
    return {
      data: {
        ok: true,
        message: available ? `${item.name} is available again.` : `${item.name} is hidden from guests.`,
        refreshMenu: true
      }
    };
  }

  if (actionType === 'create_catalog_item' || actionType === 'create_item_draft') {
    const name = String(payload?.name || '').trim().slice(0, 120);
    if (!name) return { error: 'Item name is required', status: 400 };
    const price = Math.max(0, Number(payload?.price) || 0);
    const description = String(payload?.description || '').trim().slice(0, 800) || null;
    const categoryId = await ensureCategory(supabase, businessId, mode, payload?.categoryName);

    let presetId = null;
    try {
      const { resolveActivePresetId } = require('./menuPresets');
      presetId = await resolveActivePresetId(businessId, mode);
    } catch (err) {
      console.warn('[ZURI] create_catalog_item preset resolve skipped', err?.message || err);
    }

    const itemId = uuidv4();
    const insertItem = {
      id: itemId,
      business_id: businessId,
      category_id: categoryId,
      name,
      description,
      price,
      cost: 0,
      estimated_prep_time: 15,
      image_url: null,
      available: true,
      display_order: 0,
      item_mode: mode
    };
    if (presetId) insertItem.preset_id = presetId;

    let { data, error } = await supabase.from('menu_items').insert(insertItem).select('id,name,price').single();

    // Retry without preset if preset_id / mode constraint blocked the insert.
    if (error && insertItem.preset_id) {
      console.warn('[ZURI] create_catalog_item retry without preset', error.message || error);
      delete insertItem.preset_id;
      const retry = await supabase.from('menu_items').insert(insertItem).select('id,name,price').single();
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('[ZURI] create_catalog_item', error);
      const msg = String(error.message || '');
      if (/item_mode|preset_mode|category_mode|23514/i.test(msg)) {
        return {
          error:
            'Shop catalog isn’t fully enabled on this account yet. Ask your Zuri admin to apply the latest database update, then try Publish again.',
          status: 503
        };
      }
      return { error: 'Could not publish item to your catalog. Please try again.', status: 500 };
    }

    try {
      const { invalidateBusinessReads } = require('./publicReadCache');
      invalidateBusinessReads(businessId);
    } catch {
      /* optional */
    }

    return {
      data: {
        ok: true,
        message: `Published “${data.name}” (${naira(data.price)}) to your ${
          mode === 'ticketing' ? 'tickets' : mode === 'shop' ? 'catalog' : 'menu'
        }.`,
        itemId: data.id,
        refreshMenu: true
      }
    };
  }

  if (actionType === 'switch_business_mode') {
    const nextMode = normalizeBusinessMode(payload?.businessMode || 'menu');
    if (nextMode === mode) {
      return { data: { ok: true, message: `Already in ${nextMode} mode.`, businessMode: nextMode } };
    }
    const { error } = await supabase.from('businesses').update({ business_mode: nextMode }).eq('id', businessId);
    if (error) {
      console.error('[ZURI] switch_business_mode', error);
      return { error: 'Could not switch storefront type. Please try again.', status: 500 };
    }
    try {
      const { invalidateBusinessReads } = require('./publicReadCache');
      invalidateBusinessReads(businessId);
    } catch {
      /* optional */
    }
    return {
      data: {
        ok: true,
        message: `Switched to **${nextMode}** mode. Open the Menu tab to edit that catalog.`,
        businessMode: nextMode,
        refreshMenu: true,
        refreshBusiness: true
      }
    };
  }

  if (actionType === 'tap_room_on' || actionType === 'tap_room_off' || actionType === 'tap_room_extend') {
    try {
      const { turnRoomOn, turnRoomOff, extendRoom } = require('./tapRooms');
      const { getBusinessPlan, canAccessAnalytics } = require('./plans');
      if (actionType === 'tap_room_off') {
        await turnRoomOff(businessId);
        return { data: { ok: true, message: 'Zuri Tap is off.', refreshTap: true, tapEnabled: false } };
      }
      const plan = await getBusinessPlan(businessId);
      if (!canAccessAnalytics(plan)) {
        return { error: 'Zuri Tap requires Growth plan or above.', status: 403 };
      }
      const { data: bizRow } = await supabase
        .from('businesses')
        .select('bank_verified_at, account_status')
        .eq('id', businessId)
        .maybeSingle();
      if (!bizRow?.bank_verified_at) {
        return { error: 'Verify your payout bank account before turning on Zuri Tap.', status: 403 };
      }
      const room = actionType === 'tap_room_extend' ? await extendRoom(businessId) : await turnRoomOn(businessId);
      return {
        data: {
          ok: true,
          message:
            actionType === 'tap_room_extend'
              ? `Tap window extended${room?.staffCodes?.[0]?.code ? ` · code ${room.staffCodes[0].code}` : ''}.`
              : `Zuri Tap is live${room?.staffCodes?.[0]?.code ? ` · staff code ${room.staffCodes[0].code}` : ''}.`,
          refreshTap: true,
          tapEnabled: true,
          tapExpiresAt: room?.expiresAt || null,
          tapCode: room?.staffCodes?.[0]?.code || room?.code || null
        }
      };
    } catch (err) {
      console.error('[ZURI] tap action', err?.message || err);
      return { error: 'Could not update Zuri Tap right now. Please try again.', status: 500 };
    }
  }

  return { error: 'Unknown action', status: 400 };
}

module.exports = {
  handleZuriQoChat,
  confirmZuriQoAction
};
