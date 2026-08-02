/**
 * Quotas and rate limits for AI menu digitization (configurable via env).
 */

const { getDb } = require('../database');
const { PLANS } = require('./plans');

const DEFAULT_LIMITS = Object.freeze({
  [PLANS.FREE]: 5,
  [PLANS.STARTER]: 15,
  [PLANS.GROWTH]: 40,
  [PLANS.SCALE]: 0,
  [PLANS.PRO]: 0,
  [PLANS.ZURI_PLUS]: 0,
  [PLANS.ENTERPRISE]: 0,
  [PLANS.BASIC]: 40,
  [PLANS.ADVANCED]: 0
});

const hourlyBuckets = new Map();

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

function isDigitizeEnabled() {
  return process.env.MENU_DIGITIZE_ENABLED !== 'false';
}

function getMaxOutputTokens() {
  return Math.max(512, envInt('MENU_DIGITIZE_MAX_OUTPUT_TOKENS', 2048));
}

function getHourlyRateLimit() {
  return Math.max(1, envInt('MENU_DIGITIZE_HOURLY_RATE', 3));
}

function getPlanLimit(plan) {
  const key = String(plan || PLANS.FREE).toLowerCase();
  const envKey = `MENU_DIGITIZE_LIMIT_${key.toUpperCase()}`;
  const fromEnv = process.env[envKey];
  if (fromEnv !== undefined && fromEnv !== '') {
    const n = Number(fromEnv);
    if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  }
  return DEFAULT_LIMITS[key] ?? DEFAULT_LIMITS[PLANS.FREE];
}

function isUnlimited(limit) {
  return limit === 0;
}

function hourBucketKey() {
  return Math.floor(Date.now() / 3_600_000);
}

function checkHourlyRate(businessId) {
  const max = getHourlyRateLimit();
  const hourKey = hourBucketKey();
  const entry = hourlyBuckets.get(businessId);
  if (!entry || entry.hourKey !== hourKey) {
    return { ok: true, usedThisHour: 0, hourlyLimit: max, hourlyRemaining: max };
  }
  if (entry.count >= max) {
    return { ok: false, usedThisHour: entry.count, hourlyLimit: max, hourlyRemaining: 0 };
  }
  return {
    ok: true,
    usedThisHour: entry.count,
    hourlyLimit: max,
    hourlyRemaining: max - entry.count
  };
}

function recordHourlyUse(businessId) {
  const hourKey = hourBucketKey();
  const entry = hourlyBuckets.get(businessId);
  if (!entry || entry.hourKey !== hourKey) {
    hourlyBuckets.set(businessId, { hourKey, count: 1 });
    return;
  }
  entry.count += 1;
}

function isMissingDigitizeColumns(error) {
  const msg = String(error?.message || '');
  return error?.code === '42703' || /menu_digitize_/i.test(msg);
}

async function getBusinessDigitizeStats(businessId) {
  const supabase = getDb();
  const { data, error } = await supabase
    .from('businesses')
    .select('menu_digitize_uses, menu_digitize_tokens_total')
    .eq('id', businessId)
    .maybeSingle();
  if (error) {
    if (isMissingDigitizeColumns(error)) {
      return { uses: 0, tokensTotal: 0, trackingReady: false };
    }
    throw error;
  }
  return {
    uses: Number(data?.menu_digitize_uses || 0),
    tokensTotal: Number(data?.menu_digitize_tokens_total || 0),
    trackingReady: true
  };
}

function buildQuotaPayload({ plan, uses, limit, hourly }) {
  const unlimited = isUnlimited(limit);
  const remaining = unlimited ? null : Math.max(0, limit - uses);
  return {
    plan,
    used: uses,
    limit: unlimited ? null : limit,
    remaining,
    unlimited,
    hourlyUsed: hourly.usedThisHour,
    hourlyLimit: hourly.hourlyLimit,
    hourlyRemaining: hourly.hourlyRemaining,
    maxOutputTokens: getMaxOutputTokens()
  };
}

/**
 * @returns {Promise<{ ok: true, quota: object } | { ok: false, status: number, error: string, quota: object }>}
 */
async function assertMenuDigitizeAllowed(businessId, plan) {
  if (!isDigitizeEnabled()) {
    const err = new Error('AI menu upload is temporarily unavailable. Please try again later.');
    err.status = 503;
    throw err;
  }

  const hourly = checkHourlyRate(businessId);
  const limit = getPlanLimit(plan);
  const stats = await getBusinessDigitizeStats(businessId);
  const quota = buildQuotaPayload({ plan, uses: stats.uses, limit, hourly });

  if (!hourly.ok) {
    return {
      ok: false,
      status: 429,
      error: `Too many AI menu uploads this hour (${hourly.hourlyLimit} max). Wait a bit and try again.`,
      quota
    };
  }

  if (!isUnlimited(limit) && stats.uses >= limit) {
    const upgradeHint =
      plan === PLANS.FREE
        ? ' Upgrade to Starter for more AI menu uploads.'
        : plan === PLANS.STARTER
          ? ' Upgrade to Growth for a higher limit.'
          : ' Upgrade your plan for more AI menu uploads.';
    return {
      ok: false,
      status: 403,
      error: `You've used all ${limit} AI menu uploads on your plan.${upgradeHint}`,
      quota
    };
  }

  return { ok: true, quota, stats };
}

async function recordMenuDigitizeUsage(businessId, tokensUsed = 0) {
  recordHourlyUse(businessId);
  const stats = await getBusinessDigitizeStats(businessId);
  const tokens = Math.max(0, Math.trunc(Number(tokensUsed) || 0));
  if (!stats.trackingReady) {
    return { uses: stats.uses + 1, tokensTotal: stats.tokensTotal + tokens };
  }
  const supabase = getDb();
  const { error } = await supabase
    .from('businesses')
    .update({
      menu_digitize_uses: stats.uses + 1,
      menu_digitize_tokens_total: stats.tokensTotal + tokens,
      menu_digitize_last_at: new Date().toISOString()
    })
    .eq('id', businessId);
  if (error) {
    if (isMissingDigitizeColumns(error)) {
      return { uses: stats.uses + 1, tokensTotal: stats.tokensTotal + tokens };
    }
    throw error;
  }
  return { uses: stats.uses + 1, tokensTotal: stats.tokensTotal + tokens };
}

async function getMenuDigitizeQuota(businessId, plan) {
  const hourly = checkHourlyRate(businessId);
  const limit = getPlanLimit(plan);
  const stats = await getBusinessDigitizeStats(businessId);
  return buildQuotaPayload({ plan, uses: stats.uses, limit, hourly });
}

module.exports = {
  isDigitizeEnabled,
  getMaxOutputTokens,
  getHourlyRateLimit,
  getPlanLimit,
  assertMenuDigitizeAllowed,
  recordMenuDigitizeUsage,
  getMenuDigitizeQuota
};
