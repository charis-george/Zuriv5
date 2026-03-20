const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getDb } = require('../database');
const { getOrCreateNetworkCustomer } = require('../lib/zuri-network');

const supabase = getDb();
const JWT_SECRET = process.env.JWT_SECRET || 'zuri-tap-secret-change-in-production';

// In-memory store for password reset tokens (use DB + email in production)
const tapResetTokens = new Map();
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function purgeExpiredTapTokens() {
  const now = Date.now();
  for (const [t, data] of tapResetTokens.entries()) {
    if (data.expiresAt < now) tapResetTokens.delete(t);
  }
}

function signToken(payload) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const expected = crypto.createHmac('sha256', JWT_SECRET).update(`${parts[0]}.${parts[1]}`).digest('base64url');
    if (parts[2] !== expected) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString());
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

    const { data: user, error } = await supabase
      .from('zuri_tap_users')
      .select('id, email, password, name, phone')
      .eq('email', email.trim().toLowerCase())
      .single();

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

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

    purgeExpiredTapTokens();
    const token = crypto.randomBytes(32).toString('hex');
    tapResetTokens.set(token, { userId: user.id, expiresAt: Date.now() + RESET_TOKEN_TTL_MS });

    const baseUrl = req.get('origin') || process.env.BASE_URL || 'http://localhost:5173';
    const resetLink = `${baseUrl}/tap/reset-password?token=${token}`;
    res.json({ success: true, message: 'If an account exists with this email, you will receive reset instructions.', resetLink });
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
    if (!newPassword || typeof newPassword !== 'string' || !newPassword.trim()) {
      return res.status(400).json({ error: 'New password is required' });
    }
    if (newPassword.trim().length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const data = tapResetTokens.get(token.trim());
    if (!data || data.expiresAt < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    const hashedPassword = bcrypt.hashSync(newPassword.trim(), 10);
    const { error: updateError } = await supabase
      .from('zuri_tap_users')
      .update({ password: hashedPassword })
      .eq('id', data.userId);
    if (updateError) return res.status(500).json({ error: 'Failed to update password' });

    tapResetTokens.delete(token.trim());
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
