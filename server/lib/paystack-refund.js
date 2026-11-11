/**
 * Paystack refund API for ticket/order reversals.
 */

const { getDb } = require('../database');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_BASE = 'https://api.paystack.co';

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
 * Refund a paid order via Paystack.
 * @param {string} orderId
 * @param {{ amountNaira?: number, reason?: string }} [opts] — partial refund if amountNaira set
 */
async function refundOrderPayment(orderId, opts = {}) {
  if (!PAYSTACK_SECRET) {
    return { ok: false, error: 'Paystack not configured' };
  }

  const supabase = getDb();
  const { data: order, error } = await supabase
    .from('orders')
    .select('id, business_id, total_amount, payment_status, payment_provider, refund_amount, paystack_transaction_id')
    .eq('id', orderId)
    .single();

  if (error || !order) return { ok: false, error: 'Order not found' };
  if (order.payment_status !== 'paid' && order.payment_status !== 'partially_refunded') {
    return { ok: false, error: 'Order is not in a refundable state' };
  }
  if (order.payment_provider && order.payment_provider !== 'paystack') {
    return { ok: false, error: 'Refunds are only supported for Paystack payments currently' };
  }

  const total = Number(order.total_amount);
  const alreadyRefunded = Number(order.refund_amount || 0);
  const remaining = total - alreadyRefunded;
  if (remaining <= 0) return { ok: false, error: 'Order already fully refunded' };

  const refundNaira = opts.amountNaira != null ? Number(opts.amountNaira) : remaining;
  if (!Number.isFinite(refundNaira) || refundNaira <= 0 || refundNaira > remaining + 0.01) {
    return { ok: false, error: 'Invalid refund amount' };
  }

  const body = {
    transaction: order.paystack_transaction_id || orderId,
    amount: Math.round(refundNaira * 100),
    currency: 'NGN',
    customer_note: opts.reason || 'Refund processed by ZURI',
    merchant_note: `ZURI refund for order ${orderId}`
  };

  const { ok, data } = await paystackPost('/refund', body);
  if (!ok) {
    const msg = data?.message || 'Refund failed';
    console.error('Paystack refund failed', { orderId, msg });
    return { ok: false, error: msg };
  }

  const newRefundTotal = alreadyRefunded + refundNaira;
  const newStatus = newRefundTotal >= total - 0.01 ? 'refunded' : 'partially_refunded';
  const refundRef = data?.data?.transaction?.reference || data?.data?.id || `refund_${orderId}`;

  await supabase
    .from('orders')
    .update({
      payment_status: newStatus,
      refund_amount: newRefundTotal,
      refund_reference: refundRef,
      status: newStatus === 'refunded' ? 'cancelled' : undefined
    })
    .eq('id', orderId);

  return { ok: true, refundAmount: refundNaira, paymentStatus: newStatus, reference: refundRef };
}

module.exports = {
  refundOrderPayment
};
