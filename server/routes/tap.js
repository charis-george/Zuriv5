const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Paystack = require('@paystack/paystack-sdk');
const { getDb } = require('../database');
const { requireBusinessAuth } = require('../middleware/auth');
const { processOrderPayout } = require('../lib/paystack-transfer');
const { queueOrderReceiptOnce } = require('../lib/orderReceiptEmail');

const router = express.Router();
const supabase = getDb();
const appPaystack = process.env.PAYSTACK_SECRET_KEY ? new Paystack(process.env.PAYSTACK_SECRET_KEY) : null;
const TAP_JWT_SECRET = process.env.JWT_SECRET || 'zuri-tap-secret-change-in-production';

const ROOM_TTL_MS = 60 * 60 * 1000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const roomByCode = new Map();
const roomByBusinessId = new Map();
const tapSessions = new Map();

function nowMs() {
  return Date.now();
}

function expiresIso(msFromNow) {
  return new Date(nowMs() + msFromNow).toISOString();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeCatalogMode(value) {
  return value === 'ticketing' ? 'ticketing' : 'menu';
}

function randomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i += 1) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function createRoomCode() {
  for (let i = 0; i < 8; i += 1) {
    const code = randomCode();
    if (!roomByCode.has(code)) return code;
  }
  return `${randomCode().slice(0, 5)}${Math.floor(Math.random() * 10)}`;
}

function cleanupRoom(code) {
  const room = roomByCode.get(code);
  if (!room) return;
  roomByCode.delete(code);
  if (roomByBusinessId.get(room.businessId) === code) roomByBusinessId.delete(room.businessId);
}

function getActiveRoomByBusiness(businessId) {
  const code = roomByBusinessId.get(businessId);
  if (!code) return null;
  const room = roomByCode.get(code);
  if (!room) {
    roomByBusinessId.delete(businessId);
    return null;
  }
  if (new Date(room.expiresAt).getTime() <= nowMs()) {
    cleanupRoom(code);
    return null;
  }
  return { code, ...room };
}

function requireTapUser(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Tap authentication required' });
  try {
    const payload = jwt.verify(token, TAP_JWT_SECRET);
    if (!payload?.sub) return res.status(401).json({ error: 'Invalid tap token' });
    req.tapUserId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired tap token' });
  }
}

router.get('/room', requireBusinessAuth, async (req, res) => {
  const { businessId } = req.query;
  if (!businessId || businessId !== req.businessId) return res.status(403).json({ error: 'Forbidden' });
  const room = getActiveRoomByBusiness(businessId);
  return res.json(room ? { code: room.code, expiresAt: room.expiresAt } : { code: null });
});

router.post('/room/on', requireBusinessAuth, async (req, res) => {
  const { businessId } = req.body || {};
  if (!businessId || businessId !== req.businessId) return res.status(403).json({ error: 'Forbidden' });

  const existing = getActiveRoomByBusiness(businessId);
  if (existing) return res.json({ code: existing.code, expiresAt: existing.expiresAt });

  const code = createRoomCode();
  const expiresAt = expiresIso(ROOM_TTL_MS);
  roomByCode.set(code, { businessId, expiresAt });
  roomByBusinessId.set(businessId, code);
  return res.json({ code, expiresAt });
});

router.post('/room/off', requireBusinessAuth, async (req, res) => {
  const { businessId } = req.body || {};
  if (!businessId || businessId !== req.businessId) return res.status(403).json({ error: 'Forbidden' });
  const room = getActiveRoomByBusiness(businessId);
  if (room?.code) cleanupRoom(room.code);
  return res.json({ success: true });
});

router.post('/send', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId, code, items } = req.body || {};
    if (!businessId || businessId !== req.businessId) return res.status(403).json({ error: 'Forbidden' });
    const roomCode = String(code || '').trim().toUpperCase();
    const room = roomByCode.get(roomCode);
    if (!room || room.businessId !== businessId || new Date(room.expiresAt).getTime() <= nowMs()) {
      cleanupRoom(roomCode);
      return res.status(400).json({ error: 'Tap room is not active. Turn it on again.' });
    }

    const normalizedItems = Array.isArray(items)
      ? items
          .map((x) => ({
            id: x?.id || x?.menuItemId,
            quantity: Number(x?.quantity) || 0
          }))
          .filter((x) => x.id && x.quantity > 0)
      : [];
    if (!normalizedItems.length) return res.status(400).json({ error: 'Select at least one item' });

    const ids = normalizedItems.map((i) => i.id);
    const qtyMap = new Map(normalizedItems.map((i) => [i.id, Number(i.quantity)]));

    const [{ data: business, error: bErr }, { data: menuItems, error: mErr }] = await Promise.all([
      supabase.from('businesses').select('id,name,business_mode').eq('id', businessId).single(),
      supabase.from('menu_items').select('id,name,price,business_id,available,item_mode').in('id', ids).eq('business_id', businessId)
    ]);
    if (bErr || !business) return res.status(404).json({ error: 'Business not found' });
    if (mErr || !Array.isArray(menuItems) || !menuItems.length) return res.status(400).json({ error: 'Items not found' });

    const activeMode = normalizeCatalogMode(business.business_mode);
    const requestItems = menuItems
      .filter((mi) => !mi.item_mode || normalizeCatalogMode(mi.item_mode) === activeMode)
      .filter((mi) => mi.available !== false && qtyMap.has(mi.id))
      .map((mi) => ({ id: mi.id, name: mi.name, quantity: Math.max(1, Math.floor(qtyMap.get(mi.id))), price: Number(mi.price) || 0 }));
    if (!requestItems.length) return res.status(400).json({ error: 'No valid available items selected' });

    const amount = requestItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const { data: order, error: oErr } = await supabase
      .from('orders')
      .insert({
        business_id: businessId,
        customer_name: 'Zuri Tap',
        status: 'pending',
        payment_status: 'pending',
        total_amount: amount
      })
      .select('id')
      .single();
    if (oErr || !order?.id) return res.status(500).json({ error: 'Could not create order' });

    const { error: itemErr } = await supabase.from('order_items').insert(
      requestItems.map((i) => ({
        order_id: order.id,
        menu_item_id: i.id,
        quantity: i.quantity,
        price: i.price
      }))
    );
    if (itemErr) return res.status(500).json({ error: 'Could not save order items' });

    const token = crypto.randomBytes(16).toString('hex');
    tapSessions.set(token, {
      token,
      orderId: order.id,
      businessId,
      businessName: business.name || 'Business',
      amount,
      items: requestItems.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
      expiresAt: expiresIso(SESSION_TTL_MS)
    });

    const io = req.app.get('io');
    if (io) {
      io.to(`tap-room-${roomCode}`).emit('tap-request', {
        orderId: order.id,
        businessId,
        businessName: business.name || 'Business',
        amount,
        items: requestItems.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price })),
        token
      });
    }
    return res.json({ orderId: order.id, token });
  } catch (err) {
    console.error('Tap send error:', err);
    return res.status(500).json({ error: 'Failed to send tap request' });
  }
});

router.get('/session/:token', async (req, res) => {
  const key = String(req.params.token || '').trim();
  const session = tapSessions.get(key);
  if (!session) return res.status(404).json({ error: 'Session expired or not found' });
  if (new Date(session.expiresAt).getTime() <= nowMs()) {
    tapSessions.delete(key);
    return res.status(404).json({ error: 'Session expired or not found' });
  }
  return res.json(session);
});

router.delete('/session/:token', async (req, res) => {
  tapSessions.delete(String(req.params.token || '').trim());
  return res.json({ success: true });
});

router.post('/charge-with-password', requireTapUser, async (req, res) => {
  try {
    const { orderId, email, password } = req.body || {};
    if (!orderId || !email || !password) return res.status(400).json({ error: 'orderId, email, and password are required' });

    const normalized = normalizeEmail(email);
    const { data: user, error: uErr } = await supabase
      .from('zuri_tap_users')
      .select('id,email,password')
      .eq('id', req.tapUserId)
      .single();
    if (uErr || !user || normalizeEmail(user.email) !== normalized) return res.status(401).json({ error: 'Tap user mismatch' });

    const validPassword = await bcrypt.compare(String(password), String(user.password || ''));
    if (!validPassword) return res.status(401).json({ error: 'Incorrect password' });

    const { data: order, error: oErr } = await supabase
      .from('orders')
      .select('id,business_id,total_amount,payment_status')
      .eq('id', orderId)
      .single();
    if (oErr || !order) return res.status(404).json({ error: 'Order not found' });
    if (order.payment_status === 'paid') return res.json({ success: true, alreadyPaid: true });

    const { data: cards, error: cErr } = await supabase
      .from('saved_cards')
      .select('authorization_code')
      .eq('business_id', order.business_id)
      .eq('email', email)
      .limit(1);
    if (cErr || !Array.isArray(cards) || !cards[0]?.authorization_code) {
      return res.status(400).json({ error: 'No saved card found for this business. Use Paystack option.' });
    }

    if (!appPaystack) return res.status(503).json({ error: 'Payment not configured' });
    const amount = Number(order.total_amount) || 0;
    const amountInKobo = Math.round(amount * 100);
    const reference = order.id;
    const charge = await appPaystack.transaction.chargeAuthorization({
      email,
      amount: amountInKobo,
      reference,
      authorization_code: cards[0].authorization_code
    });
    if (!charge?.status || charge?.data?.status !== 'success') {
      return res.status(400).json({ error: charge?.data?.message || 'Charge failed' });
    }

    await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', order.id);
    const io = req.app.get('io');
    if (io) io.to(`business-${order.business_id}`).emit('tap-payment-success', { orderId: order.id });
    queueOrderReceiptOnce({
      orderId: order.id,
      paidAt: new Date().toISOString(),
      reference: order.id
    });
    setImmediate(() => {
      processOrderPayout(order.id, amount).catch((err) => console.error('Tap payout error:', err));
    });
    return res.json({ success: true, orderId: order.id });
  } catch (err) {
    console.error('Tap charge-with-password error:', err);
    return res.status(500).json({ error: 'Payment failed' });
  }
});

module.exports = router;
