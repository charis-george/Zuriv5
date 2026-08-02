/**
 * Mark Paystack-paid orders as paid and send ticket receipts.
 * node scripts/reconcile-stuck-orders.js [orderId]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../server/.env') });
const Paystack = require('@paystack/paystack-sdk');
const { getDb } = require('../server/database');
const { sendOrderReceiptOnce } = require('../server/lib/orderReceiptEmail');
const { isResendConfigured } = require('../server/lib/resendMail');
const { isAcceptableOrderPaymentAmount } = require('../server/lib/transactionFees');

const appPaystack = process.env.PAYSTACK_SECRET_KEY
  ? new Paystack(process.env.PAYSTACK_SECRET_KEY)
  : null;

async function reconcileOrder(orderId) {
  const supabase = getDb();
  const { data: order } = await supabase
    .from('orders')
    .select('id, total_amount, payment_status, receipt_sent_at, customer_email, paystack_payment_reference')
    .eq('id', orderId)
    .maybeSingle();

  if (!order) {
    console.log('Order not found:', orderId);
    return;
  }

  if (!appPaystack) {
    console.error('PAYSTACK_SECRET_KEY missing');
    return;
  }

  const paystackRef = order.paystack_payment_reference || orderId;
  const verify = await appPaystack.transaction.verify({ reference: paystackRef });
  if (!verify?.status || verify?.data?.status !== 'success') {
    console.log('Paystack not successful for', orderId, verify?.data?.status);
    return;
  }

  const paid = verify.data.amount / 100;
  if (!isAcceptableOrderPaymentAmount(order.total_amount, paid)) {
    console.log('Amount mismatch', { orderId, expected: order.total_amount, paid });
    return;
  }

  if (order.payment_status !== 'paid') {
    const paymentMethod = verify.data.metadata?.paymentMethod === 'split' ? 'split' : 'transfer';
    const updates = {
      payment_status: 'paid',
      payment_provider: 'paystack',
      payment_method: paymentMethod
    };
    if (paymentMethod === 'split') {
      updates.payout_status = 'split_settled';
      updates.payout_error = null;
    }
    if (verify.data.id) updates.paystack_transaction_id = verify.data.id;
    await supabase.from('orders').update(updates).eq('id', orderId);
    console.log('Marked paid:', orderId);
  }

  if (!isResendConfigured()) {
    console.warn('RESEND_API_KEY not set — cannot send receipt for', orderId);
    return;
  }

  const result = await sendOrderReceiptOnce({
    orderId,
    paidAt: verify.data.paid_at || null,
    reference: verify.data.reference || orderId
  });
  console.log('Receipt result:', orderId, result?.ok ? 'sent' : result);
}

async function main() {
  const arg = process.argv[2];
  const supabase = getDb();

  if (arg) {
    await reconcileOrder(arg);
    return;
  }

  const { data: orders } = await supabase
    .from('orders')
    .select('id, created_at, payment_status')
    .eq('payment_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(20);

  console.log('Checking', orders?.length || 0, 'pending orders...');
  for (const o of orders || []) {
    await reconcileOrder(o.id);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
