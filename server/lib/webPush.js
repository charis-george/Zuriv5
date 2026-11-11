/**
 * Web Push notifications for business dashboard alerts.
 */

const { getDb } = require('../database');

let configured = false;

function isWebPushConfigured() {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY &&
    process.env.VAPID_SUBJECT
  );
}

function initWebPush() {
  if (!isWebPushConfigured() || configured) return false;
  try {
    const webpush = require('web-push');
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT,
      process.env.VAPID_PUBLIC_KEY,
      process.env.VAPID_PRIVATE_KEY
    );
    configured = true;
    return true;
  } catch (e) {
    console.error('[ZURI] web-push init failed:', e?.message || e);
    return false;
  }
}

function getVapidPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || null;
}

async function sendPushToBusiness(businessId, payload) {
  if (!businessId || !initWebPush()) return { sent: 0, failed: 0 };

  const supabase = getDb();
  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('id,endpoint,p256dh,auth')
    .eq('business_id', businessId);

  if (error || !subs?.length) return { sent: 0, failed: 0 };

  const webpush = require('web-push');
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  const staleIds = [];

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        },
        body
      );
      sent += 1;
    } catch (e) {
      failed += 1;
      if (e?.statusCode === 404 || e?.statusCode === 410) staleIds.push(sub.id);
    }
  }

  if (staleIds.length) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds);
  }

  return { sent, failed };
}

async function notifyBusinessNewOrder(businessId, order, options = {}) {
  if (!businessId || !order) return;
  const orderId = String(order.id || '').slice(0, 8).toUpperCase();
  const total = Number(order.total_amount ?? order.totalAmount ?? 0);
  const customer = order.customer_name || order.customerName || 'Guest';
  const title = options.title || 'New order received';
  const body =
    options.body || `#${orderId} · ${customer} · ₦${total.toLocaleString()}`;
  return sendPushToBusiness(businessId, {
    type: 'new-order',
    title,
    body,
    url: '/business/dashboard',
    orderId: order.id
  });
}

module.exports = {
  isWebPushConfigured,
  initWebPush,
  getVapidPublicKey,
  sendPushToBusiness,
  notifyBusinessNewOrder
};
