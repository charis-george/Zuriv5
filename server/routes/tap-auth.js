const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { getDb } = require('../database');
const { getOrCreateNetworkCustomer } = require('../lib/zuri-network');

const supabase = getDb();
const JWT_SECRET = process.env.JWT_SECRET || 'zuri-tap-secret-change-in-production';

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
