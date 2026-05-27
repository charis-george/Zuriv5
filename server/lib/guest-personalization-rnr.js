/**
 * Guest personalization RNR (Remitted Neural Relay): per-venue adaptive taste memory.
 * Stores feature vectors on uncertain sessions; later visits with high cosine similarity
 * reinforce "for you" ordering (same spirit as Allure RNR, scoped by customer + business).
 */

const { getDb } = require('../database');

const FEATURE_DIM = 28;
const MATCH_THRESHOLD = 0.92;
const MAX_PATTERNS_PER_SCOPE = 100;
const FETCH_MATCH_LIMIT = 120;

/** Store when model analogue is uncertain (mirrors Allure text path). */
const STORE_LOSS_MIN = 0.35;
const STORE_CONFIDENCE_MAX = 0.55;

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
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
      /* fall through */
    }
    return raw
      .split(/[,;|]/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function tagTokens(dishTags) {
  if (!dishTags || typeof dishTags !== 'object' || Array.isArray(dishTags)) return [];
  const out = [];
  for (const v of Object.values(dishTags)) {
    if (Array.isArray(v)) {
      for (const x of v) {
        const s = String(x).trim().toLowerCase();
        if (s.length > 1) out.push(s);
      }
    } else if (v != null && typeof v !== 'object') {
      const s = String(v).trim().toLowerCase();
      if (s.length > 1) out.push(s);
    }
  }
  return out;
}

function binHash(str, bins) {
  let h = 5381;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 33) ^ str.charCodeAt(i);
  }
  return Math.abs(h) % bins;
}

function l2Normalize(vec) {
  let s = 0;
  for (let i = 0; i < vec.length; i += 1) s += vec[i] * vec[i];
  const norm = Math.sqrt(s);
  if (norm < 1e-9) return vec.map(() => 0);
  return vec.map((x) => x / norm);
}

function cosineSimilarity(a, b) {
  if (!a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d < 1e-9 ? 0 : dot / d;
}

/**
 * Confidence in personalization quality (higher = more history / sharper taste signal).
 */
function estimatePersonalizationConfidence({ personal, crossVenuePicks }) {
  const rows = personal || [];
  const n = rows.length;
  const totalQty = rows.reduce((s, p) => s + (Number(p.count) || 0), 0);
  if (n < 1 || totalQty < 1) return 0.38;

  const depth = clamp01(Math.log1p(totalQty) / Math.log1p(24));
  const breadth = clamp01(n / 10);
  const maxCount = Math.max(...rows.map((p) => Number(p.count) || 0));
  const concentration = clamp01(maxCount / totalQty);
  const cross = crossVenuePicks && crossVenuePicks.length ? 0.18 : 0;

  return clamp01(0.18 + 0.38 * depth + 0.28 * breadth + 0.16 * concentration + cross);
}

function buildFeatureVector({ optIn, personal, crossVenuePicks, menuById }) {
  const vec = new Array(FEATURE_DIM).fill(0);
  vec[0] = optIn ? 1 : 0;

  const rows = personal || [];
  const totalQty = rows.reduce((s, p) => s + (Number(p.count) || 0), 0);
  const uniq = rows.length;
  vec[1] = clamp01(Math.log1p(totalQty) / Math.log1p(28));
  vec[2] = clamp01(uniq / 14);
  if (totalQty > 0) {
    const maxC = Math.max(...rows.map((r) => Number(r.count) || 0));
    vec[3] = clamp01(maxC / totalQty);
  }
  vec[4] = clamp01((crossVenuePicks || []).length / 4);

  for (const row of rows) {
    const w = Number(row.count) || 1;
    const item = menuById && menuById[row.menuItemId];
    if (!item) continue;
    const ings = parseIngredients(item.ingredients);
    for (const ing of ings) {
      const b = 5 + binHash(ing, 8);
      if (b >= 5 && b < 13) vec[b] += w;
    }
    const tags = tagTokens(item.dish_tags || item.dishTags);
    for (const t of tags) {
      const b = 13 + binHash(t, 10);
      if (b >= 13 && b < 23) vec[b] += w;
    }
  }

  return l2Normalize(vec);
}

function shouldRemit(loss, confidence) {
  return loss > STORE_LOSS_MIN || confidence < STORE_CONFIDENCE_MAX;
}

async function getBusinessCatalogMode(businessId) {
  const { data } = await getDb()
    .from('businesses')
    .select('business_mode')
    .eq('id', businessId)
    .maybeSingle();
  return data?.business_mode === 'ticketing' ? 'ticketing' : 'menu';
}

async function loadVenueMenuItemIds(businessId) {
  const mode = await getBusinessCatalogMode(businessId);
  const { data, error } = await getDb()
    .from('menu_items')
    .select('id')
    .eq('business_id', businessId)
    .eq('item_mode', mode)
    .eq('available', true);
  if (error) {
    console.error('guest RNR venue ids:', error);
    return [];
  }
  return (data || []).map((r) => r.id).filter(Boolean);
}

async function loadMenuByIdsForBusiness(businessId, menuItemIds) {
  const ids = [...new Set((menuItemIds || []).filter(Boolean))];
  const map = {};
  if (!businessId || ids.length < 1) return map;

  const mode = await getBusinessCatalogMode(businessId);
  const { data, error } = await getDb()
    .from('menu_items')
    .select('id, ingredients, dish_tags')
    .eq('business_id', businessId)
    .eq('item_mode', mode)
    .in('id', ids.slice(0, 80));

  if (error) {
    console.error('guest RNR loadMenuByIds:', error);
    return map;
  }
  for (const row of data || []) {
    map[row.id] = { ingredients: row.ingredients, dish_tags: row.dish_tags };
  }
  return map;
}

async function fetchPatternsForMatch(zuriCustomerId, businessId) {
  const { data, error } = await getDb()
    .from('guest_personalization_rnr_patterns')
    .select('id, features, loss, metadata, stored_at')
    .eq('zuri_customer_id', zuriCustomerId)
    .eq('business_id', businessId)
    .order('stored_at', { ascending: false })
    .limit(FETCH_MATCH_LIMIT);

  if (error) {
    console.error('guest RNR fetch patterns:', error);
    return [];
  }
  return data || [];
}

async function insertPattern(zuriCustomerId, businessId, features, loss, metadata) {
  const { error } = await getDb().from('guest_personalization_rnr_patterns').insert({
    zuri_customer_id: zuriCustomerId,
    business_id: businessId,
    features,
    loss,
    metadata: metadata || {}
  });
  if (error) {
    console.error('guest RNR insert:', error);
    return;
  }

  const { count, error: cErr } = await getDb()
    .from('guest_personalization_rnr_patterns')
    .select('id', { count: 'exact', head: true })
    .eq('zuri_customer_id', zuriCustomerId)
    .eq('business_id', businessId);

  if (cErr || count == null || count <= MAX_PATTERNS_PER_SCOPE) return;

  const over = count - MAX_PATTERNS_PER_SCOPE;
  const { data: oldest, error: oErr } = await getDb()
    .from('guest_personalization_rnr_patterns')
    .select('id')
    .eq('zuri_customer_id', zuriCustomerId)
    .eq('business_id', businessId)
    .order('stored_at', { ascending: true })
    .limit(over);

  if (oErr || !oldest?.length) return;
  const dropIds = oldest.map((r) => r.id);
  await getDb().from('guest_personalization_rnr_patterns').delete().in('id', dropIds);
}

function bestMatch(features, rows, threshold) {
  let best = null;
  let bestSim = 0;
  const f = features;
  for (const row of rows) {
    const raw = row.features;
    const arr = Array.isArray(raw) ? raw : typeof raw === 'object' && raw && Array.isArray(raw.vec) ? raw.vec : null;
    if (!arr || arr.length !== f.length) continue;
    const sim = cosineSimilarity(f, arr.map((x) => Number(x) || 0));
    if (sim >= threshold && sim > bestSim) {
      bestSim = sim;
      best = { row, similarity: sim };
    }
  }
  return best;
}

/**
 * Match stored patterns, then optionally store this session (if uncertain).
 * Mutates forYouItemIds and itemSignals when a prior pattern strongly matches.
 */
async function applyGuestPersonalizationRnr({
  zuriCustomerId,
  businessId,
  optIn,
  personal,
  crossVenuePicks,
  forYouItemIds,
  itemSignals
}) {
  const menuIds = (personal || []).map((p) => p.menuItemId).filter(Boolean);
  const [venueIds, menuById, patterns] = await Promise.all([
    loadVenueMenuItemIds(businessId),
    loadMenuByIdsForBusiness(businessId, menuIds),
    fetchPatternsForMatch(zuriCustomerId, businessId)
  ]);
  const venueSet = new Set(venueIds);

  const features = buildFeatureVector({ optIn, personal, crossVenuePicks, menuById });
  const confidence = estimatePersonalizationConfidence({ personal, crossVenuePicks });
  const loss = clamp01(1 - confidence);

  const hit = bestMatch(features, patterns, MATCH_THRESHOLD);

  let reinforced = false;
  let matchSimilarity = null;
  const seedFromMeta = hit?.row?.metadata?.seedItemIds;
  const seeds = Array.isArray(seedFromMeta) ? seedFromMeta.map(String).filter(Boolean) : [];

  if (hit && seeds.length) {
    const validSeeds = seeds.filter((id) => (venueSet.size > 0 ? venueSet.has(id) : true));
    if (validSeeds.length) {
      reinforced = true;
      matchSimilarity = hit.similarity;
      const merged = [...new Set([...validSeeds, ...(forYouItemIds || [])])].slice(0, 16);
      forYouItemIds.length = 0;
      forYouItemIds.push(...merged);
      for (const id of validSeeds) {
        itemSignals[id] = { kind: 'rnr', label: 'Matches your taste history' };
      }
      for (const id of merged) {
        if (!validSeeds.includes(id) && !itemSignals[id]) {
          itemSignals[id] = { kind: 'for_you', label: 'For you' };
        }
      }
    }
  }

  if (shouldRemit(loss, confidence)) {
    const seedItemIds = (personal || []).slice(0, 10).map((p) => p.menuItemId).filter(Boolean);
    await insertPattern(zuriCustomerId, businessId, features, loss, { seedItemIds, v: 1 });
  }

  return {
    reinforced,
    matchSimilarity,
    guestRnr: {
      enabled: true,
      reinforced,
      matchSimilarity: matchSimilarity != null ? Math.round(matchSimilarity * 1000) / 1000 : undefined,
      patternCount: patterns.length
    }
  };
}

module.exports = {
  FEATURE_DIM,
  MATCH_THRESHOLD,
  buildFeatureVector,
  estimatePersonalizationConfidence,
  applyGuestPersonalizationRnr,
  shouldRemit
};
