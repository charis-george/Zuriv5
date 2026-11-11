const { getDb } = require('../../database');
const { sendSms, normalizeMsisdn } = require('../africasTalking');
const {
  renderStaffAutoMatch,
  renderCustomerConfirm,
  orderShortId
} = require('../agentSmsTemplates');

function db() {
  return getDb();
}

function emitAgentAlert(req, businessId, payload) {
  const io = req?.app?.get?.('io');
  if (io && businessId) {
    io.to(`business-${businessId}`).emit('payment-agent-alert', payload);
  }
}

async function logSms({
  businessId,
  orderId,
  paymentAlertId,
  recipientType,
  recipientMsisdn,
  message,
  deliveryStatus
}) {
  try {
    await db().from('agent_sms_log').insert({
      business_id: businessId,
      order_id: orderId || null,
      payment_alert_id: paymentAlertId || null,
      recipient_type: recipientType,
      recipient_msisdn: recipientMsisdn,
      message,
      delivery_status: deliveryStatus
    });
  } catch (err) {
    console.error('[ZURI] agent_sms_log insert failed:', err?.message || err);
  }
}

async function sendAndLog({
  businessId,
  orderId,
  paymentAlertId,
  recipientType,
  to,
  message
}) {
  const msisdn = normalizeMsisdn(to);
  if (!msisdn) {
    await logSms({
      businessId,
      orderId,
      paymentAlertId,
      recipientType,
      recipientMsisdn: String(to || ''),
      message,
      deliveryStatus: 'skipped'
    });
    return { ok: false, skipped: true };
  }
  const result = await sendSms({ to: msisdn, message });
  const status = result.skipped ? 'skipped' : result.ok ? 'sent' : 'failed';
  await logSms({
    businessId,
    orderId,
    paymentAlertId,
    recipientType,
    recipientMsisdn: msisdn,
    message,
    deliveryStatus: status
  });
  return result;
}

async function loadItemSummary(orderId) {
  const { data: items } = await db()
    .from('order_items')
    .select('menu_item_id, quantity')
    .eq('order_id', orderId)
    .limit(8);
  if (!items?.length) return '';
  const ids = items.map((i) => i.menu_item_id).filter(Boolean);
  const { data: menu } = await db().from('menu_items').select('id, name').in('id', ids);
  const nameMap = (menu || []).reduce((acc, m) => {
    acc[m.id] = m.name;
    return acc;
  }, {});
  return items
    .slice(0, 3)
    .map((it) => `${it.quantity}×${nameMap[it.menu_item_id] || 'item'}`)
    .join(', ');
}

/**
 * Confirm a payment alert against an order: mark paid via finalizePaidOrder, SMS, socket.
 * @param {{ req: object, alertId: string, orderId: string, businessId: string, confirmedBy: 'agent_auto'|'staff', confidenceScore?: number }} opts
 */
async function confirmMatch(opts) {
  const {
    req,
    alertId,
    orderId,
    businessId,
    confirmedBy = 'staff',
    confidenceScore = null
  } = opts;

  const { data: order, error: orderErr } = await db()
    .from('orders')
    .select(
      'id, business_id, payment_status, total_amount, customer_name, customer_phone, customer_email, status'
    )
    .eq('id', orderId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (orderErr || !order) {
    return { ok: false, error: 'Order not found' };
  }
  if (order.payment_status === 'paid') {
    return { ok: false, error: 'Order already paid' };
  }

  const { data: alert, error: alertErr } = await db()
    .from('payment_alerts')
    .select('*')
    .eq('id', alertId)
    .eq('business_id', businessId)
    .maybeSingle();

  if (alertErr || !alert) {
    return { ok: false, error: 'Alert not found' };
  }
  if (alert.match_status === 'auto_matched' || alert.match_status === 'manually_matched') {
    if (alert.matched_order_id === orderId) {
      return { ok: true, alreadyConfirmed: true, order };
    }
    return { ok: false, error: 'Alert already matched to another order' };
  }

  // Staff confirm must target a reviewable alert and a scored candidate (or amount-close pending order).
  if (confirmedBy === 'staff') {
    const reviewable = alert.match_status === 'pending_review' || alert.match_status === 'unmatchable';
    if (!reviewable) {
      return { ok: false, error: 'Alert is not awaiting staff confirmation' };
    }

    const { data: candidate } = await db()
      .from('match_candidates')
      .select('id, order_id, confidence_score')
      .eq('payment_alert_id', alertId)
      .eq('order_id', orderId)
      .maybeSingle();

    if (!candidate) {
      // Allow unmatchable overrides only when amounts are within ₦1.
      if (alert.match_status !== 'unmatchable') {
        return { ok: false, error: 'Order is not a match candidate for this alert' };
      }
      const alertAmt = Number(alert.parsed_amount);
      const orderAmt = Number(order.total_amount);
      if (
        !Number.isFinite(alertAmt) ||
        !Number.isFinite(orderAmt) ||
        Math.abs(alertAmt - orderAmt) > 1
      ) {
        return {
          ok: false,
          error: 'Order amount does not match this alert — cannot confirm'
        };
      }
    }
  }

  const channel = alert.parsed_channel === 'pos' ? 'pos' : 'agent_transfer';
  const matchStatus = confirmedBy === 'agent_auto' ? 'auto_matched' : 'manually_matched';

  let finalizePaidOrder;
  try {
    finalizePaidOrder = require('../../services/payments').finalizePaidOrder;
  } catch {
    finalizePaidOrder = null;
  }

  if (typeof finalizePaidOrder !== 'function') {
    return { ok: false, error: 'Payment finalize unavailable' };
  }

  const marked = await finalizePaidOrder({
    req,
    orderId,
    businessId,
    paymentProvider: alert.parsed_bank_or_provider || 'agent',
    markExtra: {
      paymentMethod: channel,
      matched_alert_id: alertId,
      confirmed_at: new Date().toISOString(),
      confirmed_by: confirmedBy
    },
    paidAt: alert.alert_timestamp || new Date().toISOString(),
    reference: `agent:${alertId}`,
    payoutAmount: null,
    tap: false
  });

  if (!marked.ok) {
    return { ok: false, error: marked.error?.message || 'Failed to mark order paid' };
  }

  // Ensure agent metadata persisted (markOrderPaid may not know matched_alert_id if stripped)
  await db()
    .from('orders')
    .update({
      matched_alert_id: alertId,
      confirmed_at: new Date().toISOString(),
      confirmed_by: confirmedBy,
      payment_method: channel
    })
    .eq('id', orderId)
    .eq('business_id', businessId);

  await db()
    .from('payment_alerts')
    .update({
      match_status: matchStatus,
      matched_order_id: orderId,
      confidence_score:
        confidenceScore != null ? confidenceScore : alert.confidence_score
    })
    .eq('id', alertId);

  await db().from('match_candidates').delete().eq('payment_alert_id', alertId);

  emitAgentAlert(req, businessId, {
    alertId,
    matchStatus,
    orderId
  });

  const { data: business } = await db()
    .from('businesses')
    .select('name, agent_staff_msisdn, phone')
    .eq('id', businessId)
    .maybeSingle();

  const itemSummary = await loadItemSummary(orderId);
  const amount = alert.parsed_amount ?? order.total_amount;
  const staffPhone = business?.agent_staff_msisdn || business?.phone;
  const staffMsg = renderStaffAutoMatch({
    orderId,
    orderNumber: orderShortId(orderId),
    itemSummary,
    amount,
    channel: alert.parsed_channel || channel
  });

  if (staffPhone) {
    await sendAndLog({
      businessId,
      orderId,
      paymentAlertId: alertId,
      recipientType: 'staff',
      to: staffPhone,
      message: staffMsg
    });
  }

  if (order.customer_phone) {
    const custMsg = renderCustomerConfirm({
      amount,
      businessName: business?.name
    });
    await sendAndLog({
      businessId,
      orderId,
      paymentAlertId: alertId,
      recipientType: 'customer',
      to: order.customer_phone,
      message: custMsg
    });
  }

  return { ok: true, order, alert, matchStatus };
}

module.exports = {
  confirmMatch,
  emitAgentAlert,
  sendAndLog,
  logSms
};
