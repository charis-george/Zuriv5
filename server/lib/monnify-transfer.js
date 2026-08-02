/**
 * Monnify disbursement (single transfer) for order payouts.
 * Env: MONNIFY_* keys, MONNIFY_WALLET_ACCOUNT_NUMBER (source wallet).
 */

const { getDb } = require('../database');
const { getAccessToken, isMonnifyConfigured, MONNIFY_BASE_URL } = require('./monnify');
const {
  computeTransferAmountKobo,
  feeConfigForMode
} = require('./paystack-transfer');

const MONNIFY_WALLET_ACCOUNT = process.env.MONNIFY_WALLET_ACCOUNT_NUMBER || '';
const MIN_TRANSFER_NAIRA = Math.max(1, Number(process.env.TRANSFER_MIN_NAIRA) || 50);

async function monnifyDisbursePost(body) {
  const token = await getAccessToken();
  const res = await fetch(`${MONNIFY_BASE_URL}/api/v2/disbursements/single`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return { ok: res.ok && data?.requestSuccessful === true, status: res.status, data };
}

/**
 * @param { string } orderId
 * @param { number } amountPaidNaira
 */
async function processOrderPayout(orderId, amountPaidNaira) {
  const supabase = getDb();
  if (!isMonnifyConfigured()) {
    console.error('processMonnifyPayout: Monnify not configured');
    return { ok: false, error: 'Monnify transfer not configured' };
  }
  if (!MONNIFY_WALLET_ACCOUNT) {
    console.error('processMonnifyPayout: MONNIFY_WALLET_ACCOUNT_NUMBER not set');
    return { ok: false, error: 'Monnify wallet not configured' };
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, business_id, total_amount, payment_status, payout_status, payout_reference')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) return { ok: false, error: 'Order not found' };
  if (order.payment_status !== 'paid') return { ok: false, error: 'Order not paid' };
  if (order.payout_status === 'success' || order.payout_status === 'processing') {
    return { ok: true, reference: order.payout_reference || undefined };
  }

  const businessId = order.business_id;
  let businessMode = 'menu';
  const { data: biz, error: bizErr } = await supabase
    .from('businesses')
    .select('business_mode, bank_code, bank_name, account_number, account_name, bank_verified_at')
    .eq('id', businessId)
    .single();

  if (bizErr || !biz) return { ok: false, error: 'Business not found' };
  if (biz.business_mode === 'ticketing') businessMode = 'ticketing';
  if (!biz.bank_verified_at || !biz.bank_code || !biz.account_number || !biz.account_name) {
    await supabase
      .from('orders')
      .update({ payout_status: 'skipped', payout_error: 'Business has no verified bank account' })
      .eq('id', orderId);
    return { ok: false, error: 'Business has no verified bank account' };
  }

  const feeConfig = feeConfigForMode(businessMode);
  const amountKobo = computeTransferAmountKobo(amountPaidNaira, feeConfig.percent, feeConfig.flatNaira);
  const amountNaira = amountKobo / 100;
  if (amountNaira < MIN_TRANSFER_NAIRA) {
    await supabase
      .from('orders')
      .update({
        payout_status: 'skipped',
        payout_error: `Transfer amount below minimum (₦${MIN_TRANSFER_NAIRA}) after fees`
      })
      .eq('id', orderId);
    return { ok: false, error: 'Transfer amount below minimum after fees' };
  }

  const reference = `payout_${orderId}`.toLowerCase().replace(/-/g, '_');
  await supabase
    .from('orders')
    .update({ payout_status: 'processing', payout_reference: reference })
    .eq('id', orderId);

  const { ok, data } = await monnifyDisbursePost({
    amount: amountNaira,
    reference,
    narration: `Zuri order payout: ${orderId}`,
    destinationBankCode: biz.bank_code,
    destinationAccountNumber: String(biz.account_number).replace(/\D/g, ''),
    destinationAccountName: biz.account_name,
    currency: 'NGN',
    sourceAccountNumber: MONNIFY_WALLET_ACCOUNT
  });

  if (!ok) {
    const msg = data?.responseMessage || 'Monnify disbursement failed';
    await supabase
      .from('orders')
      .update({ payout_status: 'failed', payout_error: msg })
      .eq('id', orderId);
    console.error('Monnify disbursement failed', { orderId, reference, msg });
    return { ok: false, error: msg, reference };
  }

  const status = String(data?.responseBody?.status || '').toUpperCase();
  if (status === 'SUCCESS' || status === 'COMPLETED') {
    await supabase
      .from('orders')
      .update({ payout_status: 'success', payout_error: null })
      .eq('id', orderId);
  }
  return { ok: true, reference };
}

/**
 * @param { string } reference
 * @param { 'success' | 'failed' } status
 * @param { string } [errorMessage]
 */
async function updatePayoutStatusFromWebhook(reference, status, errorMessage = null) {
  if (!reference || !['success', 'failed'].includes(status)) return;
  const supabase = getDb();
  const update = status === 'success'
    ? { payout_status: 'success', payout_error: null }
    : { payout_status: 'failed', payout_error: errorMessage || 'Transfer failed' };
  await supabase.from('orders').update(update).eq('payout_reference', reference);
}

module.exports = {
  processOrderPayout,
  updatePayoutStatusFromWebhook
};
