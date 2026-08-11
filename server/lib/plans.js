const { getDb } = require('../database');

function db() {
  return getDb();
}

const PLANS = Object.freeze({
  FREE: 'free',
  STARTER: 'starter',
  GROWTH: 'growth',
  SCALE: 'scale',
  /** @deprecated subscribe via Scale; still honoured for existing rows */
  PRO: 'pro',
  /** @deprecated merged into Scale; still honoured for existing rows */
  ZURI_PLUS: 'zuri_plus',
  ENTERPRISE: 'enterprise',
  BASIC: 'basic',
  ADVANCED: 'advanced'
});

const PLAN_FEATURES = Object.freeze({
  [PLANS.FREE]: { analytics: false, menuPictures: false, businessLogo: false },
  [PLANS.STARTER]: { analytics: false, menuPictures: true, businessLogo: true },
  [PLANS.GROWTH]: { analytics: true, menuPictures: true, businessLogo: true },
  [PLANS.SCALE]: { analytics: true, menuPictures: true, businessLogo: true, premiumAnalytics: true, ticketingFees: true, aiFeatures: true },
  [PLANS.PRO]: { analytics: true, menuPictures: true, businessLogo: true, premiumAnalytics: true, ticketingFees: true, aiFeatures: true },
  [PLANS.ZURI_PLUS]: { analytics: true, menuPictures: true, businessLogo: true, premiumAnalytics: true, ticketingFees: true, aiFeatures: true },
  [PLANS.ENTERPRISE]: { analytics: true, menuPictures: true, businessLogo: true, premiumAnalytics: true, ticketingFees: true, aiFeatures: true },
  [PLANS.BASIC]: { analytics: true, menuPictures: true, businessLogo: true },
  [PLANS.ADVANCED]: { analytics: true, menuPictures: true, businessLogo: true, premiumAnalytics: true, ticketingFees: true }
});

function effectivePlanFromRow(row) {
  if (!row) return PLANS.FREE;
  const storedPlan = row.plan || PLANS.FREE;
  const status = row.subscription_status || 'none';
  const periodEnd = row.subscription_current_period_end;

  if (status === 'none' || !periodEnd) {
    return storedPlan;
  }

  const stillInPeriod = new Date(periodEnd) > new Date();
  if (stillInPeriod && (status === 'active' || status === 'past_due' || status === 'cancelled')) {
    return storedPlan;
  }

  if (storedPlan !== PLANS.FREE && !stillInPeriod) {
    return PLANS.FREE;
  }
  return storedPlan;
}

async function getBusinessPlan(businessId) {
  const {
    getCachedBusinessPlan,
    setCachedBusinessPlan
  } = require('./publicReadCache');

  const cached = getCachedBusinessPlan(businessId);
  if (cached) return cached;

  try {
    const { syncExpiredSubscription } = require('./paystack-subscription');
    await syncExpiredSubscription(businessId);
  } catch {
    /* non-blocking if subscription module unavailable */
  }
  const { data, error } = await db()
    .from('businesses')
    .select('plan, subscription_status, subscription_current_period_end')
    .eq('id', businessId)
    .single();
  if (error || !data) return PLANS.FREE;
  const plan = effectivePlanFromRow(data);
  setCachedBusinessPlan(businessId, plan);
  return plan;
}

function canAccessAnalytics(plan) {
  return plan !== PLANS.FREE && plan !== PLANS.STARTER;
}

/** Guest-facing AI menu personalization — available on all plans (usage-capped elsewhere where needed). */
function canAccessGuestAiStorefront(_plan) {
  return true;
}

/** When guest AI is forcibly off (reserved for emergency kill-switch / future flags). */
const GUEST_AI_STOREFRONT_DISABLED = Object.freeze({
  trendingOnMenu: false,
  intelligentUpsell: false,
  personalisedRecs: false,
  tasteSortEnabled: false,
  translationsEnabled: false,
  dietaryPromptEnabled: false,
  localPaymentHints: false,
  sharedTableHints: false
});

const PLAN_PRICES_NGN = Object.freeze({
  [PLANS.STARTER]: 9900,
  [PLANS.GROWTH]: 24900,
  [PLANS.SCALE]: 59900,
  [PLANS.PRO]: 40000,
  [PLANS.ZURI_PLUS]: 60000
});

/** Yearly totals at 20% off vs paying 12× monthly (must match client PLAN_PRICES_YEARLY). */
const PLAN_PRICES_NGN_YEARLY = Object.freeze({
  [PLANS.STARTER]: 95040,
  [PLANS.GROWTH]: 239040,
  [PLANS.SCALE]: 575040,
  [PLANS.PRO]: 384000,
  [PLANS.ZURI_PLUS]: 576000
});

function getPlanAmountNg(plan, interval = 'monthly') {
  if (interval === 'yearly') {
    return PLAN_PRICES_NGN_YEARLY[plan] ?? null;
  }
  return PLAN_PRICES_NGN[plan] ?? null;
}

function canAddMenuPictures(plan) {
  return plan !== PLANS.FREE;
}

/** AI menu digitization from photo/PDF — free on all plans (usage capped separately). */
function canUseMenuDigitize(_plan) {
  return true;
}

function canAddBusinessLogo(plan) {
  return plan !== PLANS.FREE;
}

/** Dashboard AI insights / Assist tab (Scale+; legacy Pro / Zuri AI). ZuriQO chat is separate (all plans + credits). */
function canAccessAIFeatures(plan) {
  return (
    plan === PLANS.SCALE ||
    plan === PLANS.PRO ||
    plan === PLANS.ZURI_PLUS ||
    plan === PLANS.ENTERPRISE
  );
}

/** ZuriQO floating chat — all plans; enforce daily credits in aiUsageLimits. */
function canAccessZuriQo(_plan) {
  return true;
}

function canUseStorefrontAIGeneration(_plan) {
  return true;
}

/** Premium charts + market intel (Scale+; legacy tiers). */
function canAccessProFeatures(plan) {
  return (
    plan === PLANS.SCALE ||
    plan === PLANS.PRO ||
    plan === PLANS.ZURI_PLUS ||
    plan === PLANS.ENTERPRISE
  );
}

/** Live ops signals, briefing, slow hours (Scale+; legacy Zuri AI tier). */
function canAccessOpsAi(plan) {
  return plan === PLANS.SCALE || plan === PLANS.ZURI_PLUS || plan === PLANS.ENTERPRISE;
}

/** Hero banner image on guest storefront (Growth+; same gate as analytics / guest AI). */
function canUseStorefrontHeroBanner(plan) {
  return canAccessAnalytics(plan);
}

module.exports = {
  PLANS,
  PLAN_PRICES_NGN,
  PLAN_PRICES_NGN_YEARLY,
  getPlanAmountNg,
  PLAN_FEATURES,
  effectivePlanFromRow,
  getBusinessPlan,
  canAccessAnalytics,
  canAccessGuestAiStorefront,
  GUEST_AI_STOREFRONT_DISABLED,
  canAddMenuPictures,
  canUseMenuDigitize,
  canAddBusinessLogo,
  canAccessAIFeatures,
  canAccessZuriQo,
  canUseStorefrontAIGeneration,
  canAccessProFeatures,
  canAccessOpsAi,
  canUseStorefrontHeroBanner
};
