const { getDb } = require('../database');

const {
  activateBusinessSubscription,
  periodEndFromBilling,
  recurringEnabled
} = require('./paystack-subscription');
const {
  VERIFY_PLANS,
  amountNairaFor,
  businessIdPrefixFromSubReference,
  subReferenceMatchesBusiness
} = require('./subscriptionPlans');

const supabase = getDb();

async function resolveBusinessIdFromSubReference(reference) {
  const prefix = businessIdPrefixFromSubReference(reference);
  if (!prefix) return null;
  const { data: rows, error } = await supabase.from('businesses').select('id');
  if (error || !rows?.length) return null;
  const match = rows.find((row) =>
    String(row.id).replace(/-/g, '').toLowerCase().startsWith(prefix)
  );
  return match?.id || null;
}



function normalizeMetadata(meta) {
  if (!meta) return {};
  if (typeof meta === 'string') {
    try {
      return normalizeMetadata(JSON.parse(meta));
    } catch {
      return {};
    }
  }
  if (typeof meta !== 'object') return {};

  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k === 'custom_fields') continue;
    if (v == null) out[k] = '';
    else if (typeof v === 'object') out[k] = v;
    else out[k] = String(v);
  }

  const fields = meta.custom_fields;
  if (Array.isArray(fields)) {
    for (const field of fields) {
      const name = String(field?.variable_name || field?.display_name || '').toLowerCase();
      const value = field?.value != null ? String(field.value) : '';
      if (!value) continue;
      if (name.includes('plan') && !out.plan) out.plan = value.replace(/\s+/g, '_').toLowerCase();
      if (name.includes('billing') && !out.interval) {
        out.interval = value.toLowerCase().includes('year') ? 'yearly' : 'monthly';
      }
    }
  }

  return out;
}



/**

 * Apply subscription plan from a successful Paystack charge (webhook or verify).

 */

async function subscriptionAlreadyActive(businessId, plan) {
  if (!businessId || !plan) return false;
  const { data } = await supabase
    .from('businesses')
    .select('plan, subscription_status')
    .eq('id', businessId)
    .maybeSingle();
  return Boolean(
    data &&
    String(data.plan) === String(plan) &&
    ['active', 'non_renewing'].includes(String(data.subscription_status || 'active'))
  );
}

async function activateSubscriptionFromCharge(charge) {
  const reference = charge?.reference;

  if (charge.status !== 'success') {
    return { ok: false, message: 'Payment not successful' };
  }

  const meta = normalizeMetadata(charge.metadata);
  const isSubscription =
    meta.type === 'subscription' ||
    Boolean(charge.plan || charge.plan_object) ||
    (reference && String(reference).startsWith('sub_'));

  if (!isSubscription) {
    return { ok: false, message: 'Not a subscription payment' };
  }

  let businessId = meta.businessId;
  let plan = meta.plan;
  let billing = meta.interval === 'yearly' ? 'yearly' : 'monthly';

  if (!businessId && reference && String(reference).startsWith('sub_')) {
    businessId = await resolveBusinessIdFromSubReference(reference);
  }

  if (!plan && reference && String(reference).startsWith('sub_')) {
    const paid = Number(charge.amount) / 100;
    for (const candidate of VERIFY_PLANS) {
      if (Math.abs(amountNairaFor(candidate, 'monthly') - paid) <= 1) {
        plan = candidate;
        billing = 'monthly';
        break;
      }
      if (Math.abs(amountNairaFor(candidate, 'yearly') - paid) <= 1) {
        plan = candidate;
        billing = 'yearly';
        break;
      }
    }
  }

  const planField = charge.plan;
  const planName =
    typeof planField === 'object' && planField?.name
      ? String(planField.name)
      : typeof planField === 'string'
        ? planField
        : '';

  if ((!businessId || !plan) && planName) {
    const lower = planName.toLowerCase();
    for (const candidate of VERIFY_PLANS) {
      if (lower.includes(candidate.replace('_', ' ')) || lower.includes(candidate)) {
        plan = plan || candidate;
        break;
      }
    }
    if (!billing && lower.includes('year')) billing = 'yearly';
  }

  if (!businessId || !plan || !VERIFY_PLANS.has(plan)) {
    return { ok: false, message: 'Invalid subscription data' };
  }

  if (await subscriptionAlreadyActive(businessId, plan)) {
    return { ok: true, plan, message: 'Subscription already active' };
  }

  const expected = amountNairaFor(plan, billing);
  const paid = Number(charge.amount) / 100;
  const hasPaystackPlan = Boolean(
    (typeof charge.plan === 'string' ? charge.plan : charge.plan?.plan_code) ||
    charge.plan_object ||
    meta.paystackPlanCode
  );
  const amountTolerance = hasPaystackPlan ? 1 : 0.02;

  if (expected && Math.abs(paid - expected) > amountTolerance) {
    console.error('Subscription activate amount mismatch', { reference, expected, paid, plan, billing });
    return { ok: false, message: 'Payment amount does not match plan' };
  }



  const subCode = charge.subscription?.subscription_code || charge.subscription_code || null;

  const customerCode = charge.customer?.customer_code || charge.customer?.id || null;

  const emailToken = charge.subscription?.email_token || charge.email_token || null;

  const planCode =
    (typeof charge.plan === 'object' ? charge.plan?.plan_code : null) ||
    (typeof charge.plan === 'string' ? charge.plan : null) ||
    charge.plan_object?.plan_code ||
    meta.paystackPlanCode ||
    null;

  const nextPayment = charge.subscription?.next_payment_date;



  const periodEnd = nextPayment

    ? new Date(nextPayment).toISOString()

    : periodEndFromBilling(billing);



  return activateBusinessSubscription({

    businessId,

    plan,

    billing,

    subscriptionCode: subCode,

    customerCode,

    subscriptionToken: emailToken,

    planCode,

    periodEnd,

    status: 'active'

  });

}



/**

 * Apply subscription from a verified Monnify transaction (prepaid period, not auto-renewing).

 */

async function activateSubscriptionFromMonnify(tx) {

  const reference = tx?.paymentReference;

  if (!reference || !String(reference).startsWith('sub_')) {

    return { ok: false, message: 'Invalid subscription reference' };

  }

  if (String(tx.paymentStatus || '').toUpperCase() !== 'PAID') {

    return { ok: false, message: 'Payment not successful' };

  }



  const meta = normalizeMetadata(tx.metaData || tx.metadata);

  if (meta.type !== 'subscription') {

    return { ok: false, message: 'Not a subscription payment' };

  }



  const businessId = meta.businessId;

  const plan = meta.plan;

  const billing = meta.interval === 'yearly' ? 'yearly' : 'monthly';

  if (!businessId || !plan || !VERIFY_PLANS.has(plan)) {

    return { ok: false, message: 'Invalid subscription data' };

  }



  const expected = amountNairaFor(plan, billing);

  const paid = Number(tx.amountPaid ?? tx.totalPayable ?? 0);

  if (!expected || Math.abs(paid - expected) > 0.02) {

    console.error('Monnify subscription amount mismatch', { reference, expected, paid, plan, billing });

    return { ok: false, message: 'Payment amount does not match plan' };

  }



  return activateBusinessSubscription({

    businessId,

    plan,

    billing,

    periodEnd: periodEndFromBilling(billing),

    status: 'active'

  });

}



module.exports = {
  activateSubscriptionFromCharge,
  activateSubscriptionFromMonnify,
  normalizeMetadata,
  amountNairaFor,
  VERIFY_PLANS,
  recurringEnabled,
  subReferenceMatchesBusiness
};


