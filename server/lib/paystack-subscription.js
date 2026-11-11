/**
 * Paystack recurring subscription billing (plans, initialize, webhooks, cancel).
 */

const { getDb } = require('../database');
const { amountNairaFor, VERIFY_PLANS } = require('./subscriptionPlans');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_BASE = 'https://api.paystack.co';

function recurringEnabled() {
  if (process.env.USE_PAYSTACK_RECURRING === 'false') return false;
  return Boolean(PAYSTACK_SECRET);
}

function paystackInterval(billing) {
  return billing === 'yearly' ? 'annually' : 'monthly';
}

function periodEndFromBilling(billing, fromDate = new Date()) {
  const d = new Date(fromDate);
  if (billing === 'yearly') {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    d.setMonth(d.getMonth() + 1);
  }
  return d.toISOString();
}

async function paystackRequest(method, path, body) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  return { ok: res.ok && data?.status !== false, status: res.status, data };
}

/**
 * Create or fetch cached Paystack plan for a ZURI plan + interval.
 */
async function ensurePaystackPlan(planId, billing) {
  if (!PAYSTACK_SECRET) throw new Error('Paystack not configured');
  if (!VERIFY_PLANS.has(planId)) throw new Error('Invalid plan');

  const supabase = getDb();
  const { data: cached } = await supabase
    .from('paystack_plan_cache')
    .select('paystack_plan_code, amount_naira')
    .eq('plan_id', planId)
    .eq('billing_interval', billing)
    .maybeSingle();

  const amountNaira = amountNairaFor(planId, billing);
  if (!amountNaira) throw new Error('Invalid billing amount');

  if (cached?.paystack_plan_code && Number(cached.amount_naira) === amountNaira) {
    return { planCode: cached.paystack_plan_code, amountNaira };
  }

  const envKey = `PAYSTACK_PLAN_${String(planId).toUpperCase()}_${billing === 'yearly' ? 'YEARLY' : 'MONTHLY'}`;
  const fromEnv = process.env[envKey];
  if (fromEnv) {
    await supabase.from('paystack_plan_cache').upsert({
      plan_id: planId,
      billing_interval: billing,
      paystack_plan_code: fromEnv,
      amount_naira: amountNaira
    });
    return { planCode: fromEnv, amountNaira };
  }

  const planName = `ZURI ${planId} ${billing}`.slice(0, 50);
  const { ok, data } = await paystackRequest('POST', '/plan', {
    name: planName,
    interval: paystackInterval(billing),
    amount: Math.round(amountNaira * 100),
    currency: 'NGN',
    send_invoices: true,
    send_sms: false
  });

  if (!ok || !data?.data?.plan_code) {
    const msg = data?.message || 'Failed to create Paystack plan';
    console.error('Paystack plan create failed', { planId, billing, msg });
    throw new Error(msg);
  }

  const planCode = data.data.plan_code;
  await supabase.from('paystack_plan_cache').upsert({
    plan_id: planId,
    billing_interval: billing,
    paystack_plan_code: planCode,
    amount_naira: amountNaira
  });

  return { planCode, amountNaira };
}

/**
 * Apply active subscription state on a business row.
 */
async function applyBusinessSubscription(businessId, fields) {
  const supabase = getDb();
  const updates = { ...fields };
  const { error } = await supabase.from('businesses').update(updates).eq('id', businessId);
  if (error) {
    console.error('applyBusinessSubscription error', businessId, error);
    throw error;
  }
}

/**
 * Activate or renew subscription after successful charge / subscription.create.
 */
async function activateBusinessSubscription({
  businessId,
  plan,
  billing,
  subscriptionCode,
  customerCode,
  subscriptionToken,
  planCode,
  periodEnd,
  status = 'active'
}) {
  if (!businessId || !plan || !VERIFY_PLANS.has(plan)) {
    return { ok: false, message: 'Invalid subscription data' };
  }

  const end = periodEnd || periodEndFromBilling(billing);
  try {
    await applyBusinessSubscription(businessId, {
      plan,
      subscription_status: status,
      subscription_interval: billing,
      subscription_current_period_end: end,
      subscription_cancelled_at: null,
      paystack_subscription_code: subscriptionCode || null,
      paystack_customer_code: customerCode || null,
      paystack_subscription_token: subscriptionToken || null,
      paystack_plan_code: planCode || null
    });
  } catch (err) {
    console.error('activateBusinessSubscription DB error', businessId, err);
    const msg = String(err?.message || err || '');
    if (/column|schema|does not exist/i.test(msg)) {
      return {
        ok: false,
        message: 'Subscriptions aren’t ready yet. Please try again later or contact Zuri support.'
      };
    }
    return { ok: false, message: 'Could not save subscription. Please contact support.' };
  }

  return { ok: true, plan, periodEnd: end, message: 'Subscription activated' };
}

/**
 * Disable existing Paystack subscription before plan change.
 */
async function disablePaystackSubscription(businessId) {
  const supabase = getDb();
  const { data: biz } = await supabase
    .from('businesses')
    .select('paystack_subscription_code, paystack_subscription_token')
    .eq('id', businessId)
    .single();

  if (!biz?.paystack_subscription_code) return { ok: true, skipped: true };

  let token = biz.paystack_subscription_token;
  if (!token) {
    const { ok, data } = await paystackRequest('GET', `/subscription/${biz.paystack_subscription_code}`);
    token = data?.data?.email_token;
  }
  if (!token) return { ok: false, error: 'Missing subscription token' };

  const { ok, data } = await paystackRequest('POST', '/subscription/disable', {
    code: biz.paystack_subscription_code,
    token
  });
  if (!ok) {
    const msg = data?.message || 'Failed to disable subscription';
    console.error('Paystack disable subscription', businessId, msg);
    return { ok: false, error: msg };
  }
  return { ok: true };
}

/**
 * Cancel subscription locally + on Paystack.
 */
async function cancelBusinessSubscription(businessId) {
  const supabase = getDb();
  const { data: biz } = await supabase
    .from('businesses')
    .select('subscription_status, subscription_current_period_end, paystack_subscription_code')
    .eq('id', businessId)
    .single();

  if (!biz) return { ok: false, error: 'Business not found' };
  if (!biz.paystack_subscription_code && biz.subscription_status === 'none') {
    await applyBusinessSubscription(businessId, {
      plan: 'free',
      subscription_status: 'none',
      subscription_cancelled_at: new Date().toISOString()
    });
    return { ok: true, plan: 'free', message: 'Your plan is already Free.' };
  }

  if (biz.paystack_subscription_code) {
    const disabled = await disablePaystackSubscription(businessId);
    if (!disabled.ok && !disabled.skipped) {
      return { ok: false, error: disabled.error };
    }
  }

  const now = new Date().toISOString();
  const periodEnd = biz.subscription_current_period_end;
  const keepPlanUntilEnd = periodEnd && new Date(periodEnd) > new Date();

  await applyBusinessSubscription(businessId, {
    subscription_status: 'cancelled',
    subscription_cancelled_at: now,
    ...(keepPlanUntilEnd ? {} : { plan: 'free' })
  });

  return {
    ok: true,
    plan: keepPlanUntilEnd ? undefined : 'free',
    message: keepPlanUntilEnd
      ? 'Subscription cancelled. Your plan stays active until the end of the current billing period.'
      : 'Subscription cancelled. Your account is now on the Free plan.'
  };
}

/**
 * Handle Paystack subscription.create webhook.
 */
async function handleSubscriptionCreate(eventData) {
  const subCode = eventData?.subscription_code;
  const customerCode = eventData?.customer?.customer_code || eventData?.customer?.id;
  const emailToken = eventData?.email_token;
  const planCode = eventData?.plan?.plan_code || eventData?.plan_code;
  const nextPayment = eventData?.next_payment_date;

  const supabase = getDb();
  let businessId = eventData?.metadata?.businessId;

  if (!businessId && eventData?.customer?.email) {
    const { data: biz } = await supabase
      .from('businesses')
      .select('id')
      .eq('email', String(eventData.customer.email).trim().toLowerCase())
      .maybeSingle();
    businessId = biz?.id;
  }

  if (!businessId) {
    console.warn('subscription.create: could not resolve businessId', { subCode });
    return { ok: false };
  }

  const { data: biz } = await supabase
    .from('businesses')
    .select('plan, subscription_interval')
    .eq('id', businessId)
    .single();

  let resolvedPlan = biz?.plan && biz.plan !== 'free' ? biz.plan : null;
  if (!resolvedPlan && planCode) {
    const { data: cached } = await supabase
      .from('paystack_plan_cache')
      .select('plan_id, billing_interval')
      .eq('paystack_plan_code', planCode)
      .maybeSingle();
    if (cached?.plan_id) {
      resolvedPlan = cached.plan_id;
    }
  }

  const billing = biz?.subscription_interval || 'monthly';
  const periodEnd = nextPayment ? new Date(nextPayment).toISOString() : periodEndFromBilling(billing);

  const patch = {
    paystack_subscription_code: subCode || null,
    paystack_customer_code: customerCode || null,
    paystack_subscription_token: emailToken || null,
    paystack_plan_code: planCode || null,
    subscription_status: 'active',
    subscription_current_period_end: periodEnd
  };
  if (resolvedPlan) patch.plan = resolvedPlan;

  await applyBusinessSubscription(businessId, patch);

  return { ok: true, businessId };
}

/**
 * Handle renewal charge.success (subscription object present, not initial sub_ ref).
 */
async function handleSubscriptionRenewal(chargeData) {
  const sub = chargeData?.subscription || chargeData?.plan_object;
  const subCode = chargeData?.subscription?.subscription_code
    || chargeData?.subscription_code
    || (typeof sub === 'object' && sub?.subscription_code);

  if (!subCode) return { ok: false, skipped: true };

  const supabase = getDb();
  const { data: biz } = await supabase
    .from('businesses')
    .select('id, plan, subscription_interval')
    .eq('paystack_subscription_code', subCode)
    .maybeSingle();

  if (!biz) return { ok: false, skipped: true };

  const nextPayment = chargeData?.subscription?.next_payment_date || chargeData?.paid_at;
  const billing = biz.subscription_interval || 'monthly';
  const periodEnd = nextPayment
    ? new Date(nextPayment).toISOString()
    : periodEndFromBilling(billing);

  await applyBusinessSubscription(biz.id, {
    subscription_status: 'active',
    subscription_current_period_end: periodEnd,
    subscription_cancelled_at: null
  });

  return { ok: true, businessId: biz.id };
}

/**
 * Mark subscription past_due on failed invoice payment.
 */
async function handleSubscriptionPaymentFailed(eventData) {
  const subCode = eventData?.subscription?.subscription_code || eventData?.subscription;
  if (!subCode) return { ok: false };

  const supabase = getDb();
  const { data: biz } = await supabase
    .from('businesses')
    .select('id')
    .eq('paystack_subscription_code', subCode)
    .maybeSingle();

  if (!biz) return { ok: false };

  await applyBusinessSubscription(biz.id, { subscription_status: 'past_due' });
  return { ok: true, businessId: biz.id };
}

/**
 * Downgrade plan when billing period has ended.
 */
async function syncExpiredSubscription(businessId) {
  const supabase = getDb();
  const { data: biz } = await supabase
    .from('businesses')
    .select('subscription_status, subscription_current_period_end, plan')
    .eq('id', businessId)
    .single();

  if (!biz?.subscription_current_period_end || biz.subscription_status === 'none') return biz;

  if (new Date(biz.subscription_current_period_end) <= new Date()) {
    await applyBusinessSubscription(businessId, {
      plan: 'free',
      subscription_status: 'none',
      subscription_interval: null,
      paystack_subscription_code: null,
      paystack_subscription_token: null
    });
    return { ...biz, plan: 'free', subscription_status: 'none' };
  }
  return biz;
}

/**
 * Paystack hosted page for customer to update subscription card.
 */
async function getSubscriptionManageLink(subscriptionCode) {
  if (!PAYSTACK_SECRET || !subscriptionCode) {
    return { ok: false, error: 'Subscription manage link not available' };
  }
  const { ok, data } = await paystackRequest('GET', `/subscription/${subscriptionCode}/manage/link/`);
  const link = data?.data?.link;
  if (!ok || !link) {
    const msg = data?.message || 'Could not generate manage link';
    return { ok: false, error: msg };
  }
  return { ok: true, link };
}

/**
 * Manage payment URL for an authenticated business.
 */
async function getManagePaymentUrlForBusiness(businessId) {
  const supabase = getDb();
  const { data: biz } = await supabase
    .from('businesses')
    .select('paystack_subscription_code, subscription_status')
    .eq('id', businessId)
    .single();

  if (!biz?.paystack_subscription_code) {
    return { ok: false, error: 'No active Paystack subscription' };
  }
  if (!['active', 'past_due'].includes(biz.subscription_status)) {
    return { ok: false, error: 'Subscription is not active' };
  }
  return getSubscriptionManageLink(biz.paystack_subscription_code);
}

/**
 * Paystack invoice.create (~3 days before charge) — send branded reminder.
 */
async function handleInvoiceCreate(eventData) {
  const subCode =
    eventData?.subscription?.subscription_code ||
    eventData?.subscription ||
    eventData?.subscription_code;
  if (!subCode) return { ok: false };

  const supabase = getDb();
  const { data: biz } = await supabase
    .from('businesses')
    .select(
      'id, name, email, plan, subscription_interval, subscription_current_period_end, subscription_status, paystack_subscription_code'
    )
    .eq('paystack_subscription_code', subCode)
    .maybeSingle();

  if (!biz || !['active', 'past_due'].includes(biz.subscription_status)) {
    return { ok: false, skipped: true };
  }

  const periodEnd =
    eventData?.due_date ||
    biz.subscription_current_period_end ||
    periodEndFromBilling(biz.subscription_interval || 'monthly');

  const manage = await getSubscriptionManageLink(subCode);
  const { queueSubscriptionRenewalReminder } = require('./subscriptionRenewalEmail');
  queueSubscriptionRenewalReminder({
    businessId: biz.id,
    email: biz.email,
    businessName: biz.name,
    plan: biz.plan,
    billing: biz.subscription_interval || 'monthly',
    periodEnd,
    managePaymentUrl: manage.ok ? manage.link : null,
    isManualRenewal: false
  });

  return { ok: true, businessId: biz.id };
}

const REMINDER_DAYS_AHEAD = Math.max(1, Math.min(7, Number(process.env.SUBSCRIPTION_REMINDER_DAYS) || 3));

/**
 * Scan for upcoming renewals (Paystack fallback + Monnify prepaid) and send reminders.
 */
async function processUpcomingRenewalReminders() {
  const supabase = getDb();
  const now = new Date();
  const horizon = new Date(now);
  horizon.setDate(horizon.getDate() + REMINDER_DAYS_AHEAD);

  const { data: rows, error } = await supabase
    .from('businesses')
    .select(
      'id, name, email, plan, subscription_interval, subscription_current_period_end, subscription_status, subscription_renewal_reminder_for, paystack_subscription_code, payment_provider'
    )
    .in('subscription_status', ['active', 'past_due'])
    .not('subscription_current_period_end', 'is', null)
    .gt('subscription_current_period_end', now.toISOString())
    .lte('subscription_current_period_end', horizon.toISOString());

  if (error || !rows?.length) return { sent: 0 };

  const { queueSubscriptionRenewalReminder } = require('./subscriptionRenewalEmail');
  let sent = 0;

  for (const biz of rows) {
    const periodEnd = biz.subscription_current_period_end;
    const remindedFor = biz.subscription_renewal_reminder_for;
    if (remindedFor && Math.abs(new Date(remindedFor).getTime() - new Date(periodEnd).getTime()) < 60_000) {
      continue;
    }

    const isManualRenewal = !biz.paystack_subscription_code;
    let managePaymentUrl = null;
    if (biz.paystack_subscription_code) {
      const manage = await getSubscriptionManageLink(biz.paystack_subscription_code);
      if (manage.ok) managePaymentUrl = manage.link;
    }

    queueSubscriptionRenewalReminder({
      businessId: biz.id,
      email: biz.email,
      businessName: biz.name,
      plan: biz.plan,
      billing: biz.subscription_interval || 'monthly',
      periodEnd,
      managePaymentUrl,
      isManualRenewal
    });
    sent += 1;
  }

  if (sent > 0) {
    console.log(`[ZURI] Queued ${sent} subscription renewal reminder(s)`);
  }
  return { sent };
}

/**
 * Fetch subscription status for dashboard.
 */
async function getSubscriptionStatus(businessId) {
  await syncExpiredSubscription(businessId);
  const supabase = getDb();
  const { data: biz } = await supabase
    .from('businesses')
    .select(
      'plan, subscription_status, subscription_interval, subscription_current_period_end, subscription_cancelled_at, paystack_subscription_code, payment_provider'
    )
    .eq('id', businessId)
    .single();

  if (!biz) return null;

  const periodEnd = biz.subscription_current_period_end;
  const isRecurring = Boolean(biz.paystack_subscription_code) || biz.subscription_status !== 'none';
  const activeUntilEnd =
    periodEnd &&
    new Date(periodEnd) > new Date() &&
    ['active', 'past_due', 'cancelled'].includes(biz.subscription_status);

  const renewsAutomatically =
    Boolean(biz.paystack_subscription_code) && biz.subscription_status === 'active';

  let managePaymentUrl = null;
  if (renewsAutomatically && biz.paystack_subscription_code) {
    const manage = await getSubscriptionManageLink(biz.paystack_subscription_code);
    if (manage.ok) managePaymentUrl = manage.link;
  }

  return {
    plan: biz.plan || 'free',
    subscriptionStatus: biz.subscription_status || 'none',
    billingInterval: biz.subscription_interval || null,
    currentPeriodEnd: periodEnd || null,
    cancelledAt: biz.subscription_cancelled_at || null,
    isRecurring,
    renewsAutomatically,
    activeUntilEnd: Boolean(activeUntilEnd),
    managePaymentUrl
  };
}

module.exports = {
  recurringEnabled,
  ensurePaystackPlan,
  activateBusinessSubscription,
  disablePaystackSubscription,
  cancelBusinessSubscription,
  handleSubscriptionCreate,
  handleSubscriptionRenewal,
  handleSubscriptionPaymentFailed,
  handleInvoiceCreate,
  processUpcomingRenewalReminders,
  syncExpiredSubscription,
  getSubscriptionStatus,
  getSubscriptionManageLink,
  getManagePaymentUrlForBusiness,
  periodEndFromBilling
};
