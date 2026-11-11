/**
 * Initialize checkout for orders and subscriptions across Paystack / Monnify.
 */

const Paystack = require('@paystack/paystack-sdk');
const {
  buildOrderPaymentMetadata,
  buildSubscriptionPaymentMetadata,
  buildMonnifyRedirectUrl,
  buildPaystackPaymentReference,
  paystackCheckoutExtras,
  withReferenceOnCallback
} = require('./paystackCheckout');
const {
  isMonnifyConfigured,
  initTransaction,
  monnifyPublicConfig,
  buildMonnifyPaymentReference
} = require('./monnify');
const { getDb } = require('../database');
const { normalizeProvider, providerAvailable } = require('./paymentProvider');
const {
  splitPaymentsEnabled,
  buildSplitCheckoutParams,
  getBusinessForSplitCheckout,
  ensurePaystackSubaccount
} = require('./paystack-subaccount');
const {
  recurringEnabled,
  ensurePaystackPlan,
  disablePaystackSubscription
} = require('./paystack-subscription');
const { normalizePaystackSdkError } = require('./paystackErrorUtil');

const appPaystack = process.env.PAYSTACK_SECRET_KEY ? new Paystack(process.env.PAYSTACK_SECRET_KEY) : null;

async function initializePaystackOrder({ email, orderTotal, orderId, businessId, callbackUrl, saveCard, tap }) {
  const amountInKobo = Math.round(orderTotal * 100);
  let paymentMethod = 'transfer';
  let splitParams = {};
  if (splitPaymentsEnabled()) {
    let business = await getBusinessForSplitCheckout(businessId);
    if (business?.bank_verified_at && !business.paystack_subaccount_code) {
      await ensurePaystackSubaccount(businessId);
      business = await getBusinessForSplitCheckout(businessId);
    }
    const split = buildSplitCheckoutParams(business, orderTotal);
    if (split) {
      splitParams = split;
      paymentMethod = 'split';
    }
  }

  const metadata = buildOrderPaymentMetadata({
    orderId,
    businessId,
    saveCard: !!saveCard,
    tap: !!tap,
    paymentMethod: paymentMethod === 'split' ? 'split' : undefined
  });

  const paymentReference = buildPaystackPaymentReference(orderId);

  let response;
  try {
    response = await appPaystack.transaction.initialize({
      email,
      amount: amountInKobo,
      reference: paymentReference,
      callback_url: withReferenceOnCallback(callbackUrl, paymentReference),
      currency: 'NGN',
      metadata,
      ...splitParams,
      ...paystackCheckoutExtras()
    });
  } catch (err) {
    const normalized = normalizePaystackSdkError(err);
    if (normalized) {
      const e = new Error(normalized.message);
      e.status = normalized.status;
      e.code = normalized.code;
      throw e;
    }
    throw err;
  }
  if (!response.status || !response.data) {
    const msg = response?.message || 'Failed to initialize Paystack payment';
    console.error('Paystack initialize failed', { orderId, paymentReference, message: msg, response });
    throw new Error(msg);
  }

  const supabase = getDb();
  const { error: orderUpdateError } = await supabase
    .from('orders')
    .update({ payment_method: paymentMethod, paystack_payment_reference: paymentReference })
    .eq('id', orderId);
  if (orderUpdateError) {
    console.error('Paystack initialize: failed to persist payment_method on order', {
      orderId,
      paymentMethod,
      message: orderUpdateError.message || orderUpdateError
    });
  }

  return {
    provider: 'paystack',
    orderId,
    authorizationUrl: response.data.authorization_url,
    accessCode: response.data.access_code,
    reference: response.data.reference,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || null,
    paymentMethod
  };
}

async function initializeMonnifyOrder({ email, orderTotal, orderId, businessId, callbackUrl, saveCard, tap, customerName }) {
  const paymentReference = buildMonnifyPaymentReference(orderId);
  const body = await initTransaction({
    amount: orderTotal,
    customerName: customerName || 'Customer',
    customerEmail: email,
    paymentReference,
    paymentDescription: `ZURI order ${String(orderId).slice(0, 8)}`,
    redirectUrl: buildMonnifyRedirectUrl(orderId, callbackUrl, 'payment-done'),
    metaData: {
      orderId: String(orderId),
      businessId: String(businessId),
      save_card: saveCard ? 'true' : 'false',
      tap: tap ? 'true' : 'false'
    }
  });

  const supabase = getDb();
  await supabase
    .from('orders')
    .update({ monnify_payment_reference: paymentReference })
    .eq('id', orderId);

  const pub = monnifyPublicConfig();
  return {
    provider: 'monnify',
    orderId,
    reference: paymentReference,
    transactionReference: body.transactionReference || null,
    checkoutUrl: body.checkoutUrl || null,
    apiKey: body.apiKey || pub.apiKey,
    contractCode: pub.contractCode,
    amount: orderTotal,
    customerEmail: email,
    customerName: customerName || 'Customer',
    isTestMode: pub.isTestMode
  };
}

async function initializeOrderPayment(params) {
  if (!appPaystack) {
    const err = new Error('Payment not configured');
    err.status = 503;
    throw err;
  }
  return initializePaystackOrder(params);
}

async function initializePaystackSubscription({ email, reference, amountNaira, businessId, plan, billing, callbackUrl }) {
  const metadata = buildSubscriptionPaymentMetadata({ businessId, plan, billing, callbackUrl: callbackUrl || null });

  if (recurringEnabled()) {
    await disablePaystackSubscription(businessId).catch((err) =>
      console.warn('Could not disable prior subscription before upgrade', businessId, err?.message || err)
    );

    const { planCode, amountNaira: planAmount } = await ensurePaystackPlan(plan, billing);
    metadata.paystackPlanCode = planCode;

    const amountInKobo = Math.round(planAmount * 100);
    let response;
    try {
      response = await appPaystack.transaction.initialize({
        email,
        amount: amountInKobo,
        plan: planCode,
        reference,
        callback_url: withReferenceOnCallback(callbackUrl, reference),
        currency: 'NGN',
        metadata,
        channels: ['card', 'bank', 'bank_transfer', 'ussd'],
        ...paystackCheckoutExtras()
      });
    } catch (err) {
      const normalized = normalizePaystackSdkError(err);
      if (normalized) {
        const e = new Error(normalized.message);
        e.status = normalized.status;
        e.code = normalized.code;
        throw e;
      }
      throw err;
    }
    if (!response.status || !response.data) {
      throw new Error('Failed to initialize Paystack recurring subscription');
    }
    return {
      provider: 'paystack',
      authorizationUrl: response.data.authorization_url,
      accessCode: response.data.access_code,
      reference: response.data.reference,
      publicKey: process.env.PAYSTACK_PUBLIC_KEY || null,
      recurring: true,
      amount: planAmount
    };
  }

  const amountInKobo = Math.round(amountNaira * 100);
  let response;
  try {
    response = await appPaystack.transaction.initialize({
      email,
      amount: amountInKobo,
      reference,
      callback_url: withReferenceOnCallback(callbackUrl, reference),
      currency: 'NGN',
      metadata,
      ...paystackCheckoutExtras()
    });
  } catch (err) {
    const normalized = normalizePaystackSdkError(err);
    if (normalized) {
      const e = new Error(normalized.message);
      e.status = normalized.status;
      e.code = normalized.code;
      throw e;
    }
    throw err;
  }
  if (!response.status || !response.data) {
    throw new Error('Failed to initialize Paystack subscription payment');
  }
  return {
    provider: 'paystack',
    authorizationUrl: response.data.authorization_url,
    accessCode: response.data.access_code,
    reference: response.data.reference,
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || null,
    recurring: false,
    amount: amountNaira
  };
}

async function initializeMonnifySubscription({ email, reference, amountNaira, businessId, plan, billing, callbackUrl, customerName }) {
  const body = await initTransaction({
    amount: amountNaira,
    customerName: customerName || 'Business',
    customerEmail: email,
    paymentReference: reference,
    paymentDescription: `ZURI ${plan} subscription`,
    redirectUrl: buildMonnifyRedirectUrl(reference, callbackUrl, 'upgrade-done'),
    metaData: {
      type: 'subscription',
      businessId: String(businessId),
      plan: String(plan),
      interval: String(billing)
    }
  });
  const pub = monnifyPublicConfig();
  return {
    provider: 'monnify',
    reference: body.paymentReference || reference,
    transactionReference: body.transactionReference || null,
    checkoutUrl: body.checkoutUrl || null,
    apiKey: body.apiKey || pub.apiKey,
    contractCode: pub.contractCode,
    amount: amountNaira,
    customerEmail: email,
    customerName: customerName || 'Business',
    isTestMode: pub.isTestMode,
    recurring: false
  };
}

async function initializeSubscriptionPayment(params) {
  if (!appPaystack) {
    const err = new Error('Payment not configured');
    err.status = 503;
    throw err;
  }
  return initializePaystackSubscription(params);
}

module.exports = {
  initializeOrderPayment,
  initializeSubscriptionPayment
};
