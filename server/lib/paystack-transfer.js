/**
 * Paystack Transfer API: create recipient, initiate transfer, fee handling, idempotency.
 * Used after successful order payment to send business share to their bank account.
 *
 * Env (optional): PAYSTACK_SECRET_KEY (required for transfers),
 * TRANSFER_PLATFORM_FEE_PERCENT (e.g. 5 for 5%), TRANSFER_PLATFORM_FEE_NAIRA (fixed Naira),
 * TRANSFER_MIN_NAIRA (min transfer after fees, default 50).
 */

const { getDb } = require('../database');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_BASE = 'https://api.paystack.co';

// Platform fee: either percentage (e.g. 5 for 5%) or fixed Naira. Prefer percentage if both set.
const FEE_PERCENT = process.env.TRANSFER_PLATFORM_FEE_PERCENT != null
  ? Math.max(0, Math.min(100, Number(process.env.TRANSFER_PLATFORM_FEE_PERCENT)))
  : null;
const FEE_NAIRA = process.env.TRANSFER_PLATFORM_FEE_NAIRA != null
  ? Math.max(0, Number(process.env.TRANSFER_PLATFORM_FEE_NAIRA))
  : null;
const MIN_TRANSFER_NAIRA = Math.max(1, Number(process.env.TRANSFER_MIN_NAIRA) || 50);

async function paystackPost(path, body) {
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

/**
 * Get or create Paystack transfer recipient for a business. Uses cached paystack_recipient_code if set.
 * @returns { Promise<{ recipientCode: string } | { error: string }> }
 */
async function getOrCreateRecipient(supabase, businessId) {
  const { data: business, error: bizError } = await supabase
    .from('businesses')
    .select('id, bank_code, bank_name, account_number, account_name, paystack_recipient_code')
    .eq('id', businessId)
    .single();

  if (bizError || !business) {
    return { error: 'Business not found' };
  }
  if (business.paystack_recipient_code) {
    return { recipientCode: business.paystack_recipient_code };
  }
  if (!business.bank_code || !business.account_number || !business.account_name) {
    return { error: 'Business has no verified bank account' };
  }

  const { data: createRes, ok } = await paystackPost('/transferrecipient', {
    type: 'nuban',
    name: business.account_name,
    account_number: String(business.account_number).replace(/\D/g, ''),
    bank_code: business.bank_code,
    currency: 'NGN'
  });

  if (!ok || !createRes?.data?.recipient_code) {
    const msg = createRes?.message || 'Failed to create transfer recipient';
    console.error('Paystack create recipient failed', { businessId, msg, data: createRes });
    return { error: msg };
  }

  const recipientCode = createRes.data.recipient_code;
  await supabase
    .from('businesses')
    .update({ paystack_recipient_code: recipientCode })
    .eq('id', businessId);

  return { recipientCode };
}

/**
 * Compute transfer amount (in kobo) after platform fee. Minimum TRANSFER_MIN_NAIRA (default 50).
 * @param { number } orderTotalNaira
 * @returns { number } amount in kobo, or 0 if below minimum
 */
/** Default platform fee when no TRANSFER_PLATFORM_FEE_* env is set (matches customer-facing copy). */
const DEFAULT_FEE_PERCENT = 1.5;

function computeTransferAmountKobo(orderTotalNaira) {
  let naira = Number(orderTotalNaira);
  if (!Number.isFinite(naira) || naira <= 0) return 0;
  if (FEE_PERCENT != null && FEE_PERCENT > 0) {
    naira = naira * (1 - FEE_PERCENT / 100);
  } else if (FEE_NAIRA != null && FEE_NAIRA > 0) {
    naira = Math.max(0, naira - FEE_NAIRA);
  } else {
    naira = naira * (1 - DEFAULT_FEE_PERCENT / 100);
  }
  if (naira < MIN_TRANSFER_NAIRA) return 0;
  return Math.round(naira * 100);
}

/**
 * Idempotent: initiate Paystack transfer for an order to the business bank account.
 * Skips if payout_status is already success/processing or business has no bank.
 * Uses reference payout_<orderId> for idempotency.
 * @param { string } orderId - order UUID
 * @param { number } amountPaidNaira - order total (for fee calculation)
 * @returns { Promise<{ ok: boolean, reference?: string, error?: string }> }
 */
async function processOrderPayout(orderId, amountPaidNaira) {
  const supabase = getDb();
  if (!PAYSTACK_SECRET) {
    console.error('processOrderPayout: PAYSTACK_SECRET_KEY not set');
    return { ok: false, error: 'Transfer not configured' };
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('id, business_id, total_amount, payment_status, payout_status, payout_reference')
    .eq('id', orderId)
    .single();

  if (orderErr || !order) {
    return { ok: false, error: 'Order not found' };
  }
  if (order.payment_status !== 'paid') {
    return { ok: false, error: 'Order not paid' };
  }
  if (order.payout_status === 'success' || order.payout_status === 'processing') {
    return { ok: true, reference: order.payout_reference || undefined };
  }

  const businessId = order.business_id;
  const recipientResult = await getOrCreateRecipient(supabase, businessId);
  if (recipientResult.error) {
    await supabase
      .from('orders')
      .update({
        payout_status: 'skipped',
        payout_error: recipientResult.error
      })
      .eq('id', orderId);
    return { ok: false, error: recipientResult.error };
  }

  const amountKobo = computeTransferAmountKobo(amountPaidNaira);
  if (amountKobo < 100) {
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
  if (reference.length < 16 || reference.length > 50) {
    return { ok: false, error: 'Invalid payout reference length' };
  }

  await supabase
    .from('orders')
    .update({ payout_status: 'processing', payout_reference: reference })
    .eq('id', orderId);

  const { data: transferRes, ok } = await paystackPost('/transfer', {
    source: 'balance',
    amount: amountKobo,
    recipient: recipientResult.recipientCode,
    reference,
    reason: `Zuri order payout: ${orderId}`
  });

  if (!ok) {
    const msg = transferRes?.message || 'Transfer request failed';
    await supabase
      .from('orders')
      .update({ payout_status: 'failed', payout_error: msg })
      .eq('id', orderId);
    console.error('Paystack transfer initiate failed', { orderId, reference, msg });
    return { ok: false, error: msg, reference };
  }

  const status = transferRes?.data?.status;
  if (status === 'success') {
    await supabase
      .from('orders')
      .update({ payout_status: 'success', payout_error: null })
      .eq('id', orderId);
  }
  return { ok: true, reference };
}

/**
 * Update order payout_status from Paystack transfer webhook (transfer.success / transfer.failed).
 * @param { string } reference - payout_reference (e.g. payout_<orderId>)
 * @param { 'success' | 'failed' } status
 * @param { string } [errorMessage]
 */
async function updatePayoutStatusFromWebhook(reference, status, errorMessage = null) {
  if (!reference || !['success', 'failed'].includes(status)) return;
  const supabase = getDb();
  const update = status === 'success'
    ? { payout_status: 'success', payout_error: null }
    : { payout_status: 'failed', payout_error: errorMessage || 'Transfer failed' };
  await supabase
    .from('orders')
    .update(update)
    .eq('payout_reference', reference);
}

module.exports = {
  getOrCreateRecipient,
  computeTransferAmountKobo,
  processOrderPayout,
  updatePayoutStatusFromWebhook
};
