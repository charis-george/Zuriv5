const express = require('express');
const { sendResendEmail, isResendConfigured } = require('../lib/resendMail');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getDb } = require('../database');
const { getOrCreateNetworkCustomer } = require('../lib/zuri-network');
const { getJwtSecret } = require('../lib/jwtSecret');
const {
  createPasswordResetToken,
  consumePasswordResetToken,
  purgeExpiredPasswordResetTokens,
  validateNewPassword
} = require('../lib/passwordResetTokens');
const { checkLoginLock, recordLoginFailure, clearLoginFailures } = require('../lib/tapAuthLock');

const supabase = getDb();
const TAP_JWT_TTL_SEC = Number(process.env.TAP_JWT_TTL_SEC) || 60 * 60 * 24 * 30;

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + TAP_JWT_TTL_SEC
    })
  ).toString('base64url');
  const secret = getJwtSecret();
  const sig = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const secret = getJwtSecret();
    const expected = crypto.createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    if (parts[2] !== expected) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, phone } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const passwordError = validateNewPassword(password);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const { data: existing } = await supabase
      .from('zuri_tap_users')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const id = uuidv4();
    const hashedPassword = bcrypt.hashSync(password, 10);

    const { data: user, error } = await supabase
      .from('zuri_tap_users')
      .insert({
        id,
        email: email.trim().toLowerCase(),
        password: hashedPassword,
        name: name || null,
        phone: phone || null
      })
      .select('id, email, name, phone, created_at')
      .single();

    if (error) {
      console.error('Tap register error:', error);
      return res.status(500).json({ error: 'Registration failed' });
    }

    const resolved = await getOrCreateNetworkCustomer(user.email);
    if (resolved.id) {
      await supabase.from('zuri_tap_users').update({ zuri_customer_id: resolved.id }).eq('id', user.id);
    }

    const token = signToken({ sub: user.id, email: user.email });
    res.json({
      user: { id: user.id, email: user.email, name: user.name, phone: user.phone },
      token
    });
  } catch (error) {
    console.error('Tap register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const lock = checkLoginLock(email);
    if (!lock.ok) return res.status(429).json({ error: lock.error });

    const { data: user, error } = await supabase
      .from('zuri_tap_users')
      .select('id, email, password, name, phone')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (error || !user) {
      recordLoginFailure(email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      recordLoginFailure(email);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    clearLoginFailures(email);

    const resolved = await getOrCreateNetworkCustomer(user.email);
    if (resolved.id) {
      await supabase.from('zuri_tap_users').update({ zuri_customer_id: resolved.id }).eq('id', user.id);
    }

    const { password: _, ...safe } = user;
    const token = signToken({ sub: user.id, email: user.email });
    res.json({
      user: { id: safe.id, email: safe.email, name: safe.name, phone: safe.phone },
      token
    });
  } catch (error) {
    console.error('Tap login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const { data: user, error } = await supabase
      .from('zuri_tap_users')
      .select('id')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (error || !user) {
      return res.json({ success: true, message: 'If an account exists with this email, you will receive reset instructions.' });
    }

    await purgeExpiredPasswordResetTokens();
    let token;
    try {
      token = await createPasswordResetToken('tap', user.id);
    } catch {
      return res.status(503).json({ error: 'Password reset is temporarily unavailable. Please try again later.' });
    }

    const baseUrl = req.get('origin') || process.env.BASE_URL || process.env.FRONTEND_URL || 'http://localhost:5173';
    const resetLink = `${baseUrl}/tap/reset-password?token=${token}`;
    const toEmail = email.trim().toLowerCase();
    const subject = 'Reset your ZURI Tap password';
    const text = `You requested a password reset for your ZURI Tap account. Click the link below to set a new password (valid for 1 hour):\n\n${resetLink}\n\nIf you didn't request this, you can ignore this email.`;
    const html = `<p>You requested a password reset for your ZURI Tap account.</p><p><a href="${resetLink}">Set a new password</a> (link valid for 1 hour).</p><p>If you didn't request this, you can ignore this email.</p>`;

    setImmediate(() => {
      if (!isResendConfigured()) {
        console.warn('[ZURI] Tap password reset email skipped: set RESEND_API_KEY and RESEND_FROM.');
        return;
      }
      sendResendEmail({ to: toEmail, subject, text, html }, { timeoutMs: 8000 }).catch((err) =>
        console.error('Tap password reset email error:', err?.message || err)
      );
    });

    const response = {
      success: true,
      message: 'If an account exists with this email, you will receive reset instructions.'
    };
    if (process.env.NODE_ENV !== 'production' && !isResendConfigured()) {
      response.resetLink = resetLink;
    }
    res.json(response);
  } catch (err) {
    console.error('Tap forgot password error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'Reset token is required' });
    }

    const passwordError = validateNewPassword(newPassword);
    if (passwordError) {
      return res.status(400).json({ error: passwordError });
    }

    const userId = await consumePasswordResetToken('tap', token.trim());
    if (!userId) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword.trim(), 10);
    const { error: updateError } = await supabase
      .from('zuri_tap_users')
      .update({ password: hashedPassword })
      .eq('id', userId);
    if (updateError) return res.status(500).json({ error: 'Failed to update password' });

    res.json({ success: true, message: 'Password updated. You can now sign in.' });
  } catch (err) {
    console.error('Tap reset password error:', err);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

router.get('/me', (req, res) => {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  const payload = token ? verifyToken(token) : null;
  if (!payload) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  supabase
    .from('zuri_tap_users')
    .select('id, email, name, phone, created_at')
    .eq('id', payload.sub)
    .single()
    .then(({ data, error }) => {
      if (error || !data) return res.status(401).json({ error: 'User not found' });
      res.json(data);
    });
});

module.exports = router;
module.exports.verifyToken = verifyToken;
