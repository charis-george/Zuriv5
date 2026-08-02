/**
 * Renewal reminder emails for recurring / prepaid subscriptions.
 */

const { sendResendEmail, isResendConfigured } = require('./resendMail');
const { getDb } = require('../database');
const { amountNairaFor } = require('./subscriptionPlans');

const PLAN_LABELS = {
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
  pro: 'Pro',
  zuri_plus: 'Zuri AI'
};

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatNaira(amount) {
  return `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function paymentPageUrl(businessId) {
  const base = (process.env.FRONTEND_URL || 'https://zuriqo.com').split(',')[0].trim().replace(/\/$/, '');
  return `${base}/business/dashboard/${encodeURIComponent(businessId)}/payment`;
}

/**
 * @param {{ businessId: string, to: string, businessName?: string, plan: string, billing: string, renewalDate: string, managePaymentUrl?: string | null, isManualRenewal?: boolean }} params
 */
async function sendSubscriptionRenewalReminder(params) {
  const {
    businessId,
    to,
    businessName,
    plan,
    billing,
    renewalDate,
    managePaymentUrl,
    isManualRenewal
  } = params;

  if (!to?.trim()) return { skipped: true, reason: 'no recipient' };

  const planLabel = PLAN_LABELS[plan] || plan;
  const amount = amountNairaFor(plan, billing === 'yearly' ? 'yearly' : 'monthly');
  const renewalLabel = new Date(renewalDate).toLocaleDateString('en-NG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  const billingPage = paymentPageUrl(businessId);
  const safeName = escapeHtml(businessName || 'there');

  const subject = isManualRenewal
    ? `Your ZURI ${planLabel} plan renews soon`
    : `Upcoming ZURI subscription charge — ${planLabel}`;

  const actionLine = isManualRenewal
    ? `Renew before ${renewalLabel} to keep ${planLabel} features active.`
    : `Your card will be charged ${amount ? formatNaira(amount) : ''} on ${renewalLabel} unless you cancel beforehand.`;

  const text = [
    `Hi ${businessName || 'there'},`,
    '',
    actionLine,
    amount ? `Plan: ${planLabel} (${billing})` : `Plan: ${planLabel}`,
    '',
    managePaymentUrl && !isManualRenewal
      ? `Update payment method: ${managePaymentUrl}`
      : null,
    `Manage billing: ${billingPage}`,
    '',
    '— The ZURI team'
  ].filter(Boolean).join('\n');

  const ctaHref = managePaymentUrl && !isManualRenewal ? managePaymentUrl : billingPage;
  const ctaLabel = managePaymentUrl && !isManualRenewal ? 'Update payment method' : 'Renew or manage plan';

  const html = `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #efe6d8;">
          <tr>
            <td style="padding:28px 28px 12px 28px;">
              <p style="margin:0 0 8px 0;font-size:13px;color:#888;text-transform:uppercase;letter-spacing:0.06em;">Subscription reminder</p>
              <h1 style="margin:0;font-size:22px;color:#1a1a1a;">Your ${escapeHtml(planLabel)} plan renews soon</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 20px 28px;">
              <p style="margin:0 0 12px 0;font-size:15px;line-height:1.55;color:#444;">Hi ${safeName},</p>
              <p style="margin:0 0 12px 0;font-size:15px;line-height:1.55;color:#444;">${escapeHtml(actionLine)}</p>
              ${amount ? `<p style="margin:0;font-size:14px;color:#666;"><strong>Amount:</strong> ${escapeHtml(formatNaira(amount))} · <strong>Date:</strong> ${escapeHtml(renewalLabel)}</p>` : `<p style="margin:0;font-size:14px;color:#666;"><strong>Renewal date:</strong> ${escapeHtml(renewalLabel)}</p>`}
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px 28px;">
              <a href="${escapeHtml(ctaHref)}" style="display:inline-block;background:#ffbd59;color:#1a1a1a;font-weight:700;font-size:14px;text-decoration:none;padding:12px 20px;border-radius:10px;">${escapeHtml(ctaLabel)}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  if (!isResendConfigured()) {
    console.warn('[ZURI] Renewal reminder skipped: set RESEND_API_KEY and RESEND_FROM.');
    return { skipped: true, reason: 'resend not configured' };
  }

  await sendResendEmail(
    { to: to.trim(), subject, html, text },
    { timeoutMs: 8000 }
  );
  return { skipped: false, via: 'resend' };
}

async function markReminderSent(businessId, periodEnd) {
  const supabase = getDb();
  await supabase
    .from('businesses')
    .update({ subscription_renewal_reminder_for: periodEnd })
    .eq('id', businessId);
}

/**
 * Queue renewal reminder for a business (idempotent per period end).
 */
function queueSubscriptionRenewalReminder({
  businessId,
  email,
  businessName,
  plan,
  billing,
  periodEnd,
  managePaymentUrl,
  isManualRenewal
}) {
  if (!businessId || !periodEnd || !plan) return;

  setImmediate(async () => {
    try {
      const supabase = getDb();
      const { data: biz } = await supabase
        .from('businesses')
        .select('subscription_renewal_reminder_for')
        .eq('id', businessId)
        .single();

      const periodIso = new Date(periodEnd).toISOString();
      if (biz?.subscription_renewal_reminder_for) {
        const prev = new Date(biz.subscription_renewal_reminder_for).getTime();
        const next = new Date(periodIso).getTime();
        if (Math.abs(prev - next) < 60_000) return;
      }

      const result = await sendSubscriptionRenewalReminder({
        businessId,
        to: email,
        businessName,
        plan,
        billing: billing || 'monthly',
        renewalDate: periodIso,
        managePaymentUrl,
        isManualRenewal: Boolean(isManualRenewal)
      });

      if (!result.skipped) {
        await markReminderSent(businessId, periodIso);
      }
    } catch (err) {
      console.error('[ZURI] Renewal reminder error:', businessId, err?.message || err);
    }
  });
}

module.exports = {
  sendSubscriptionRenewalReminder,
  queueSubscriptionRenewalReminder,
  paymentPageUrl,
  PLAN_LABELS
};
