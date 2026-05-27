const express = require('express');
const router = express.Router();
const { getTransporter, sendMailWithTimeout } = require('../lib/email');

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'info@zuriqo.com';
const RESEND_FROM = process.env.RESEND_FROM || process.env.SMTP_FROM || 'ZURI <onboarding@resend.dev>';

function getResendApiKey() {
  const key = process.env.RESEND_API_KEY;
  if (!key || typeof key !== 'string' || !key.trim()) return null;
  return key.trim();
}

async function sendViaResendApi(apiKey, payload, timeoutMs = 4500) {
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

// Waitlist / Join Beta / Get in touch – forwards to CONTACT_EMAIL
router.post('/', async (req, res) => {
  try {
    const { email, source = 'beta', message } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Email is required' });
    }

    const subject = source === 'enterprise'
      ? `ZURI Enterprise / Get in touch: ${email}`
      : source === 'demo'
        ? `ZURI Demo request: ${email}`
        : source === 'waitlist'
          ? `ZURI Waitlist: ${email}`
          : `ZURI Beta Waitlist: ${email}`;
    const text = [
      `Email: ${email}`,
      `Source: ${source}`,
      message ? `Message: ${message}` : ''
    ].filter(Boolean).join('\n');

    const resendApiKey = getResendApiKey();
    if (resendApiKey) {
      try {
        await sendViaResendApi(
          resendApiKey,
          {
            from: RESEND_FROM,
            to: [CONTACT_EMAIL],
            reply_to: email,
            subject,
            text
          },
          4500
        );
        return res.json({ success: true, message: 'Thanks! We\'ll be in touch soon.' });
      } catch (resendErr) {
        const code = resendErr && typeof resendErr === 'object' ? resendErr.code : 'RESEND_ERROR';
        console.error('Contact/waitlist resend fallback:', code);
      }
    }

    const transporter = getTransporter();
    if (transporter) {
      try {
        await sendMailWithTimeout(
          transporter,
          {
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to: CONTACT_EMAIL,
            replyTo: email,
            subject,
            text
          },
          4500
        );
        return res.json({ success: true, message: 'Thanks! We\'ll be in touch soon.' });
      } catch (smtpErr) {
        const code = smtpErr && typeof smtpErr === 'object' ? smtpErr.code : 'SMTP_ERROR';
        console.error('Contact/waitlist sendMail fallback:', code);
      }
    }

    // No Resend/SMTP configured or provider unreachable – tell client to use mailto
    res.status(503).json({
      success: false,
      fallbackMailto: true,
      to: CONTACT_EMAIL,
      subject,
      body: text
    });
  } catch (err) {
    console.error('Contact/waitlist error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
