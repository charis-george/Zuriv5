const express = require('express');
const router = express.Router();
const Paystack = require('@paystack/paystack-sdk');
const { getDb } = require('../database');
const {
  getBusinessPaymentProvider,
  processOrderPayout,
  updatePayoutStatusFromWebhook,
  normalizeProvider
} = require('../lib/paymentProvider');
const { initializeOrderPayment } = require('../lib/paymentInitialize');
const { buildPaystackPaymentReference, parsePaymentMethodFromPaystackMetadata } = require('../lib/paystackCheckout');
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
  parseMonnifyReturnRefs,
  MONNIFY_BASE_URL,
  monnifyWebhookUrl
} = require('../lib/monnify');
const { queueOrderReceiptOnce, queueOrderReceiptIfNeeded } = require('../lib/orderReceiptEmail');
const { notifyBusinessNewOrder } = require('../lib/webPush');
const { queueBusinessEmail } = require('../lib/notifications');
const { isAcceptableOrderPaymentAmount } = require('../lib/transactionFees');
const {
  activateSubscriptionFromCharge,
  activateSubscriptionFromMonnify
} = require('../lib/subscriptionActivate');
const { canAcceptPayments, statusMessage } = require('../lib/businessStatus');
const { refundOrderPayment } = require('../lib/paystack-refund');
const { normalizePaystackSdkError } = require('../lib/paystackErrorUtil');
const { requireBusinessAuth } = require('../middleware/auth');
const {
  handleSubscriptionCreate,
  handleSubscriptionRenewal,
  handleSubscriptionPaymentFailed,
  handleInvoiceCreate
} = require('../lib/paystack-subscription');
const { splitPaymentsEnabled } = require('../lib/paystack-subaccount');

const supabase = getDb();
const appPaystack = process.env.PAYSTACK_SECRET_KEY ? new Paystack(process.env.PAYSTACK_SECRET_KEY) : null;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';

/** Only persist Paystack card authorizations — never bank transfer, USSD, etc. */
function isReusableCardAuthorization(auth) {
  if (!auth?.authorization_code) return false;
  if (auth.reusable === false) return false;
  const channel = String(auth.channel || '').toLowerCase();
  return channel === 'card';
}

/** True when checkout split funds to a Paystack subaccount (no manual transfer needed). */
async function orderUsesSplitCheckout(orderId, businessId, markExtra = {}) {
  if (markExtra.paymentMethod === 'split') return true;

  const { data: order } = await supabase
    .from('orders')
    .select('payment_method')
    .eq('id', orderId)
    .maybeSingle();
  if (order?.payment_method === 'split') return true;
  if (order?.payment_method === 'transfer' || order?.payment_method === 'free') return false;

  // payment_method unset — infer split only when venue has an active Paystack subaccount
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
  const io = req.app.get('io');
  if (io && businessId) io.to(`business-${businessId}`).emit('tap-payment-success', { orderId });
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
  // Immediate priority enqueue (concurrency workers start in the same tick).
  // Guest QR email must leave the moment payment clears — like Paystack's own receipts.
  const receiptArgs = { orderId, paidAt: paidAt || null, reference: reference || orderId };
  queueOrderReceiptOnce(receiptArgs);
  // Short safety net only: if the first worker lost a race with deploy/lock, re-kick once.
  // Deduped by in-memory queue + DB send lock + Resend Idempotency-Key (zuri-receipt-{orderId}).
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

  // Ticketing checkouts create unpaid orders first — alert the venue only once payment clears.
  if (bid) {
    notifyTicketingSalePaid(bid, orderId).catch((e) => {
      console.error('[ZURI] ticketing paid notify error:', e?.message || e);
    });
  }

  return marked;
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

// Paystack webhook: verify signature, on charge.success update order and optionally save card.
router.post('/webhook', (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  if (!signature || !PAYSTACK_SECRET) {
    return res.status(400).send('Missing signature or secret');
  }
  const rawBody = req.body;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    return res.status(400).send('Invalid body');
  }
  const crypto = require('crypto');
  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET).update(rawBody).digest('hex');
  if (hash !== signature) {
    console.error('Paystack webhook signature mismatch');
    return res.status(401).send('Invalid signature');
  }
  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch (e) {
    return res.status(400).send('Invalid JSON');
  }
  if (event.event === 'charge.success' && event.data) {
    const reference = event.data.reference;
    const metadata = event.data.metadata || {};

    if (reference && String(reference).startsWith('sub_')) {
      activateSubscriptionFromCharge(event.data)
        .then(() => res.status(200).json({ received: true }))
        .catch((err) => {
          console.error('Subscription webhook error:', err);
          res.status(500).json({ received: false });
        });
      return;
    }

    const businessId = metadata.businessId;
    const orderId = metadata.orderId || metadata.zuri_order_id || null;
    const offlineRef =
      metadata.offline_reference ||
      metadata.offlineReference ||
      event.data.offline_reference ||
      null;
    const resolveOrder = orderId
      ? supabase.from('orders').select('id, business_id, total_amount, payment_status, payment_method, receipt_sent_at').eq('id', orderId).single()
      : supabase
          .from('orders')
          .select('id, business_id, total_amount, payment_status, payment_method, receipt_sent_at')
          .eq('paystack_payment_reference', reference)
          .maybeSingle()
          .then(async ({ data, error }) => {
            if (data) return { data };
            if (offlineRef) {
              const byOffline = await supabase
                .from('orders')
                .select('id, business_id, total_amount, payment_status, payment_method, receipt_sent_at')
                .or(
                  `terminal_offline_reference.eq.${offlineRef},paystack_payment_reference.eq.${offlineRef}`
                )
                .maybeSingle();
              if (byOffline.data) return byOffline;
            }
            // Terminal POS charges often use a pos_* reference — match stored offline ref by equality on either column.
            if (reference) {
              const byTerminalRef = await supabase
                .from('orders')
                .select('id, business_id, total_amount, payment_status, payment_method, receipt_sent_at')
                .eq('terminal_offline_reference', reference)
                .maybeSingle();
              if (byTerminalRef.data) return byTerminalRef;
            }
            if (UUID_RE.test(String(reference || ''))) {
              return supabase.from('orders').select('id, business_id, total_amount, payment_status, payment_method, receipt_sent_at').eq('id', reference).single();
            }
            return { data: null, error };
          });

    resolveOrder
      .then(({ data: order }) => {
        const resolvedOrderId = order?.id;
        if (!order || !resolvedOrderId) {
          res.status(200).json({ received: true });
          return;
        }
        if (order.payment_status === 'paid') {
          // Recovery only — do not re-queue after receipt_sent_at is set (verify polls used to spam this).
          queueOrderReceiptIfNeeded(order, {
            paidAt: event.data.paid_at || null,
            reference: reference || resolvedOrderId
          });
          res.status(200).json({ received: true });
          return;
        }
        const amountPaid = event.data.amount / 100;
        if (!isAcceptableOrderPaymentAmount(order.total_amount, amountPaid)) {
          console.error('Webhook amount mismatch', { orderId: resolvedOrderId, orderTotal: order.total_amount, paid: amountPaid });
          res.status(200).json({ received: true });
          return;
        }
        const isSubscriptionRenewal =
          !reference?.startsWith('sub_') &&
          (event.data.subscription || event.data.plan);

        if (isSubscriptionRenewal) {
          handleSubscriptionRenewal(event.data)
            .then(() => res.status(200).json({ received: true }))
            .catch((err) => {
              console.error('Subscription renewal webhook error:', err);
              res.status(500).json({ received: false });
            });
          return;
        }

        const channel = String(event.data.channel || '').toLowerCase();
        const paymentMethod =
          parsePaymentMethodFromPaystackMetadata(metadata) ||
          (channel === 'pos' ? 'pos' : undefined) ||
          (order.payment_method === 'split' ? 'split' : undefined);
        const paystackTxId = event.data.id || null;
        const bid = businessId || order.business_id;
        const isTap = metadata.tap === 'true';

        return finalizePaidOrder({
          req,
          orderId: resolvedOrderId,
          businessId: bid,
          paymentProvider: 'paystack',
          markExtra: {
            paymentMethod,
            paystack_transaction_id: paystackTxId,
            confirmed_by: channel === 'pos' || metadata.zuri_terminal ? 'paystack_terminal' : undefined,
            confirmed_at: channel === 'pos' || metadata.zuri_terminal ? new Date().toISOString() : undefined
          },
          paidAt: event.data.paid_at || null,
          reference: reference || resolvedOrderId,
          payoutAmount: amountPaid,
          tap: isTap
        })
          .then(async (marked) => {
            if (!marked.ok) {
              console.error('Paystack webhook mark paid failed', { orderId: resolvedOrderId });
              res.status(500).json({ received: false });
              return;
            }
            const auth = event.data.authorization;
            const saveCard = metadata.save_card === 'true';
            const customerEmail = event.data.customer?.email;
            if (saveCard && isReusableCardAuthorization(auth) && bid && customerEmail) {
              await supabase.from('saved_cards').upsert({
                email: customerEmail,
                business_id: bid,
                authorization_code: auth.authorization_code,
                last4: auth.last4,
                card_type: auth.card_type
              }, { onConflict: 'email,business_id' });
            }
            res.status(200).json({ received: true });
          });
      })
      .catch((err) => {
        console.error('Paystack webhook error:', err);
        res.status(500).json({ received: false });
      });
    return;
  }
  // Terminal invoice paid — reconcile via offline_reference when charge.success metadata is empty.
  if (event.event === 'paymentrequest.success' && event.data) {
    const offlineReference =
      event.data.offline_reference || event.data.offlineReference || null;
    const meta = event.data.metadata || {};
    const orderIdFromMeta = meta.orderId || meta.zuri_order_id || null;
    const findPromise = orderIdFromMeta
      ? supabase
          .from('orders')
          .select('id, business_id, total_amount, payment_status, payment_method, receipt_sent_at')
          .eq('id', orderIdFromMeta)
          .maybeSingle()
      : offlineReference
        ? supabase
            .from('orders')
            .select('id, business_id, total_amount, payment_status, payment_method, receipt_sent_at')
            .or(
              `terminal_offline_reference.eq.${offlineReference},paystack_payment_reference.eq.${offlineReference}`
            )
            .maybeSingle()
        : Promise.resolve({ data: null });

    findPromise
      .then(({ data: order }) => {
        if (!order) {
          res.status(200).json({ received: true });
          return null;
        }
        if (order.payment_status === 'paid') {
          // Same recovery as charge.success — already paid must still get QR email if missing.
          queueOrderReceiptIfNeeded(order, {
            paidAt: event.data.paid_at || event.data.paidAt || null,
            reference: offlineReference || order.id
          });
          res.status(200).json({ received: true });
          return null;
        }
        const amountPaid =
          event.data.amount != null ? Number(event.data.amount) / 100 : Number(order.total_amount);
        if (!isAcceptableOrderPaymentAmount(order.total_amount, amountPaid)) {
          console.error('paymentrequest.success amount mismatch', {
            orderId: order.id,
            orderTotal: order.total_amount,
            paid: amountPaid
          });
          res.status(200).json({ received: true });
          return null;
        }
        return finalizePaidOrder({
          req,
          orderId: order.id,
          businessId: order.business_id,
          paymentProvider: 'paystack',
          markExtra: {
            paymentMethod: 'pos',
            confirmed_by: 'paystack_terminal',
            confirmed_at: new Date().toISOString()
          },
          paidAt: event.data.paid_at || event.data.paidAt || null,
          reference: offlineReference || order.id,
          payoutAmount: amountPaid,
          tap: false
        }).then((marked) => {
          if (!marked.ok) {
            res.status(500).json({ received: false });
            return;
          }
          res.status(200).json({ received: true });
        });
      })
      .catch((err) => {
        console.error('paymentrequest.success webhook error:', err);
        res.status(500).json({ received: false });
      });
    return;
  }
  if (event.event === 'transfer.success' && event.data?.reference) {
    updatePayoutStatusFromWebhook(event.data.reference, 'success', null, 'paystack').catch((err) =>
      console.error('Transfer webhook update error', event.data.reference, err)
    );
    return res.status(200).json({ received: true });
  }
  if (event.event === 'transfer.failed' && event.data?.reference) {
    const message = event.data?.gateway_response || event.data?.reason || 'Transfer failed';
    updatePayoutStatusFromWebhook(event.data.reference, 'failed', message, 'paystack').catch((err) =>
      console.error('Transfer webhook update error', event.data.reference, err)
    );
    return res.status(200).json({ received: true });
  }
  if (event.event === 'subscription.create' && event.data) {
    handleSubscriptionCreate(event.data)
      .then(() => res.status(200).json({ received: true }))
      .catch((err) => {
        console.error('subscription.create webhook error:', err);
        res.status(500).json({ received: false });
      });
    return;
  }
  if (event.event === 'invoice.create' && event.data) {
    handleInvoiceCreate(event.data)
      .then(() => res.status(200).json({ received: true }))
      .catch((err) => {
        console.error('invoice.create webhook error:', err);
        res.status(500).json({ received: false });
      });
    return;
  }
  if (event.event === 'invoice.payment_failed' && event.data) {
    handleSubscriptionPaymentFailed(event.data)
      .then(() => res.status(200).json({ received: true }))
      .catch((err) => {
        console.error('invoice.payment_failed webhook error:', err);
        res.status(500).json({ received: false });
      });
    return;
  }
  if (event.event === 'charge.dispute.create' && event.data) {
    const txRef = event.data.transaction?.reference || event.data.reference;
    if (txRef) {
      supabase
        .from('orders')
        .update({ dispute_status: 'open', payment_status: 'disputed' })
        .eq('id', txRef)
        .then(() => res.status(200).json({ received: true }))
        .catch((err) => {
          console.error('Dispute webhook error:', err);
          res.status(500).json({ received: false });
        });
      return;
    }
  }
  if (event.event === 'charge.dispute.resolve' && event.data) {
    const txRef = event.data.transaction?.reference || event.data.reference;
    if (txRef) {
      const resolved = event.data.status === 'won' ? 'resolved' : 'chargeback';
      supabase
        .from('orders')
        .update({
          dispute_status: resolved,
          payment_status: resolved === 'chargeback' ? 'chargeback' : 'paid'
        })
        .eq('id', txRef)
        .then(() => res.status(200).json({ received: true }))
        .catch((err) => {
          console.error('Dispute resolve webhook error:', err);
          res.status(500).json({ received: false });
        });
      return;
    }
  }
  res.status(200).json({ received: true });
});

// Monnify webhook health (browser/dashboard URL checks use GET; events are POST only).
router.get('/monnify-webhook', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    ok: true,
    configured: isMonnifyConfigured(),
    webhookUrl: monnifyWebhookUrl(),
    message: 'Monnify webhook endpoint is active. Transaction events are delivered via POST.'
  });
});

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
    console.warn('[ZURI] Monnify webhook order not found', {
      orderId,
      paymentReference,
      reason: 'order_not_found',
      cause: 'could not resolve order for paid Monnify transaction'
    });
    return;
  }
  if (order.payment_status === 'paid') {
    // Same as Paystack: re-queue receipt only if it was never delivered.
    const queued = queueOrderReceiptIfNeeded(order, {
      paidAt: tx.paidOn || null,
      reference: paymentReference || order.id
    });
    if (queued?.queued) {
      console.log('[ZURI] Monnify webhook already paid — receipt re-queued', {
        orderId: order.id,
        paymentReference,
        reason: 'already_paid_requeue_receipt',
        cause: 'order was already marked paid but receipt_sent_at is null; re-queueing ticket/receipt email'
      });
    }
    return;
  }

  const paid = amountPaidNaira(tx);
  if (!isAcceptableOrderPaymentAmount(order.total_amount, paid)) {
    console.error('Monnify webhook amount mismatch', { orderId, orderTotal: order.total_amount, paid });
    return;
  }

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

// Monnify webhook: acknowledge immediately — checkout fails if this endpoint is slow or non-200.
router.post('/monnify-webhook', (req, res) => {
  console.log('[Monnify webhook] received', {
    at: new Date().toISOString(),
    ip: req.headers['x-forwarded-for'] || req.ip,
    hasSignature: Boolean(req.headers['monnify-signature'])
  });
  res.status(200).send('OK');
  setImmediate(() => {
    processMonnifyWebhook(req).catch((err) => console.error('Monnify webhook processing error', err));
  });
});

// Initialize order payment (ZURI's gateway keys)
router.post('/initialize', async (req, res) => {
  try {
    const { email, amount, orderId, businessId, callbackUrl, saveCard, tap } = req.body;
    if (!email || amount == null || !orderId || !businessId) {
      return res.status(400).json({ error: 'Email, amount, orderId, and businessId are required' });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, business_id, total_amount, payment_status, customer_email')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.business_id !== businessId) {
      return res.status(403).json({ error: 'Order does not belong to this business' });
    }
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Order is already paid' });
    }

    // Keep receipt delivery address in sync with the email used at Paystack/Monnify.
    const payEmail = String(email || '').trim().toLowerCase();
    if (payEmail && payEmail !== String(order.customer_email || '').trim().toLowerCase()) {
      const { error: emailSyncErr } = await supabase
        .from('orders')
        .update({ customer_email: payEmail })
        .eq('id', orderId);
      if (emailSyncErr) {
        console.warn('[ZURI] Could not sync order.customer_email before payment init', {
          orderId,
          cause: emailSyncErr.message || String(emailSyncErr)
        });
      } else {
        order.customer_email = payEmail;
      }
    }

    const { data: biz } = await supabase
      .from('businesses')
      .select('account_status')
      .eq('id', businessId)
      .single();
    if (!biz || !canAcceptPayments(biz.account_status)) {
      return res.status(403).json({ error: statusMessage(biz?.account_status) || 'Payments are not available for this venue' });
    }

    const orderTotal = Number(order.total_amount);
    if (orderTotal <= 0) {
      return res.status(400).json({ error: 'This order does not require payment' });
    }
    const requestedAmount = Number(amount);
    if (requestedAmount !== orderTotal) {
      return res.status(400).json({ error: `Amount must equal order total (₦${orderTotal.toFixed(2)})` });
    }

    const paymentProvider = await getBusinessPaymentProvider(businessId);
    const payload = await initializeOrderPayment({
      email,
      orderTotal,
      orderId,
      businessId,
      callbackUrl,
      saveCard: !!saveCard,
      tap: !!tap,
      paymentProvider,
      customerName: String(email).split('@')[0] || 'Customer'
    });

    res.json(payload);
  } catch (error) {
    console.error('Payment initialization error:', error);
    const normalized = normalizePaystackSdkError(error);
    const status = normalized
      ? normalized.status
      : (error.code === 'MONNIFY_AUTH_FAILED' ? 502 : (error.status || 500));
    res.status(status).json({
      error: normalized?.message || error.message || 'Failed to initialize payment',
      code: normalized?.code || error.code || undefined
    });
  }
});

const ORDER_VERIFY_SELECT =
  'id, business_id, total_amount, payment_status, payment_method, payment_provider, monnify_payment_reference, paystack_payment_reference, receipt_sent_at, customer_email';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paystackVerifyReference(order, rawReference) {
  const raw = String(rawReference || '').trim();
  if (raw.startsWith('zuri_ps_')) return raw;
  return order.paystack_payment_reference || order.id;
}

async function findOrderForPaymentVerify(rawReference) {
  const parsed = parseMonnifyReturnRefs(rawReference);
  const raw = String(rawReference || '').trim();

  // Paystack refs first — never query orders.id with zuri_ps_* (uuid column → 22P02/400).
  if (raw.startsWith('zuri_ps_')) {
    const { data } = await supabase
      .from('orders')
      .select(ORDER_VERIFY_SELECT)
      .eq('paystack_payment_reference', raw)
      .maybeSingle();
    if (data) return data;
  }

  const candidateIds = [...new Set([parsed.orderId].filter(Boolean))].filter(
    (id) => UUID_RE.test(String(id)) || String(id).startsWith('sub_')
  );
  for (const id of candidateIds) {
    const { data } = await supabase.from('orders').select(ORDER_VERIFY_SELECT).eq('id', id).maybeSingle();
    if (data) return data;
  }

  const monnifyRefs = [...new Set([parsed.monnifyPaymentReference].filter(
    (r) => r && String(r).startsWith('zuri_') && !String(r).startsWith('zuri_ps_')
  ))];
  for (const mref of monnifyRefs) {
    const { data } = await supabase
      .from('orders')
      .select(ORDER_VERIFY_SELECT)
      .eq('monnify_payment_reference', mref)
      .maybeSingle();
    if (data) return data;
  }

  if (UUID_RE.test(raw)) {
    const { data } = await supabase.from('orders').select(ORDER_VERIFY_SELECT).eq('id', raw).maybeSingle();
    if (data) return data;
  }

  // Last resort: any non-UUID raw that looks like a Paystack reference stored on the order.
  if (raw && !UUID_RE.test(raw) && !raw.startsWith('zuri_')) {
    const { data } = await supabase
      .from('orders')
      .select(ORDER_VERIFY_SELECT)
      .eq('paystack_payment_reference', raw)
      .maybeSingle();
    if (data) return data;
  }

  if (isMonnifyConfigured()) {
    for (const mref of monnifyRefs.length ? monnifyRefs : []) {
      const tx = await getTransactionByPaymentReference(mref);
      const orderId = orderIdFromMonnifyMeta(tx);
      if (orderId && UUID_RE.test(orderId)) {
        const { data } = await supabase.from('orders').select(ORDER_VERIFY_SELECT).eq('id', orderId).maybeSingle();
        if (data) return data;
      }
    }
  }

  return null;
}

// Verify order payment
router.get('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    const order = await findOrderForPaymentVerify(reference);
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const orderId = order.id;
    const paymentProvider = normalizeProvider(
      order.payment_provider || (await getBusinessPaymentProvider(order.business_id))
    );

    if (paymentProvider === 'monnify') {
      if (!isMonnifyConfigured()) {
        return res.status(503).json({ success: false, message: 'Payment not configured' });
      }

      if (order.payment_status === 'paid') {
        queueOrderReceiptIfNeeded(order, {
          paidAt: null,
          reference: orderId
        });
        return res.json({
          success: true,
          data: {
            orderId,
            reference: orderId,
            amount: Number(order.total_amount),
            status: 'success',
            paidAt: null,
            customer: null
          }
        });
      }

      const parsed = parseMonnifyReturnRefs(reference);
      const monnifyRef =
        order.monnify_payment_reference ||
        parsed.monnifyPaymentReference ||
        (String(reference).startsWith('zuri_') ? reference : null);
      if (!monnifyRef) {
        return res.json({ success: false, message: 'Payment not successful' });
      }
      const tx = await getTransactionByPaymentReference(monnifyRef);
      if (!tx || !isPaidTransaction(tx)) {
        return res.json({ success: false, message: 'Payment not successful' });
      }
      const paid = amountPaidNaira(tx);
      if (!isAcceptableOrderPaymentAmount(order.total_amount, paid)) {
        console.error('Monnify verify amount mismatch', { orderId, orderTotal: order.total_amount, paid });
        return res.status(400).json({ success: false, message: 'Payment amount does not match order' });
      }
      const meta = normalizeMetaData(tx.metaData || tx.metadata);
      const marked = await finalizePaidOrder({
        req,
        orderId,
        businessId: meta.businessId || order.business_id,
        paymentProvider: 'monnify',
        paidAt: tx.paidOn || null,
        reference: monnifyRef,
        payoutAmount: paid,
        tap: meta.tap === 'true'
      });
      if (!marked.ok) {
        return res.status(500).json({ success: false, message: 'Failed to confirm payment' });
      }

      return res.json({
        success: true,
        data: {
          orderId,
          reference: orderId,
          amount: paid,
          status: 'success',
          paidAt: tx.paidOn || null,
          customer: tx.customer || null
        }
      });
    }

    if (!appPaystack) return res.status(503).json({ success: false, message: 'Payment not configured' });

    if (order.payment_status === 'paid') {
      queueOrderReceiptIfNeeded(order, {
        paidAt: null,
        reference: order.paystack_payment_reference || orderId
      });
      return res.json({
        success: true,
        data: {
          orderId,
          reference: order.paystack_payment_reference || orderId,
          amount: Number(order.total_amount),
          status: 'success',
          paidAt: null,
          customer: null
        }
      });
    }

    const paystackRef = paystackVerifyReference(order, reference);
    const response = await appPaystack.transaction.verify({ reference: paystackRef });
    if (!response.status || response.data.status !== 'success') {
      return res.json({ success: false, message: 'Payment not successful' });
    }

    const paystackAmountNaira = response.data.amount / 100;
    if (!isAcceptableOrderPaymentAmount(order.total_amount, paystackAmountNaira)) {
      console.error('Payment verify amount mismatch', { orderId, orderTotal: order.total_amount, paystackAmount: paystackAmountNaira });
      return res.status(400).json({ success: false, message: 'Payment amount does not match order' });
    }

    const paystackPaidAt = response.data.paid_at || null;
    const paystackReference = response.data.reference || paystackRef;
    const paymentMethod =
      parsePaymentMethodFromPaystackMetadata(response.data.metadata) ||
      (order.payment_method === 'split' ? 'split' : undefined);
    const businessId = response.data.metadata?.businessId || order.business_id;
    const isTap = response.data.metadata?.tap === 'true';

    // If checkout left customer_email empty, recover from Paystack so the QR receipt has a destination.
    const paystackCustomerEmail = String(response.data.customer?.email || '')
      .trim()
      .toLowerCase();
    if (
      paystackCustomerEmail &&
      !String(order.customer_email || '')
        .trim()
        .toLowerCase()
    ) {
      const { error: emailFillErr } = await supabase
        .from('orders')
        .update({ customer_email: paystackCustomerEmail })
        .eq('id', orderId);
      if (emailFillErr) {
        console.warn('[ZURI] Could not fill empty order.customer_email from Paystack verify', {
          orderId,
          cause: emailFillErr.message || String(emailFillErr)
        });
      } else {
        order.customer_email = paystackCustomerEmail;
      }
    }

    const marked = await finalizePaidOrder({
      req,
      orderId,
      businessId,
      paymentProvider: 'paystack',
      markExtra: {
        paymentMethod,
        paystack_transaction_id: response.data.id || null
      },
      paidAt: paystackPaidAt,
      reference: paystackReference,
      payoutAmount: paystackAmountNaira,
      tap: isTap
    });
    if (!marked.ok) {
      return res.status(500).json({ success: false, message: 'Failed to confirm payment' });
    }

    const auth = response.data.authorization;
    const saveCard = response.data.metadata?.save_card === 'true';
    if (saveCard && isReusableCardAuthorization(auth) && businessId && response.data.customer?.email) {
      await supabase.from('saved_cards').upsert({
        email: response.data.customer.email,
        business_id: businessId,
        authorization_code: auth.authorization_code,
        last4: auth.last4,
        card_type: auth.card_type
      }, { onConflict: 'email,business_id' });
    }

    res.json({
      success: true,
      data: {
        orderId,
        reference: response.data.reference,
        amount: response.data.amount / 100,
        status: response.data.status,
        paidAt: response.data.paid_at,
        customer: response.data.customer
      }
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    const normalized = normalizePaystackSdkError(error);
    const status = normalized ? normalized.status : 500;
    res.status(status).json({
      success: false,
      message: normalized?.message || 'Failed to verify payment'
    });
  }
});

// List saved cards for customer (email + businessId) — Paystack only
router.get('/saved-cards', async (req, res) => {
  try {
    const { email, businessId } = req.query;
    if (!email || !businessId) return res.status(400).json({ error: 'email and businessId required' });

    const provider = await getBusinessPaymentProvider(String(businessId));
    if (provider === 'monnify') {
      return res.json([]);
    }

    const { data, error } = await supabase
      .from('saved_cards')
      .select('id, last4, card_type, created_at')
      .eq('email', email)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Failed to fetch saved cards' });
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch saved cards' });
  }
});

// Charge with saved card (Paystack only)
router.post('/charge-saved', async (req, res) => {
  try {
    const { email, businessId, orderId, amount, saved_card_id } = req.body;
    if (!email || !businessId || !orderId || amount == null || !saved_card_id) {
      return res.status(400).json({ error: 'email, businessId, orderId, amount, and saved_card_id are required' });
    }

    const provider = await getBusinessPaymentProvider(businessId);
    if (provider === 'monnify') {
      return res.status(400).json({ error: 'Saved cards are not available with Monnify checkout' });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, business_id, total_amount, payment_status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.business_id !== businessId) {
      return res.status(403).json({ error: 'Order does not belong to this business' });
    }
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Order is already paid' });
    }

    const orderTotal = Number(order.total_amount);
    const requestedAmount = Number(amount);
    if (Math.abs(requestedAmount - orderTotal) > 0.01) {
      return res.status(400).json({ error: `Amount must equal order total (₦${orderTotal.toFixed(2)})` });
    }

    const { data: savedCard, error: cardError } = await supabase
      .from('saved_cards')
      .select('authorization_code')
      .eq('id', saved_card_id)
      .eq('email', email)
      .eq('business_id', businessId)
      .single();
    if (cardError || !savedCard?.authorization_code) {
      return res.status(400).json({ error: 'Saved card not found or invalid' });
    }

    if (!appPaystack) return res.status(503).json({ error: 'Payment not configured' });

    const amountInKobo = Math.round(orderTotal * 100);
    const paymentReference = buildPaystackPaymentReference(orderId);
    await supabase
      .from('orders')
      .update({ paystack_payment_reference: paymentReference, payment_method: 'transfer' })
      .eq('id', orderId);

    const response = await appPaystack.transaction.chargeAuthorization({
      email,
      amount: amountInKobo,
      reference: paymentReference,
      authorization_code: savedCard.authorization_code
    });

    if (response.status && response.data.status === 'success') {
      const marked = await finalizePaidOrder({
        req,
        orderId,
        businessId,
        paymentProvider: 'paystack',
        markExtra: { paystack_transaction_id: response.data.id || null },
        paidAt: new Date().toISOString(),
        reference: response.data.reference || paymentReference,
        payoutAmount: orderTotal
      });
      if (!marked.ok) {
        return res.status(500).json({ error: 'Failed to confirm payment' });
      }
      res.json({
        success: true,
        data: {
          reference: response.data.reference,
          amount: response.data.amount / 100,
          status: response.data.status
        }
      });
    } else {
      res.status(400).json({ success: false, message: response.data?.message || 'Charge failed' });
    }
  } catch (error) {
    console.error('Charge saved card error:', error);
    const normalized = normalizePaystackSdkError(error);
    const status = normalized ? normalized.status : 500;
    res.status(status).json({ error: normalized?.message || 'Charge failed' });
  }
});

// Refund endpoint (business auth — same as /api/order/:id/refund)
router.post('/refund/:orderId', requireBusinessAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { amountNaira, reason } = req.body || {};

    const { data: order } = await supabase
      .from('orders')
      .select('id, business_id')
      .eq('id', orderId)
      .single();

    if (!order || order.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const result = await refundOrderPayment(orderId, { amountNaira, reason });
    if (!result.ok) return res.status(400).json({ error: result.error });
    res.json(result);
  } catch (error) {
    console.error('Payment refund error:', error);
    res.status(500).json({ error: 'Refund failed' });
  }
});

module.exports = router;
module.exports.finalizePaidOrder = finalizePaidOrder;
module.exports.emitTapSuccess = emitTapSuccess;
