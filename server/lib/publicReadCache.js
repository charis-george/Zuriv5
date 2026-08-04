/**
 * Short-lived public read caches — collapse storefront stampede on free Supabase.
 * Payments / verify / webhooks must never use this.
 */

const { createTtlCache } = require('./ttlCache');

const PUBLIC_TTL_MS = Math.max(
  5_000,
  Math.min(180_000, Number(process.env.PUBLIC_READ_CACHE_MS) || 45_000)
);
const PLAN_TTL_MS = Math.max(
  5_000,
  Math.min(120_000, Number(process.env.PLAN_READ_CACHE_MS) || 60_000)
);
const MODE_TTL_MS = Math.max(
  5_000,
  Math.min(120_000, Number(process.env.MODE_READ_CACHE_MS) || 60_000)
);

const cache = createTtlCache({ maxEntries: 500 });

function menuCacheKey(businessId, parts = {}) {
  const storefront = String(parts.storefront || '').trim() || '_';
  const event = String(parts.event || '').trim() || '_';
  const preset = String(parts.presetId || '').trim() || '_';
  return `menu:${businessId}:${storefront}:${event}:${preset}`;
}

function businessCacheKey(businessId, parts = {}) {
  const storefront = String(parts.storefront || '').trim() || '_';
  const event = String(parts.event || '').trim() || '_';
  return `biz:${businessId}:${storefront}:${event}`;
}

function getCachedMenu(businessId, parts) {
  return cache.get(menuCacheKey(businessId, parts));
}

function setCachedMenu(businessId, parts, value) {
  cache.set(menuCacheKey(businessId, parts), value, PUBLIC_TTL_MS);
}

function getCachedPublicBusiness(businessId, parts) {
  return cache.get(businessCacheKey(businessId, parts));
}

function setCachedPublicBusiness(businessId, parts, value) {
  cache.set(businessCacheKey(businessId, parts), value, PUBLIC_TTL_MS);
}

function getCachedBusinessMode(businessId) {
  return cache.get(`mode:${businessId}`);
}

function setCachedBusinessMode(businessId, value) {
  cache.set(`mode:${businessId}`, value, MODE_TTL_MS);
}

function getCachedBusinessPlan(businessId) {
  return cache.get(`plan:${businessId}`);
}

function setCachedBusinessPlan(businessId, value) {
  cache.set(`plan:${businessId}`, value, PLAN_TTL_MS);
}

/** Drop all public/plan/mode entries for a business after writes. */
function invalidateBusinessReads(businessId) {
  if (!businessId) return;
  const id = String(businessId);
  cache.del(`mode:${id}`);
  cache.del(`plan:${id}`);
  cache.deletePrefix(`menu:${id}:`);
  cache.deletePrefix(`biz:${id}:`);
}

function getPublicCacheStats() {
  return {
    entries: cache.size(),
    publicTtlMs: PUBLIC_TTL_MS,
    planTtlMs: PLAN_TTL_MS,
    modeTtlMs: MODE_TTL_MS
  };
}

module.exports = {
  PUBLIC_TTL_MS,
  getCachedMenu,
  setCachedMenu,
  getCachedPublicBusiness,
  setCachedPublicBusiness,
  getCachedBusinessMode,
  setCachedBusinessMode,
  getCachedBusinessPlan,
  setCachedBusinessPlan,
  invalidateBusinessReads,
  getPublicCacheStats
};
