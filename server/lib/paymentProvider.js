/**
 * Resolve business payment provider and route payouts.
 */

const paystackTransfer = require('./paystack-transfer');
const monnifyTransfer = require('./monnify-transfer');

const VALID_PROVIDERS = new Set(['paystack', 'monnify']);

function normalizeProvider(value) {
  const v = String(value || 'paystack').toLowerCase();
  return VALID_PROVIDERS.has(v) ? v : 'paystack';
}

async function getBusinessPaymentProvider(_businessId) {
  return 'paystack';
}

function providerAvailable(provider) {
  if (provider === 'monnify') return false;
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
