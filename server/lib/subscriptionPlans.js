const VERIFY_PLANS = new Set(['starter', 'growth', 'scale', 'pro', 'zuri_plus']);

const PLAN_AMOUNTS_MONTHLY = {
  starter: 9900,
  growth: 24900,
  scale: 59900,
  pro: 40000,
  zuri_plus: 60000
};

const PLAN_AMOUNTS_YEARLY = {
  starter: 95040,
  growth: 239040,
  scale: 575040,
  pro: 384000,
  zuri_plus: 576000
};

function amountNairaFor(plan, interval) {
  const table = interval === 'yearly' ? PLAN_AMOUNTS_YEARLY : PLAN_AMOUNTS_MONTHLY;
  return table[plan] || 0;
}

/** sub_{businessIdPrefix12}_{timestamp}_{hex} */
function businessIdPrefixFromSubReference(reference) {
  const m = String(reference || '').match(/^sub_([a-f0-9]{12})_/i);
  return m ? m[1].toLowerCase() : null;
}

function subReferenceMatchesBusiness(reference, businessId) {
  const prefix = businessIdPrefixFromSubReference(reference);
  if (!prefix || !businessId) return false;
  return String(businessId).replace(/-/g, '').toLowerCase().startsWith(prefix);
}

module.exports = {
  VERIFY_PLANS,
  PLAN_AMOUNTS_MONTHLY,
  PLAN_AMOUNTS_YEARLY,
  amountNairaFor,
  businessIdPrefixFromSubReference,
  subReferenceMatchesBusiness
};
