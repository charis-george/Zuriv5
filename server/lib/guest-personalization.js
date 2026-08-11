const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { getOrCreateNetworkCustomer } = require('./zuri-network');
const { getBusinessPlan, canAccessGuestAiStorefront } = require('./plans');
const { applyGuestPersonalizationRnr } = require('./guest-personalization-rnr');
const { selectInChunks } = require('./supabaseInChunks');

const supabase = getDb();

const EMPTY = Object.freeze({
  trendingItemIds: [],
  upsellSeedIds: [],
  forYouItemIds: [],
  reorderItemIds: [],
  crossVenuePicks: [],
  itemSignals: {},
  personalisationActive: false
});

function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  const e = email.trim().toLowerCase();
  return e || null;
}

function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIngredients(raw) {
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const j = JSON.parse(raw);
      if (Array.isArray(j)) return parseIngredients(j);
    } catch {
      /* comma-separated fallback */
    }
    return raw
      .split(/[,;|]/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function parseDishTags(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw;
}

function jaccard(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 && B.size === 0) return 0;
  let inter = 0;
  for (const x of A) {
    if (B.has(x)) inter += 1;
  }
  const union = A.size + B.size - inter;
  return union > 0 ? inter / union : 0;
}

function tokenSet(text) {
  return normalizeName(text)
    .split(' ')
    .filter((t) => t.length > 2);
}

function normalizeCatalogMode(value) {
  const { normalizeBusinessMode } = require('./businessMode');
  return normalizeBusinessMode(value);
}

async function getBusinessCatalogMode(businessId) {
  const { data } = await supabase
    .from('businesses')
    .select('business_mode')
    .eq('id', businessId)
    .maybeSingle();
  return normalizeCatalogMode(data?.business_mode);
}

async function getActiveCatalogItemIdSet(businessId) {
  const mode = await getBusinessCatalogMode(businessId);
  const { data } = await supabase
    .from('menu_items')
    .select('id')
    .eq('business_id', businessId)
    .eq('item_mode', mode)
    .eq('available', true);
  return new Set((data || []).map((r) => r.id).filter(Boolean));
}

function filterIdsToSet(ids, allowed) {
  return (ids || []).filter((id) => allowed.has(id));
}

async function getVenueTrending(businessId, days = 14) {
  const since = new Date(Date.now() - days * 86400000).toISOString();
  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('business_id', businessId)
    .gte('created_at', since)
    .neq('status', 'cancelled');

  const orderIds = (orders || []).map((o) => o.id).filter(Boolean);
  if (!orderIds.length) return { trendingItemIds: [], upsellSeedIds: [] };

  const { data: lines } = await selectInChunks(
    supabase,
    'order_items',
    'menu_item_id, quantity',
    'order_id',
    orderIds
  );

  const counts = {};
  for (const row of lines || []) {
    const mid = row.menu_item_id;
    if (!mid) continue;
    counts[mid] = (counts[mid] || 0) + (Number(row.quantity) || 1);
  }
  const ranked = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
  const trendingItemIds = ranked.slice(0, 12);
  const upsellSeedIds = trendingItemIds.slice(1, 5);
  return { trendingItemIds, upsellSeedIds };
}

async function resolveGuestCustomerId({ email, guestToken }) {
  const normEmail = normalizeEmail(email);
  const token = typeof guestToken === 'string' ? guestToken.trim() : '';

  if (normEmail) {
    const resolved = await getOrCreateNetworkCustomer(normEmail);
    if (resolved.id && token) {
      await supabase
        .from('zuri_network_customers')
        .update({ guest_token: token, updated_at: new Date().toISOString() })
        .eq('id', resolved.id);
    }
    return resolved.id || null;
  }

  if (!token || token.length < 8) return null;

  const { data: byToken } = await supabase
    .from('zuri_network_customers')
    .select('id')
    .eq('guest_token', token)
    .maybeSingle();
  if (byToken?.id) return byToken.id;

  const id = uuidv4();
  const placeholderEmail = `guest+${token.slice(0, 12)}@zuri.guest`;
  const { data: created, error } = await supabase
    .from('zuri_network_customers')
    .insert({
      id,
      email: placeholderEmail,
      email_normalized: placeholderEmail,
      guest_token: token
    })
    .select('id')
    .single();

  if (!error && created?.id) return created.id;

  const { data: again } = await supabase
    .from('zuri_network_customers')
    .select('id')
    .eq('guest_token', token)
    .maybeSingle();
  return again?.id || null;
}

async function getGuestOptIn(customerId) {
  if (!customerId) return false;
  const { data } = await supabase
    .from('zuri_network_customers')
    .select('cross_venue_opt_in')
    .eq('id', customerId)
    .maybeSingle();
  return data?.cross_venue_opt_in === true;
}

async function setGuestPreferences(customerId, { crossVenueOptIn, email }) {
  if (!customerId) return;
  const patch = { updated_at: new Date().toISOString() };
  if (typeof crossVenueOptIn === 'boolean') patch.cross_venue_opt_in = crossVenueOptIn;
  if (email) {
    const norm = normalizeEmail(email);
    if (norm) {
      patch.email = norm;
      patch.email_normalized = norm;
    }
  }
  await supabase.from('zuri_network_customers').update(patch).eq('id', customerId);
}

async function getPersonalCountsAtVenue(customerId, businessId, limit = 24) {
  const { data: orders } = await supabase
    .from('orders')
    .select('id')
    .eq('business_id', businessId)
    .eq('zuri_customer_id', customerId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(80);

  const orderIds = (orders || []).map((o) => o.id).filter(Boolean);
  if (!orderIds.length) return [];

  const { data: lines } = await selectInChunks(
    supabase,
    'order_items',
    'menu_item_id, quantity',
    'order_id',
    orderIds
  );

  const counts = new Map();
  for (const row of lines || []) {
    const mid = row.menu_item_id;
    if (!mid) continue;
    counts.set(mid, (counts.get(mid) || 0) + (Number(row.quantity) || 1));
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([menuItemId, count]) => ({ menuItemId, count }));
}

async function loadMenuItemsForBusiness(businessId) {
  const mode = await getBusinessCatalogMode(businessId);
  const { data: items } = await supabase
    .from('menu_items')
    .select('id, name, description, available, canonical_dish_id, ingredients, dish_tags')
    .eq('business_id', businessId)
    .eq('item_mode', mode)
    .eq('available', true);

  return (items || []).map((it) => ({
    id: it.id,
    name: it.name,
    description: it.description || '',
    canonicalDishId: it.canonical_dish_id || '',
    ingredients: parseIngredients(it.ingredients),
    dishTags: parseDishTags(it.dish_tags),
    nameNorm: normalizeName(it.name)
  }));
}

function scoreMatch(source, target) {
  if (!source || !target) return 0;
  if (
    source.canonicalDishId &&
    target.canonicalDishId &&
    source.canonicalDishId === target.canonicalDishId
  ) {
    return 100;
  }
  if (source.nameNorm && target.nameNorm && source.nameNorm === target.nameNorm) {
    return 92;
  }
  if (
    source.nameNorm &&
    target.nameNorm &&
    (source.nameNorm.includes(target.nameNorm) || target.nameNorm.includes(source.nameNorm)) &&
    Math.min(source.nameNorm.length, target.nameNorm.length) >= 6
  ) {
    return 78;
  }
  const ingScore = jaccard(source.ingredients, target.ingredients) * 70;
  const tokScore = jaccard(tokenSet(source.name + ' ' + source.description), tokenSet(target.name + ' ' + target.description)) * 40;
  return Math.max(ingScore, tokScore);
}

async function getCrossVenueFavorites(customerId, excludeBusinessId, limit = 8) {
  const { data: orders } = await supabase
    .from('orders')
    .select('id, business_id')
    .eq('zuri_customer_id', customerId)
    .neq('business_id', excludeBusinessId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(120);

  if (!orders?.length) return [];

  const orderIds = orders.map((o) => o.id);
  const businessIds = [...new Set(orders.map((o) => o.business_id).filter(Boolean))];

  const { data: lines } = await selectInChunks(
    supabase,
    'order_items',
    'order_id, menu_item_id, quantity',
    'order_id',
    orderIds
  );

  const orderBiz = new Map(orders.map((o) => [o.id, o.business_id]));
  const itemCounts = new Map();

  for (const row of lines || []) {
    const mid = row.menu_item_id;
    const biz = orderBiz.get(row.order_id);
    if (!mid || !biz) continue;
    const key = `${biz}:${mid}`;
    itemCounts.set(key, (itemCounts.get(key) || 0) + (Number(row.quantity) || 1));
  }

  const topKeys = [...itemCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit * 2);

  const menuItemIds = topKeys.map(([k]) => k.split(':')[1]);
  const { data: menuRows } = await supabase
    .from('menu_items')
    .select('id, name, description, business_id, canonical_dish_id, ingredients, dish_tags')
    .in('id', menuItemIds);

  const { data: bizRows } = await supabase
    .from('businesses')
    .select('id, name')
    .in('id', businessIds);

  const bizNames = new Map((bizRows || []).map((b) => [b.id, b.name]));

  return (menuRows || []).map((it) => ({
    menuItemId: it.id,
    name: it.name,
    description: it.description || '',
    businessId: it.business_id,
    businessName: bizNames.get(it.business_id) || 'Another venue',
    canonicalDishId: it.canonical_dish_id || '',
    ingredients: parseIngredients(it.ingredients),
    nameNorm: normalizeName(it.name)
  }));
}

function buildCrossVenuePicks(favorites, venueMenu, maxPicks = 3) {
  const picks = [];
  const usedTarget = new Set();

  for (const fav of favorites) {
    let best = null;
    let bestScore = 0;
    for (const target of venueMenu) {
      if (usedTarget.has(target.id)) continue;
      const s = scoreMatch(fav, target);
      if (s > bestScore) {
        bestScore = s;
        best = target;
      }
    }
    if (!best || bestScore < 35) continue;
    usedTarget.add(best.id);
    const matchType =
      bestScore >= 90 ? 'exact' : bestScore >= 70 ? 'similar' : 'taste_profile';
    picks.push({
      menuItemId: best.id,
      matchType,
      sourceItemName: fav.name,
      sourceBusinessName: fav.businessName,
      label:
        matchType === 'exact'
          ? `Same as ${fav.name} you had at ${fav.businessName}`
          : matchType === 'similar'
            ? `Similar to ${fav.name} from ${fav.businessName}`
            : `Matches your taste from ${fav.businessName}`
    });
    if (picks.length >= maxPicks) break;
  }
  return picks;
}

/**
 * Full guest personalization payload for a venue storefront.
 */
async function buildGuestPersonalization({
  businessId,
  email,
  guestToken,
  crossVenueOptIn
}) {
  const plan = await getBusinessPlan(businessId);
  if (!canAccessGuestAiStorefront(plan)) {
    return { ...EMPTY };
  }

  const activeCatalogIds = await getActiveCatalogItemIdSet(businessId);
  const { trendingItemIds: rawTrending, upsellSeedIds: rawUpsell } = await getVenueTrending(businessId);
  const trendingItemIds = filterIdsToSet(rawTrending, activeCatalogIds);
  const upsellSeedIds = filterIdsToSet(rawUpsell, activeCatalogIds);
  const customerId = await resolveGuestCustomerId({ email, guestToken });

  if (!customerId) {
    return {
      ...EMPTY,
      trendingItemIds,
      upsellSeedIds,
      itemSignals: Object.fromEntries(
        trendingItemIds.slice(0, 6).map((id) => [id, { kind: 'trending', label: 'Popular here' }])
      )
    };
  }

  const storedOptIn = await getGuestOptIn(customerId);
  const optIn = crossVenueOptIn === true || (crossVenueOptIn !== false && storedOptIn);

  if (typeof crossVenueOptIn === 'boolean') {
    await setGuestPreferences(customerId, { crossVenueOptIn: optIn });
  }

  const personal = await getPersonalCountsAtVenue(customerId, businessId);
  const reorderItemIds = filterIdsToSet(
    personal.map((p) => p.menuItemId),
    activeCatalogIds
  );
  const forYouItemIds = filterIdsToSet(
    personal.slice(0, 6).map((p) => p.menuItemId),
    activeCatalogIds
  );

  let crossVenuePicks = [];
  if (optIn) {
    const favorites = await getCrossVenueFavorites(customerId, businessId);
    const venueMenu = await loadMenuItemsForBusiness(businessId);
    crossVenuePicks = buildCrossVenuePicks(favorites, venueMenu);
  }

  const itemSignals = {};
  for (const id of reorderItemIds) {
    itemSignals[id] = { kind: 'reorder', label: 'You ordered this before' };
  }
  for (const id of forYouItemIds) {
    if (!itemSignals[id]) {
      itemSignals[id] = { kind: 'for_you', label: 'For you' };
    }
  }
  for (const id of trendingItemIds) {
    if (!itemSignals[id]) {
      itemSignals[id] = { kind: 'trending', label: 'Trending' };
    }
  }
  for (const pick of crossVenuePicks) {
    itemSignals[pick.menuItemId] = { kind: 'cross_venue', label: pick.label };
  }

  let guestRnr = null;
  if (personal.length >= 1) {
    const rnrResult = await applyGuestPersonalizationRnr({
      zuriCustomerId: customerId,
      businessId,
      optIn,
      personal,
      crossVenuePicks,
      forYouItemIds,
      itemSignals
    });
    guestRnr = rnrResult.guestRnr;
  }

  return {
    trendingItemIds,
    upsellSeedIds,
    forYouItemIds,
    reorderItemIds,
    crossVenuePicks,
    itemSignals,
    personalisationActive: true,
    crossVenueOptIn: optIn,
    ...(guestRnr ? { guestRnr } : {})
  };
}

module.exports = {
  buildGuestPersonalization,
  resolveGuestCustomerId,
  setGuestPreferences,
  getGuestOptIn,
  normalizeName,
  parseIngredients,
  scoreMatch,
  EMPTY
};
