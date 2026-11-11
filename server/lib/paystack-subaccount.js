/**
 * Paystack subaccounts for split checkout — commission to ZURI, balance to venue.
 */

const { getDb } = require('../database');
const { feeConfigForMode, computePlatformFeeNaira } = require('./transactionFees');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_BASE = 'https://api.paystack.co';

function splitPaymentsEnabled() {
  if (process.env.USE_PAYSTACK_SPLIT === 'false') return false;
  return Boolean(PAYSTACK_SECRET);
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
  return { ok: res.ok, status: res.status, data };
}

/**
 * Create or update Paystack subaccount for a verified venue.
 * percentage_charge = platform commission % routed to main account.
 */
async function ensurePaystackSubaccount(businessId) {
  if (!PAYSTACK_SECRET) {
    return { error: 'Paystack not configured' };
  }

  const supabase = getDb();
  const { data: business, error } = await supabase
    .from('businesses')
    .select('id, name, bank_code, bank_name, account_number, account_name, bank_verified_at, paystack_subaccount_code, business_mode, payment_provider')
    .eq('id', businessId)
    .single();

  if (error || !business) return { error: 'Business not found' };
  if (business.payment_provider === 'monnify') {
    return { error: 'Split payments require Paystack provider' };
  }
  if (!business.bank_verified_at || !business.bank_code || !business.account_number || !business.account_name) {
    return { error: 'Bank account must be verified before creating subaccount' };
  }

  const { normalizeBusinessMode } = require('./businessMode');
  const mode = normalizeBusinessMode(business.business_mode);
  const { percent } = feeConfigForMode(mode);

  const payload = {
    business_name: String(business.name || 'ZURI Venue').slice(0, 80),
    settlement_bank: business.bank_code,
    account_number: String(business.account_number).replace(/\D/g, ''),
    percentage_charge: percent,
    description: `ZURI venue ${businessId}`
  };

  if (business.paystack_subaccount_code) {
    const { ok, data } = await paystackRequest('PUT', `/subaccount/${business.paystack_subaccount_code}`, payload);
    if (!ok || !data?.data?.subaccount_code) {
      const msg = data?.message || 'Failed to update subaccount';
      console.error('Paystack update subaccount failed', { businessId, msg });
      return { error: msg };
    }
    return { subaccountCode: data.data.subaccount_code };
  }

  const { ok, data } = await paystackRequest('POST', '/subaccount', payload);
  if (!ok || !data?.data?.subaccount_code) {
    const msg = data?.message || 'Failed to create subaccount';
    console.error('Paystack create subaccount failed', { businessId, msg });
    return { error: msg };
  }

  const subaccountCode = data.data.subaccount_code;
  await supabase
    .from('businesses')
    .update({ paystack_subaccount_code: subaccountCode })
    .eq('id', businessId);

  return { subaccountCode };
}

/**
 * Build Paystack initialize params for split checkout.
 * Paystack transaction_charge overrides subaccount percentage_charge, so pass the
 * full platform fee (percent + flat) per order — not just the flat component.
 */
function buildSplitCheckoutParams(business, orderTotalNaira) {
  if (!business?.paystack_subaccount_code || !business.bank_verified_at) {
    return null;
  }
  const { normalizeBusinessMode } = require('./businessMode');
  const mode = normalizeBusinessMode(business.business_mode);
  const params = {
    subaccount: business.paystack_subaccount_code,
    bearer: 'subaccount'
  };
  const amountKobo = Math.round(Number(orderTotalNaira) * 100);
  const platformFeeKobo = Math.round(computePlatformFeeNaira(orderTotalNaira, mode) * 100);
  if (platformFeeKobo > 0 && amountKobo > platformFeeKobo) {
    params.transaction_charge = platformFeeKobo;
  }
  return params;
}

async function getBusinessForSplitCheckout(businessId) {
  const supabase = getDb();
  const { data } = await supabase
    .from('businesses')
    .select('id, name, business_mode, payment_provider, bank_verified_at, paystack_subaccount_code, account_status')
    .eq('id', businessId)
    .single();
  return data;
}

module.exports = {
  splitPaymentsEnabled,
  ensurePaystackSubaccount,
  buildSplitCheckoutParams,
  getBusinessForSplitCheckout
};
