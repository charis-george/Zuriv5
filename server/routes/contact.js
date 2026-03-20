const express = require('express');
const router = express.Router();
const { getTransporter } = require('../lib/email');

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
        : `ZURI Beta Waitlist: ${email}`;
    const text = [
      `Email: ${email}`,
      `Source: ${source}`,
      message ? `Message: ${message}` : ''
    ].filter(Boolean).join('\n');

    const transporter = getTransporter();
    if (transporter) {
      await transporter.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: CONTACT_EMAIL,
        replyTo: email,
        subject,
        text
      });
      return res.json({ success: true, message: 'Thanks! We\'ll be in touch soon.' });
    }

    // No SMTP configured – tell client to use mailto
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
