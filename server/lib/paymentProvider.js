/**
 * Resolve business payment provider and route payouts.
 */

const { getDb } = require('../database');
const paystackTransfer = require('./paystack-transfer');
const monnifyTransfer = require('./monnify-transfer');
const { isMonnifyConfigured } = require('./monnify');

const VALID_PROVIDERS = new Set(['paystack', 'monnify']);

function normalizeProvider(value) {
  const v = String(value || 'paystack').toLowerCase();
  return VALID_PROVIDERS.has(v) ? v : 'paystack';
}

async function getBusinessPaymentProvider(businessId) {
  const supabase = getDb();
  const { data, error } = await supabase
    .from('businesses')
    .select('payment_provider')
    .eq('id', businessId)
    .single();
  if (error || !data) return 'paystack';
  return normalizeProvider(data.payment_provider);
}

function providerAvailable(provider) {
  if (provider === 'monnify') return isMonnifyConfigured();
  return Boolean(process.env.PAYSTACK_SECRET_KEY);
}

async function processOrderPayout(orderId, amountPaidNaira, paymentProvider) {
  const provider = normalizeProvider(paymentProvider);
  if (provider === 'monnify') {
    return monnifyTransfer.processOrderPayout(orderId, amountPaidNaira);
  }
  return paystackTransfer.processOrderPayout(orderId, amountPaidNaira);
}

async function updatePayoutStatusFromWebhook(reference, status, errorMessage, paymentProvider) {
  const provider = normalizeProvider(paymentProvider);
  if (provider === 'monnify') {
    return monnifyTransfer.updatePayoutStatusFromWebhook(reference, status, errorMessage);
  }
  return paystackTransfer.updatePayoutStatusFromWebhook(reference, status, errorMessage);
}

module.exports = {
  VALID_PROVIDERS,
  normalizeProvider,
  getBusinessPaymentProvider,
  providerAvailable,
  processOrderPayout,
  updatePayoutStatusFromWebhook
};
