const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const Paystack = require('@paystack/paystack-sdk');
const { getDb } = require('../database');
const { requireBusinessAuth } = require('../middleware/auth');
const { verifyToken: verifyTapToken } = require('./tap-auth');

const supabase = getDb();
const appPaystack = process.env.PAYSTACK_SECRET_KEY ? new Paystack(process.env.PAYSTACK_SECRET_KEY) : null;
const TAP_SESSION_TTL_MINUTES = 10;
const TAP_ROOM_TTL_MINUTES = 30;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const TAP_ALLOWED_PLANS = ['growth', 'pro', 'zuri_plus', 'enterprise', 'basic', 'advanced'];

const chargeWithPasswordAttempts = new Map();
const CHARGE_RATE_LIMIT_WINDOW_MS = 2 * 60 * 1000;
const CHARGE_RATE_LIMIT_MAX = 5;

function checkChargeRateLimit(email) {
  const key = (email || '').toLowerCase();
  const now = Date.now();
  let record = chargeWithPasswordAttempts.get(key);
  if (!record) {
    chargeWithPasswordAttempts.set(key, { count: 1, resetAt: now + CHARGE_RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (now >= record.resetAt) {
    record = { count: 1, resetAt: now + CHARGE_RATE_LIMIT_WINDOW_MS };
    chargeWithPasswordAttempts.set(key, record);
    return true;
  }
  record.count++;
  return record.count <= CHARGE_RATE_LIMIT_MAX;
}

function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return code;
}

// --- Hotspot: room on/off, send to nearby, charge with password ---

router.post('/room/on', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.body;
    if (!businessId || businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only turn on Tap for your own business' });
    }

    const { data: business } = await supabase.from('businesses').select('plan').eq('id', businessId).single();
    if (!business || !TAP_ALLOWED_PLANS.includes((business.plan || '').toLowerCase())) {
      return res.status(403).json({ error: 'Zuri Tap is only available on Growth plan and above. Upgrade to unlock.' });
    }

    const expiresAt = new Date(Date.now() + TAP_ROOM_TTL_MINUTES * 60 * 1000).toISOString();
    let code = generateRoomCode();
    let attempts = 0;
    while (attempts < 10) {
      const { data: existing } = await supabase.from('zuri_tap_rooms').select('id').eq('code', code).single();
      if (!existing) break;
      code = generateRoomCode();
      attempts++;
    }

    await supabase.from('zuri_tap_rooms').delete().eq('business_id', businessId);
    const { error } = await supabase.from('zuri_tap_rooms').insert({
      code,
      business_id: businessId,
      expires_at: expiresAt
    });
    if (error) {
      console.error('Tap room create error:', error);
      return res.status(500).json({ error: 'Failed to create Tap room' });
    }
    res.json({ code, expiresAt });
  } catch (err) {
    console.error('Tap room on error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/room/off', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.body;
    if (!businessId || businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only turn off Tap for your own business' });
    }
    await supabase.from('zuri_tap_rooms').delete().eq('business_id', businessId);
    res.json({ success: true });
  } catch (err) {
    console.error('Tap room off error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/room', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.query;
    if (!businessId || businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only get your own Tap room' });
    }
    const { data: room } = await supabase
      .from('zuri_tap_rooms')
      .select('code, expires_at')
      .eq('business_id', businessId)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (!room) return res.json({ code: null });
    res.json({ code: room.code, expiresAt: room.expires_at });
  } catch (err) {
    console.error('Tap room get error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/send', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId, code, items } = req.body;
    if (!businessId || businessId !== req.businessId) {
      return res.status(403).json({ error: 'You can only send Tap requests for your own business' });
    }
    if (!code || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'businessId, code, and items (array) required' });
    }

    const { data: room } = await supabase
      .from('zuri_tap_rooms')
      .select('id')
      .eq('code', code.toUpperCase())
      .eq('business_id', businessId)
      .gt('expires_at', new Date().toISOString())
      .single();
    if (!room) return res.status(404).json({ error: 'Tap room not found or expired' });

    const menuItemIds = [...new Set(items.map(i => i.menuItemId).filter(Boolean))];
    if (menuItemIds.length === 0) {
      return res.status(400).json({ error: 'Valid menu item IDs are required' });
    }

    const { data: menuItems, error: menuError } = await supabase
      .from('menu_items')
      .select('id, name, price')
      .eq('business_id', businessId)
      .in('id', menuItemIds);

    if (menuError) {
      console.error('Tap send menu error:', menuError);
      return res.status(500).json({ error: 'Failed to load menu' });
    }

    const menuMap = (menuItems || []).reduce((acc, m) => ({ ...acc, [m.id]: m }), {});
    const missingIds = menuItemIds.filter(id => !menuMap[id]);
    if (missingIds.length > 0) {
      return res.status(400).json({ error: 'One or more items are not on the menu' });
    }

    let totalAmount = 0;
    const orderItems = [];
    for (const item of items) {
      const menuItem = menuMap[item.menuItemId];
      if (!menuItem) continue;
      const qty = Math.min(99, Math.max(1, parseInt(item.quantity, 10) || 1));
      const price = Number(menuItem.price) || 0;
      totalAmount += price * qty;
      orderItems.push({
        id: uuidv4(),
        order_id: null,
        menu_item_id: item.menuItemId,
        quantity: qty,
        price,
        special_notes: null
      });
    }

    if (orderItems.length === 0 || totalAmount <= 0) {
      return res.status(400).json({ error: 'Order must have at least one item with a valid price' });
    }

    const orderId = uuidv4();
    orderItems.forEach(oi => { oi.order_id = orderId; });

    const { error: orderError } = await supabase.from('orders').insert({
      id: orderId,
      business_id: businessId,
      customer_name: null,
      customer_phone: null,
      customer_email: null,
      status: 'pending',
      total_amount: totalAmount,
      estimated_prep_time: 15,
      payment_status: 'pending'
    });
    if (orderError) {
      console.error('Tap send order error:', orderError);
      return res.status(500).json({ error: 'Failed to create order' });
    }

    const { error: itemsError } = await supabase.from('order_items').insert(orderItems);
    if (itemsError) {
      console.error('Tap send order items error:', itemsError);
      await supabase.from('orders').delete().eq('id', orderId);
      return res.status(500).json({ error: 'Failed to create order items' });
    }

    const { data: business } = await supabase.from('businesses').select('name').eq('id', businessId).single();
    const itemsWithNames = orderItems.map(oi => ({
      menuItemId: oi.menu_item_id,
      name: (menuMap[oi.menu_item_id] && menuMap[oi.menu_item_id].name) || 'Item',
      quantity: oi.quantity,
      price: Number(oi.price)
    }));

    const io = req.app.get('io');
    if (io) {
      io.to(`tap-room-${code.toUpperCase()}`).emit('tap-request', {
        orderId,
        businessId,
        businessName: business?.name || 'Business',
        amount: totalAmount,
        items: itemsWithNames
      });
    }

    res.json({
      orderId,
      businessId,
      businessName: business?.name || 'Business',
      amount: totalAmount,
      items: itemsWithNames
    });
  } catch (err) {
    console.error('Tap send error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/charge-with-password', async (req, res) => {
  try {
    const { orderId, email, password } = req.body;
    if (!orderId || !email || !password) {
      return res.status(400).json({ error: 'orderId, email, and password are required' });
    }

    const auth = req.headers.authorization;
    const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
    const payload = token ? verifyTapToken(token) : null;
    const emailLower = email.trim().toLowerCase();
    if (!payload || payload.email !== emailLower) {
      return res.status(401).json({ error: 'You must be signed in as this customer to pay with saved card' });
    }

    if (!checkChargeRateLimit(emailLower)) {
      return res.status(429).json({ error: 'Too many attempts. Please try again in a few minutes.' });
    }

    const { data: user } = await supabase
      .from('zuri_tap_users')
      .select('id, email, password')
      .eq('email', email.trim().toLowerCase())
      .single();
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const { data: order } = await supabase
      .from('orders')
      .select('id, business_id, total_amount, payment_status')
      .eq('id', orderId)
      .single();
    if (!order || order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Order not found or already paid' });
    }

    const { data: savedCard } = await supabase
      .from('saved_cards')
      .select('id, authorization_code')
      .eq('email', user.email)
      .eq('business_id', order.business_id)
      .maybeSingle();

    if (!savedCard?.authorization_code) {
      return res.status(400).json({ error: 'No saved card for this business. Add a card first by paying once via the order page.' });
    }

    if (!appPaystack) return res.status(503).json({ error: 'Payment not configured' });

    const amountInKobo = Math.round(Number(order.total_amount) * 100);
    const response = await appPaystack.transaction.chargeAuthorization({
      email: user.email,
      amount: amountInKobo,
      reference: orderId,
      authorization_code: savedCard.authorization_code
    });

    if (response.status && response.data.status === 'success') {
      await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', orderId);
      const io = req.app.get('io');
      if (io) io.to(`business-${order.business_id}`).emit('tap-payment-success', { orderId });
      res.json({
        success: true,
        amount: Number(order.total_amount),
        orderId
      });
    } else {
      res.status(400).json({ success: false, message: response.data?.message || 'Charge failed' });
    }
  } catch (err) {
    console.error('Tap charge-with-password error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Legacy QR/link session (kept for backward compatibility) ---
router.post('/create-session', async (req, res) => {
  try {
    const { businessId, orderId } = req.body;
    if (!businessId || !orderId) {
      return res.status(400).json({ error: 'businessId and orderId are required' });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, business_id, total_amount, payment_status')
      .eq('id', orderId)
      .eq('business_id', businessId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Order already paid' });
    }

    const token = uuidv4().replace(/-/g, '').slice(0, 16);
    const expiresAt = new Date(Date.now() + TAP_SESSION_TTL_MINUTES * 60 * 1000).toISOString();

    const { error: insertError } = await supabase
      .from('zuri_tap_sessions')
      .insert({
        token,
        order_id: orderId,
        business_id: businessId,
        expires_at: expiresAt
      });

    if (insertError) {
      console.error('Tap session create error:', insertError);
      return res.status(500).json({ error: 'Failed to create Tap session' });
    }

    res.json({
      token,
      expiresAt,
      orderId,
      businessId,
      amount: Number(order.total_amount)
    });
  } catch (error) {
    console.error('Tap create-session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get Tap session by token (for pay page)
router.get('/session/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const { data: session, error: sessionError } = await supabase
      .from('zuri_tap_sessions')
      .select('id, order_id, business_id, expires_at')
      .eq('token', token)
      .single();

    if (sessionError || !session) {
      return res.status(404).json({ error: 'Tap session not found or expired' });
    }
    if (new Date(session.expires_at) < new Date()) {
      return res.status(410).json({ error: 'Tap session expired' });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, total_amount, payment_status')
      .eq('id', session.order_id)
      .single();

    if (orderError || !order || order.payment_status === 'paid') {
      return res.status(404).json({ error: 'Order not found or already paid' });
    }

    const { data: business } = await supabase
      .from('businesses')
      .select('id, name')
      .eq('id', session.business_id)
      .single();

    const { data: orderItems } = await supabase
      .from('order_items')
      .select('menu_item_id, quantity, price')
      .eq('order_id', session.order_id);

    let itemsWithNames = [];
    if (orderItems && orderItems.length > 0) {
      const menuIds = [...new Set(orderItems.map(i => i.menu_item_id))];
      const { data: menuItems } = await supabase
        .from('menu_items')
        .select('id, name')
        .in('id', menuIds);
      const nameMap = (menuItems || []).reduce((acc, m) => ({ ...acc, [m.id]: m.name }), {});
      itemsWithNames = orderItems.map(i => ({
        name: nameMap[i.menu_item_id] || 'Item',
        quantity: i.quantity,
        price: Number(i.price)
      }));
    }

    res.json({
      token,
      orderId: order.id,
      businessId: session.business_id,
      businessName: business?.name || 'Business',
      amount: Number(order.total_amount),
      items: itemsWithNames,
      expiresAt: session.expires_at
    });
  } catch (error) {
    console.error('Tap session get error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/session/:token', async (req, res) => {
  try {
    const { token } = req.params;
    await supabase.from('zuri_tap_sessions').delete().eq('token', token);
    res.json({ success: true });
  } catch (error) {
    console.error('Tap session delete error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// QR code for Tap pay link (customer scans to open pay page)
router.get('/qr/:token', async (req, res) => {
  try {
    const { token } = req.params;
    let baseUrl = req.query.baseUrl || process.env.FRONTEND_URL || 'http://localhost:5173';
    if (typeof baseUrl !== 'string') baseUrl = 'http://localhost:5173';
    baseUrl = baseUrl.replace(/\/$/, '');
    const payUrl = `${baseUrl}/tap/pay/${token}`;
    const qrCodeDataUrl = await QRCode.toDataURL(payUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 280,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' }
    });
    res.json({ payUrl, qrCodeDataUrl });
  } catch (error) {
    console.error('Tap QR error:', error);
    res.status(500).json({ error: 'Failed to generate QR' });
  }
});

module.exports = router;
