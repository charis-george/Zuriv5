const { sendResendEmail, isResendConfigured } = require('./resendMail');
const { queueOrderReceiptOnce } = require('./orderReceiptEmail');

function getFrontendBaseUrl() {
  const raw = process.env.FRONTEND_URL || '';
  const first = String(raw)
    .split(',')
    .map((part) => part.trim().replace(/\/$/, ''))
    .filter(Boolean)[0];
  return first || 'http://localhost:5173';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildInviteCheckoutUrl({ businessId, eventSlug, orderId }) {
  const base = getFrontendBaseUrl();
  const qs = `inviteOrder=${encodeURIComponent(orderId)}`;
  if (eventSlug) {
    return `${base}/event/${encodeURIComponent(businessId)}/${encodeURIComponent(eventSlug)}?${qs}`;
  }
  return `${base}/order/${encodeURIComponent(businessId)}?${qs}`;
}

function summarizeInviteItems(items) {
  return (items || [])
    .map((it) => `${it.quantity}× ${it.menuItemName || it.name || 'Ticket'} — ₦${Number(it.price || 0).toFixed(2)}`)
    .join('\n');
}

/**
 * @param {{
 *   order: object,
 *   business: { name?: string, email?: string },
 *   items: Array<{ menuItemName?: string, name?: string, quantity: number, price: number }>,
 *   deliveryMode: 'payment_link' | 'complimentary',
 *   eventSlug?: string | null
 * }} params
 */
async function sendTicketInviteEmail({ order, business, items, deliveryMode, eventSlug }) {
  const orderId = order?.id;

  const customerEmail = String(order.customer_email || '').trim().toLowerCase();
  if (!customerEmail) {
    const cause = 'invite order has no customer_email';
    console.warn('[ZURI] Ticket invite email skipped', {
      orderId,
      reason: 'no_customer_email',
      cause
    });
    return { skipped: true, reason: 'no_customer_email', cause };
  }

  const businessName = business?.name || 'Event organizer';
  const customerName = order.customer_name || 'Guest';
  const total = Number(order.total_amount) || 0;
  const itemSummary = summarizeInviteItems(items);
  const isComplimentary = deliveryMode === 'complimentary' || total <= 0;

  // Complimentary is already paid — always enqueue the ticket QR receipt, even if Resend
  // is briefly misconfigured (queue/sweep retries). Do not return before enqueue.
  if (isComplimentary) {
    const queued = queueOrderReceiptOnce({
      orderId,
      paidAt: new Date().toISOString(),
      reference: orderId
    });
    console.log('[ZURI] Ticket invite complimentary → receipt queue', {
      orderId,
      to: customerEmail,
      reason: 'complimentary_receipt_queued',
      cause: 'complimentary/free invite queues the ticket QR receipt instead of a payment-link email',
      enqueue: queued
    });
    const enqueueOk =
      queued?.queued === true ||
      queued?.reason === 'already_queued' ||
      queued?.reason === 'already_in_flight' ||
      queued?.reason === 'already_sent';
    return {
      skipped: !enqueueOk,
      reason: enqueueOk ? undefined : queued?.reason || 'enqueue_failed',
      cause: enqueueOk
        ? undefined
        : `receipt queue rejected complimentary invite (${queued?.reason || 'unknown'})`,
      via: 'receipt_queue',
      enqueue: queued
    };
  }

  if (!isResendConfigured()) {
    const cause = 'RESEND_API_KEY is not set on this server';
    console.error('[ZURI] Ticket invite email skipped', {
      orderId,
      reason: 'missing_resend_key',
      cause
    });
    return { skipped: true, reason: 'missing_resend_key', cause };
  }

  const checkoutUrl = buildInviteCheckoutUrl({
    businessId: order.business_id,
    eventSlug,
    orderId
  });

  const subject = `Your ticket invite — ${businessName}`;
  const text = [
    `Hi ${customerName},`,
    '',
    `${businessName} invited you to get tickets:`,
    itemSummary,
    '',
    `Total: ₦${total.toFixed(2)}`,
    '',
    `Complete your payment here: ${checkoutUrl}`,
    '',
    'This link is personal to you. After payment you will receive your ticket QR by email.'
  ].join('\n');

  const html = `
    <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;">
      <p style="font-size:16px;">Hi ${escapeHtml(customerName)},</p>
      <p style="font-size:15px;line-height:1.6;color:#444;">
        <strong>${escapeHtml(businessName)}</strong> invited you to get tickets:
      </p>
      <div style="border:1px solid #f0e6d8;border-radius:14px;padding:16px;background:#fffaf2;margin:18px 0;">
        <pre style="margin:0;font-family:inherit;font-size:14px;white-space:pre-wrap;color:#333;">${escapeHtml(itemSummary)}</pre>
        <p style="margin:12px 0 0 0;font-weight:700;font-size:16px;">Total: ₦${total.toFixed(2)}</p>
      </div>
      <p style="text-align:center;margin:24px 0;">
        <a href="${escapeHtml(checkoutUrl)}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-weight:700;padding:14px 28px;border-radius:12px;">
          Complete payment
        </a>
      </p>
      <p style="font-size:13px;color:#666;line-height:1.5;">
        This link is personal to you. After payment you will receive your ticket QR by email for entry verification.
      </p>
    </div>
  `;

  try {
    await sendResendEmail({
      to: customerEmail,
      subject,
      text,
      html,
      reply_to: business?.email || undefined
    });
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error('[ZURI] Ticket invite email failed', {
      orderId,
      to: customerEmail,
      reason: 'resend_send_error',
      cause: message,
      code: err && err.code ? err.code : undefined
    });
    throw err;
  }

  console.log('[ZURI] Ticket invite email sent', {
    orderId,
    to: customerEmail,
    reason: 'payment_link_sent',
    via: 'resend',
    checkoutUrl
  });

  return { skipped: false, via: 'resend', checkoutUrl };
}

module.exports = {
  buildInviteCheckoutUrl,
  sendTicketInviteEmail
};
