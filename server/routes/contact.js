const express = require('express');
const router = express.Router();
const { sendResendEmail, isResendConfigured } = require('../lib/resendMail');

const CONTACT_EMAIL = process.env.CONTACT_EMAIL || 'zuriia2026@gmail.com';

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

    if (!isResendConfigured()) {
      return res.status(503).json({
        error: 'Email is not configured. Set RESEND_API_KEY on the server.',
        mailto: `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
      });
    }

    await sendResendEmail(
      {
        to: CONTACT_EMAIL,
        reply_to: email,
        subject,
        text
      },
      { timeoutMs: 8000 }
    );

    return res.json({ success: true, message: 'Thanks! We\'ll be in touch soon.' });
  } catch (err) {
    console.error('Contact/waitlist email error:', err?.message || err);
    return res.status(500).json({ error: 'Could not send message. Please try again later.' });
  }
});

module.exports = router;
