const { getTransporter, sendMailWithTimeout } = require('./email');

const RESEND_FROM =
  process.env.RESEND_FROM || process.env.SMTP_FROM || 'ZURI <onboarding@resend.dev>';

function getResendApiKey() {
  const key = process.env.RESEND_API_KEY;
  if (!key || typeof key !== 'string' || !key.trim()) return null;
  return key.trim();
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstName(name) {
  if (!name || typeof name !== 'string') return 'there';
  const part = name.trim().split(/\s+/)[0];
  return part || 'there';
}

async function sendViaResend(apiKey, payload, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const err = new Error(`Resend API ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`);
      err.code = `RESEND_HTTP_${response.status}`;
      throw err;
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Personalized welcome after business signup. Best-effort: never throws to callers.
 */
async function sendBusinessWelcomeEmail({ to, businessName }) {
  if (!to || typeof to !== 'string' || !to.trim()) return { skipped: true, reason: 'no recipient' };

  const fn = firstName(businessName);
  const safeName = escapeHtml(businessName || 'Zuri merchant');
  const subject = `Welcome to ZURI, ${fn}!`;

  const text = [
    `Hi ${fn},`,
    '',
    `Thank you for joining ZURI — we're glad ${businessName || 'your business'} is here.`,
    '',
    'You can log in to your dashboard to set up your menu, share your ordering QR with guests, and track orders in real time.',
    '',
    'If you have questions, just reply to this email.',
    '',
    '— The ZURI team'
  ].join('\n');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0;padding:0;background:#fafafa;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fafafa;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #f0e6d8;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px 28px;">
              <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:#fff7eb;color:#1a1a1a;font-size:12px;font-weight:600;letter-spacing:0.04em;">ZURI</div>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 28px 24px 28px;">
              <h1 style="margin:0 0 12px 0;font-size:22px;line-height:1.25;color:#1a1a1a;">Welcome, ${safeName}!</h1>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#3d3d3d;">
                Thank you for creating your ZURI account. You're set up to offer QR ordering, keep your menu in one place, and see what's selling.
              </p>
              <p style="margin:0 0 16px 0;font-size:15px;line-height:1.55;color:#3d3d3d;">
                Next steps: log in to your dashboard, add categories and items, then print or share your table QR so guests can order from their phones.
              </p>
              <p style="margin:0;font-size:15px;line-height:1.55;color:#3d3d3d;">
                We're here if you need anything — just reply to this email.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px 28px 28px;border-top:1px solid #f5f0e8;">
              <p style="margin:0;font-size:13px;color:#888;">— The ZURI team</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const resendKey = getResendApiKey();
  if (resendKey) {
    await sendViaResend(
      resendKey,
      {
        from: RESEND_FROM,
        to: [to.trim()],
        subject,
        html,
        text
      },
      8000
    );
    return { skipped: false, via: 'resend' };
  }

  const transporter = getTransporter();
  if (transporter) {
    const from = process.env.SMTP_FROM || process.env.SMTP_USER || RESEND_FROM;
    await sendMailWithTimeout(
      transporter,
      {
        from,
        to: to.trim(),
        subject,
        text,
        html
      },
      8000
    );
    return { skipped: false, via: 'smtp' };
  }

  console.warn('[ZURI] Welcome email skipped: set RESEND_API_KEY or SMTP_HOST/SMTP_USER/SMTP_PASS on Railway.');
  return { skipped: true, reason: 'no mail transport' };
}

function queueBusinessWelcomeEmail({ email, name }) {
  setImmediate(() => {
    sendBusinessWelcomeEmail({ to: email, businessName: name })
      .then((r) => {
        if (r.skipped) return;
      })
      .catch((err) => console.error('[ZURI] Welcome email error:', err && err.message ? err.message : err));
  });
}

module.exports = {
  sendBusinessWelcomeEmail,
  queueBusinessWelcomeEmail
};
