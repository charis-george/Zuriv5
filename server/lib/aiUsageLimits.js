/**
 * Plan-based AI usage limits (ZuriQO + menu assist daily; storefront gen lifetime).
 * Designed like typical SaaS: enough to try, not enough to stay forever on free.
 */

const { getDb } = require('../database');
const { PLANS } = require('./plans');
const { redisIncrWindow, redisGetJson, redisSetJson } = require('./redis');

/** Daily AI credits (chat message, description polish, dish enrich each cost 1). 0 = unlimited. */
const DAILY_AI_CREDITS = Object.freeze({
  [PLANS.FREE]: 8,
  [PLANS.STARTER]: 25,
  [PLANS.GROWTH]: 60,
  [PLANS.SCALE]: 0,
  [PLANS.PRO]: 0,
  [PLANS.ZURI_PLUS]: 0,
  [PLANS.ENTERPRISE]: 0,
  [PLANS.BASIC]: 60,
  [PLANS.ADVANCED]: 0
});

/** Lifetime storefront AI generations. 0 = unlimited. */
const STOREFRONT_AI_LIFETIME = Object.freeze({
  [PLANS.FREE]: 1,
  [PLANS.STARTER]: 3,
  [PLANS.GROWTH]: 8,
  [PLANS.SCALE]: 0,
  [PLANS.PRO]: 0,
  [PLANS.ZURI_PLUS]: 0,
  [PLANS.ENTERPRISE]: 0,
  [PLANS.BASIC]: 8,
  [PLANS.ADVANCED]: 0
});

const memoryDaily = new Map();

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

function utcDayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

function msUntilUtcMidnight(d = new Date()) {
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1));
  return Math.max(60_000, next.getTime() - d.getTime());
}

function normalizePlan(plan) {
  return String(plan || PLANS.FREE).toLowerCase();
}

function getDailyAiCreditLimit(plan) {
  const key = normalizePlan(plan);
  const envKey = `AI_CREDITS_DAILY_${key.toUpperCase()}`;
  if (process.env[envKey] !== undefined && process.env[envKey] !== '') {
    return envInt(envKey, DAILY_AI_CREDITS[key] ?? DAILY_AI_CREDITS[PLANS.FREE]);
  }
  return DAILY_AI_CREDITS[key] ?? DAILY_AI_CREDITS[PLANS.FREE];
}

function getStorefrontAiLifetimeLimit(plan) {
  const key = normalizePlan(plan);
  const envKey = `STOREFRONT_AI_LIMIT_${key.toUpperCase()}`;
  if (process.env[envKey] !== undefined && process.env[envKey] !== '') {
    return envInt(envKey, STOREFRONT_AI_LIFETIME[key] ?? STOREFRONT_AI_LIFETIME[PLANS.FREE]);
  }
  return STOREFRONT_AI_LIFETIME[key] ?? STOREFRONT_AI_LIFETIME[PLANS.FREE];
}

function isUnlimited(limit) {
  return limit === 0;
}

function upgradeHintForDaily(plan) {
  const p = normalizePlan(plan);
  if (p === PLANS.FREE) return ' Upgrade to Starter for more daily AI credits.';
  if (p === PLANS.STARTER) return ' Upgrade to Growth for a higher daily AI allowance.';
  if (p === PLANS.GROWTH || p === PLANS.BASIC) return ' Upgrade to Scale for unlimited ZuriQO and AI assist.';
  return ' Upgrade your plan for more AI capacity.';
}

function upgradeHintForStorefront(plan) {
  const p = normalizePlan(plan);
  if (p === PLANS.FREE) return ' Upgrade to Starter for more storefront AI designs.';
  if (p === PLANS.STARTER) return ' Upgrade to Growth for more regenerations.';
  if (p === PLANS.GROWTH || p === PLANS.BASIC) return ' Upgrade to Scale for unlimited storefront AI.';
  return ' Upgrade your plan for more storefront AI generations.';
}

function memoryGet(businessId, day) {
  const row = memoryDaily.get(businessId);
  if (!row || row.day !== day) return 0;
  return row.used;
}

function memoryIncr(businessId, day) {
  const row = memoryDaily.get(businessId);
  if (!row || row.day !== day) {
    memoryDaily.set(businessId, { day, used: 1 });
    return 1;
  }
  row.used += 1;
  return row.used;
}

async function readDbCredits(businessId) {
  const supabase = getDb();
  const { data, error } = await supabase
    .from('businesses')
    .select('ai_credits_day, ai_credits_used, storefront_ai_generations')
    .eq('id', businessId)
    .maybeSingle();
  if (error) {
    const msg = String(error.message || '');
    if (error.code === '42703' || /ai_credits_/i.test(msg)) {
      return { trackingReady: false, day: null, used: 0, storefrontUsed: 0 };
    }
    throw error;
  }
  return {
    trackingReady: true,
    day: data?.ai_credits_day ? String(data.ai_credits_day).slice(0, 10) : null,
    used: Number(data?.ai_credits_used || 0),
    storefrontUsed: Number(data?.storefront_ai_generations || 0)
  };
}

async function writeDbCredits(businessId, day, used) {
  const supabase = getDb();
  const { error } = await supabase
    .from('businesses')
    .update({ ai_credits_day: day, ai_credits_used: used })
    .eq('id', businessId);
  if (error && (error.code === '42703' || /ai_credits_/i.test(String(error.message || '')))) {
    return false;
  }
  if (error) throw error;
  return true;
}

function buildDailyQuota({ plan, limit, used }) {
  const unlimited = isUnlimited(limit);
  return {
    plan: normalizePlan(plan),
    used,
    limit: unlimited ? null : limit,
    remaining: unlimited ? null : Math.max(0, limit - used),
    unlimited,
    resets: 'daily_utc',
    kind: 'ai_credits'
  };
}

/**
 * Peek daily AI credit quota (does not consume).
 */
async function getDailyAiQuota(businessId, plan) {
  const limit = getDailyAiCreditLimit(plan);
  if (isUnlimited(limit)) {
    return buildDailyQuota({ plan, limit, used: 0 });
  }

  const day = utcDayKey();
  const redisKey = `zuri:ai:credits:${businessId}:${day}`;
  const cached = await redisGetJson(redisKey);
  if (cached && typeof cached.used === 'number') {
    return buildDailyQuota({ plan, limit, used: cached.used });
  }

  let used = memoryGet(businessId, day);
  try {
    const db = await readDbCredits(businessId);
    if (db.trackingReady) {
      used = db.day === day ? db.used : 0;
    }
  } catch (err) {
    console.warn('[ZURI] getDailyAiQuota db', err?.message || err);
  }

  return buildDailyQuota({ plan, limit, used });
}

/**
 * Consume one daily AI credit. Returns { ok, status?, error?, quota }.
 */
async function consumeDailyAiCredit(businessId, plan, label = 'AI') {
  const limit = getDailyAiCreditLimit(plan);
  if (isUnlimited(limit)) {
    return { ok: true, quota: buildDailyQuota({ plan, limit, used: 0 }) };
  }

  const day = utcDayKey();
  const redisKey = `zuri:ai:credits:${businessId}:${day}`;
  const windowMs = msUntilUtcMidnight();

  const redisResult = await redisIncrWindow(redisKey, windowMs, limit);
  if (redisResult) {
    const used = redisResult.count;
    memoryDaily.set(businessId, { day, used });
    try {
      await writeDbCredits(businessId, day, used);
    } catch {
      /* best-effort sync */
    }
    const quota = buildDailyQuota({ plan, limit, used });
    if (!redisResult.ok) {
      return {
        ok: false,
        status: 429,
        error: `You've used all ${limit} ${label} credits for today.${upgradeHintForDaily(plan)} Resets at midnight UTC.`,
        quota
      };
    }
    return { ok: true, quota };
  }

  // Memory + DB fallback
  let used = memoryGet(businessId, day);
  try {
    const db = await readDbCredits(businessId);
    if (db.trackingReady && db.day === day) used = Math.max(used, db.used);
  } catch {
    /* ignore */
  }

  if (used >= limit) {
    const quota = buildDailyQuota({ plan, limit, used });
    return {
      ok: false,
      status: 429,
      error: `You've used all ${limit} ${label} credits for today.${upgradeHintForDaily(plan)} Resets at midnight UTC.`,
      quota
    };
  }

  used = memoryIncr(businessId, day);
  try {
    await writeDbCredits(businessId, day, used);
  } catch (err) {
    console.warn('[ZURI] consumeDailyAiCredit write', err?.message || err);
  }

  await redisSetJson(redisKey, { used }, windowMs);
  return { ok: true, quota: buildDailyQuota({ plan, limit, used }) };
}

/**
 * Storefront AI generation lifetime gate.
 */
async function assertStorefrontAiAllowed(businessId, plan) {
  const limit = getStorefrontAiLifetimeLimit(plan);
  let used = 0;
  try {
    const db = await readDbCredits(businessId);
    used = db.storefrontUsed;
  } catch (err) {
    console.warn('[ZURI] assertStorefrontAiAllowed', err?.message || err);
  }

  const unlimited = isUnlimited(limit);
  const quota = {
    plan: normalizePlan(plan),
    used,
    limit: unlimited ? null : limit,
    remaining: unlimited ? null : Math.max(0, limit - used),
    unlimited,
    kind: 'storefront_ai'
  };

  if (!unlimited && used >= limit) {
    return {
      ok: false,
      status: 403,
      error: `You've used all ${limit} storefront AI generation${limit === 1 ? '' : 's'} on your plan.${upgradeHintForStorefront(plan)}`,
      quota
    };
  }
  return { ok: true, quota };
}

module.exports = {
  getDailyAiCreditLimit,
  getStorefrontAiLifetimeLimit,
  getDailyAiQuota,
  consumeDailyAiCredit,
  assertStorefrontAiAllowed,
  DAILY_AI_CREDITS,
  STOREFRONT_AI_LIFETIME
};
