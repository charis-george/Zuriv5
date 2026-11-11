const { getDb } = require('../database');
const { processOrderPayout, updatePayoutStatusFromWebhook } = require('../lib/paymentProvider');
const { splitPaymentsEnabled } = require('../lib/paystack-subaccount');
const { queueOrderReceiptOnce, queueOrderReceiptIfNeeded } = require('../lib/orderReceiptEmail');
const { notifyBusinessNewOrder } = require('../lib/webPush');
const { queueBusinessEmail } = require('../lib/notifications');
const { decideSettlement } = require('../lib/webhookSettlement');
const {
  isMonnifyConfigured,
  getTransactionByPaymentReference,
  isPaidTransaction,
  amountPaidNaira,
  verifyWebhookSignature,
  webhookRawBody,
  parseWebhookPayload,
  normalizeMetaData,
  orderIdFromMonnifyMeta,
  MONNIFY_BASE_URL
} = require('../lib/monnify');
const { activateSubscriptionFromMonnify } = require('../lib/subscriptionActivate');

const supabase = getDb();

function isReusableCardAuthorization(auth) {
  if (!auth?.authorization_code) return false;
  if (auth.reusable === false) return false;
  const channel = String(auth.channel || '').toLowerCase();
  return channel === 'card';
}

async function orderUsesSplitCheckout(orderId, businessId, markExtra = {}) {
  if (markExtra.paymentMethod === 'split') return true;

  const { data: order } = await supabase
    .from('orders')
    .select('payment_method')
    .eq('id', orderId)
    .maybeSingle();
  if (order?.payment_method === 'split') return true;
  if (order?.payment_method === 'transfer' || order?.payment_method === 'free') return false;

  if (!splitPaymentsEnabled() || !businessId) return false;
  const { data: biz } = await supabase
    .from('businesses')
    .select('payment_provider, bank_verified_at, paystack_subaccount_code')
    .eq('id', businessId)
    .maybeSingle();
  if (!biz || biz.payment_provider === 'monnify') return false;
  return Boolean(biz.bank_verified_at && biz.paystack_subaccount_code);
}

async function markOrderPaid(orderId, paymentProvider, extra = {}) {
  const { paymentMethod, ...persistExtra } = extra;
  const cleanedExtra = Object.fromEntries(
    Object.entries(persistExtra).filter(([, v]) => v !== undefined)
  );

  const { data: existing } = await supabase
    .from('orders')
    .select('business_id, payment_method')
    .eq('id', orderId)
    .maybeSingle();

  const isSplit = await orderUsesSplitCheckout(orderId, existing?.business_id, { paymentMethod });

  const updates = {
    payment_status: 'paid',
    payment_provider: paymentProvider,
    ...cleanedExtra
  };
  if (isSplit) {
    updates.payment_method = 'split';
    updates.payout_status = 'split_settled';
    updates.payout_error = null;
  } else if (paymentMethod) {
    updates.payment_method = paymentMethod;
  } else if (!existing?.payment_method) {
    updates.payment_method = 'transfer';
  }

  const { data, error } = await supabase
    .from('orders')
    .update(updates)
    .eq('id', orderId)
    .select('id, business_id, payment_status, payment_method, payout_status')
    .maybeSingle();
  if (error) {
    console.error('[ZURI] markOrderPaid failed', { orderId, message: error.message || error });
    return { ok: false, error };
  }
  if (!data || data.payment_status !== 'paid') {
    console.error('[ZURI] markOrderPaid did not persist', { orderId, data });
    return { ok: false, error: new Error('payment_status not updated') };
  }
  return { ok: true, order: data };
}

function emitOrderPaid(req, businessId, orderId) {
  const io = req?.app?.get?.('io');
  if (io && businessId) {
    io.to(`business-${businessId}`).emit('order-payment-success', { orderId });
  }
}

function emitTapSuccess(req, businessId, orderId) {
  const io = req?.app?.get?.('io');
  if (io && businessId) io.to(`business-${businessId}`).emit('tap-payment-success', { orderId });
}

async function shouldSchedulePayout(orderId) {
  const { data: order } = await supabase
    .from('orders')
    .select('payment_method, payout_status')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return false;
  if (order.payment_method === 'split' || order.payment_method === 'free') return false;
  if (order.payout_status === 'split_settled') return false;
  return true;
}

function schedulePayout(orderId, amount, paymentProvider) {
  setImmediate(async () => {
    try {
      const go = await shouldSchedulePayout(orderId);
      if (!go) return;
      await processOrderPayout(orderId, amount, paymentProvider);
    } catch (err) {
      console.error('Payout error', orderId, paymentProvider, err);
    }
  });
}

async function notifyTicketingSalePaid(businessId, orderId) {
  const { data: business } = await supabase
    .from('businesses')
    .select('business_mode')
    .eq('id', businessId)
    .maybeSingle();
  if (!business || business.business_mode !== 'ticketing') return;

  const { data: order } = await supabase
    .from('orders')
    .select('id, customer_name, customer_phone, total_amount, status, payment_status')
    .eq('id', orderId)
    .maybeSingle();
  if (!order || order.payment_status !== 'paid') return;

  const { data: orderItems } = await supabase
    .from('order_items')
    .select('menu_item_id, quantity, price')
    .eq('order_id', orderId);

  let itemLines = '(no items)';
  if (orderItems?.length) {
    const menuIds = orderItems.map((i) => i.menu_item_id).filter(Boolean);
    const { data: menuItems } = await supabase.from('menu_items').select('id, name').in('id', menuIds);
    const nameMap = (menuItems || []).reduce((acc, m) => {
      acc[m.id] = m.name;
      return acc;
    }, {});
    itemLines = orderItems
      .map((it) => `- ${it.quantity}× ${nameMap[it.menu_item_id] || 'Item'} (${Number(it.price).toFixed(2)})`)
      .join('\n');
  }

  await notifyBusinessNewOrder(
    businessId,
    {
      ...order,
      customerName: order.customer_name,
      totalAmount: order.total_amount
    },
    { title: 'New ticket sale' }
  );

  queueBusinessEmail({
    businessId,
    subject: `New ticket sale (${order.status})`,
    text: [
      `You received a new paid ticket sale from ${order.customer_name || 'a guest'}.`,
      ``,
      `Order: #${String(order.id).slice(0, 8).toUpperCase()}`,
      `Total: ₦${Number(order.total_amount || 0).toFixed(2)}`,
      `Phone: ${order.customer_phone || '—'}`,
      ``,
      `Items:`,
      itemLines,
      ``,
      `Open your dashboard to confirm the sale.`
    ].join('\n')
  });
}

async function finalizePaidOrder({
  req,
  orderId,
  businessId,
  paymentProvider,
  markExtra = {},
  paidAt,
  reference,
  payoutAmount,
  tap = false
}) {
  const marked = await markOrderPaid(orderId, paymentProvider, markExtra);
  if (!marked.ok) return marked;

  const bid = businessId || marked.order?.business_id;
  emitOrderPaid(req, bid, orderId);
  if (tap) emitTapSuccess(req, bid, orderId);
  const isSplit = marked.order?.payment_method === 'split' || marked.order?.payout_status === 'split_settled';
  if (!isSplit && payoutAmount != null) schedulePayout(orderId, payoutAmount, paymentProvider);

  const receiptArgs = { orderId, paidAt: paidAt || null, reference: reference || orderId };
  queueOrderReceiptOnce(receiptArgs);
  setTimeout(() => {
    try {
      queueOrderReceiptOnce(receiptArgs);
    } catch (err) {
      console.warn('[ZURI] Receipt safety re-queue failed', {
        orderId,
        cause: err?.message || String(err)
      });
    }
  }, 3_000);

  if (bid) {
    notifyTicketingSalePaid(bid, orderId).catch((e) => {
      console.error('[ZURI] ticketing paid notify error:', e?.message || e);
    });
  }

  return marked;
}

async function processMonnifyWebhook(req) {
  if (!isMonnifyConfigured()) {
    console.warn('Monnify webhook received but Monnify is not configured');
    return;
  }

  const signature = req.headers['monnify-signature'];
  const rawBody = webhookRawBody(req);

  let payload;
  try {
    payload = parseWebhookPayload(req);
  } catch (e) {
    console.error('Monnify webhook invalid JSON', e);
    return;
  }
  if (!payload) return;

  const verified = rawBody.length > 0 && verifyWebhookSignature(rawBody, signature);
  const sandbox = MONNIFY_BASE_URL.includes('sandbox');
  if (!verified) {
    console.error('Monnify webhook signature mismatch', {
      hasSignature: Boolean(signature),
      bodyLength: rawBody.length,
      sandbox
    });
    if (!sandbox) return;
    console.warn('Monnify sandbox: processing webhook without verified signature');
  }

  const eventType = String(payload?.eventType || '').toUpperCase();
  const eventData = payload?.eventData || payload?.event_data || {};

  if (eventType.includes('DISBURSEMENT') || eventType.includes('DISBURSE')) {
    const ref = eventData?.reference || eventData?.transactionReference;
    if (!ref || !String(ref).startsWith('payout_')) return;
    if (eventType.includes('SUCCESS')) {
      await updatePayoutStatusFromWebhook(ref, 'success', null, 'monnify');
    } else if (eventType.includes('FAIL') || eventType.includes('REVERSED')) {
      const msg = eventData?.completeMessage || eventData?.responseMessage || 'Disbursement failed';
      await updatePayoutStatusFromWebhook(ref, 'failed', msg, 'monnify');
    }
    return;
  }

  const paymentReference = eventData?.paymentReference || eventData?.product?.reference;
  if (!paymentReference) return;

  const eventPaid =
    String(eventData?.paymentStatus || '').toUpperCase() === 'PAID' ||
    eventType.includes('SUCCESSFUL');

  if (String(paymentReference).startsWith('sub_') && eventPaid) {
    await activateSubscriptionFromMonnify({
      paymentReference,
      paymentStatus: 'PAID',
      amountPaid: eventData?.amountPaid ?? eventData?.totalPayable,
      metaData: eventData?.metaData || eventData?.metadata
    });
    return;
  }

  const tx = await getTransactionByPaymentReference(paymentReference);
  if (!tx || !isPaidTransaction(tx)) return;

  if (String(paymentReference).startsWith('sub_')) {
    await activateSubscriptionFromMonnify(tx);
    return;
  }

  const orderId = orderIdFromMonnifyMeta(tx) || paymentReference;
  const { data: order } = await supabase
    .from('orders')
    .select('id, business_id, total_amount, payment_status, receipt_sent_at')
    .eq('id', orderId)
    .single();
  if (!order) {
    console.warn('[ZURI] Monnify webhook order not found', { orderId, paymentReference });
    return;
  }

  const paid = amountPaidNaira(tx);
  const decision = decideSettlement(order, paid);
  if (decision.action === 'already_complete' || decision.action === 'retry_receipt') {
    const queued = queueOrderReceiptIfNeeded(order, {
      paidAt: tx.paidOn || null,
      reference: paymentReference || order.id
    });
    if (queued?.queued) {
      console.log('[ZURI] Monnify webhook re-queued receipt for paid order', { orderId: order.id });
    }
    return;
  }
  if (decision.action === 'amount_mismatch') {
    console.error('Monnify webhook amount mismatch', { orderId, orderTotal: order.total_amount, paid });
    return;
  }
  if (decision.action !== 'finalize') return;

  const meta = normalizeMetaData(tx.metaData || tx.metadata);
  const marked = await finalizePaidOrder({
    req,
    orderId,
    businessId: meta.businessId || order.business_id,
    paymentProvider: 'monnify',
    paidAt: tx.paidOn || null,
    reference: paymentReference,
    payoutAmount: paid,
    tap: meta.tap === 'true'
  });
  if (!marked.ok) {
    console.error('Monnify webhook mark paid failed', { orderId });
  }
}

module.exports = {
  isReusableCardAuthorization,
  finalizePaidOrder,
  emitTapSuccess,
  processMonnifyWebhook,
  decideSettlement
};
