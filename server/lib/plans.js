const { getDb } = require('../database');
const supabase = getDb();

const PLANS = Object.freeze({
  FREE: 'free',
  STARTER: 'starter',
  GROWTH: 'growth',
  PRO: 'pro',
  ZURI_PLUS: 'zuri_plus',
  ENTERPRISE: 'enterprise',
  // Legacy (map to new tiers for features)
  BASIC: 'basic',
  ADVANCED: 'advanced'
});

const PLAN_FEATURES = Object.freeze({
  [PLANS.FREE]: { analytics: false, menuPictures: false, businessLogo: false },
  [PLANS.STARTER]: { analytics: false, menuPictures: true, businessLogo: true },
  [PLANS.GROWTH]: { analytics: true, menuPictures: true, businessLogo: true },
  [PLANS.PRO]: { analytics: true, menuPictures: true, businessLogo: true, premiumAnalytics: true, ticketingFees: true },
  [PLANS.ZURI_PLUS]: { analytics: true, menuPictures: true, businessLogo: true, premiumAnalytics: true, ticketingFees: true, aiFeatures: true },
  [PLANS.ENTERPRISE]: { analytics: true, menuPictures: true, businessLogo: true, premiumAnalytics: true, ticketingFees: true, aiFeatures: true },
  [PLANS.BASIC]: { analytics: true, menuPictures: true, businessLogo: true },
  [PLANS.ADVANCED]: { analytics: true, menuPictures: true, businessLogo: true, premiumAnalytics: true, ticketingFees: true }
});

async function getBusinessPlan(businessId) {
  const { data, error } = await supabase
    .from('businesses')
    .select('plan')
    .eq('id', businessId)
    .single();
  if (error || !data) return PLANS.FREE;
  return data.plan || PLANS.FREE;
}

function canAccessAnalytics(plan) {
  return plan !== PLANS.FREE && plan !== PLANS.STARTER;
}

const PLAN_PRICES_NGN = Object.freeze({
  [PLANS.STARTER]: 7500,
  [PLANS.GROWTH]: 20000,
  [PLANS.PRO]: 40000,
  [PLANS.ZURI_PLUS]: 60000
});

// Yearly prices (20% off monthly × 12)
const PLAN_PRICES_NGN_YEARLY = Object.freeze({
  [PLANS.STARTER]: 72000,
  [PLANS.GROWTH]: 192000,
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

function canAddBusinessLogo(plan) {
  return plan !== PLANS.FREE;
}

function canAccessAIFeatures(plan) {
  return plan === PLANS.PRO || plan === PLANS.ZURI_PLUS || plan === PLANS.ENTERPRISE;
}

function canAccessProFeatures(plan) {
  return plan === PLANS.PRO || plan === PLANS.ZURI_PLUS || plan === PLANS.ENTERPRISE;
}

module.exports = {
  PLANS,
  PLAN_PRICES_NGN,
  PLAN_PRICES_NGN_YEARLY,
  getPlanAmountNg,
  PLAN_FEATURES,
  getBusinessPlan,
  canAccessAnalytics,
  canAddMenuPictures,
  canAddBusinessLogo,
  canAccessAIFeatures,
  canAccessProFeatures
};
