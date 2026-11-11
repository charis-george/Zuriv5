const express = require('express');
const Paystack = require('@paystack/paystack-sdk');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const { requireBusinessAuth } = require('../middleware/auth');
const { getJwtSecret } = require('../lib/jwtSecret');
const { getBusinessPlan, canAccessAnalytics } = require('../lib/plans');
const { canAcceptPayments, statusMessage } = require('../lib/businessStatus');
const { buildPaystackPaymentReference } = require('../lib/paystackCheckout');
const {
  ROOM_TTL_MS,
  SESSION_TTL_MS,
  MAX_OPEN_PENDING_PER_BUSINESS,
  getBusinessTapState,
  listStaffCodes,
  createStaffCode,
  rotateStaffCode,
  revokeStaffCode,
  getStaffCodeById,
  getActiveStaffByCode,
  touchStaffCode,
  turnRoomOn,
  extendRoom,
  turnRoomOff,
  getActiveRoomByBusiness,
  getActiveRoomByCode,
  checkSendRate,
  countOpenSessionsForBusiness,
  createSession,
  getSession,
  getSessionByOrderId,
  updateSession,
  deleteSession,
  deleteSessionByOrderId,
  checkChargeLock,
  recordChargeFailure,
  clearChargeFailures
} = require('../lib/tapRooms');

const router = express.Router();

function db() {
  return getDb();
}
const appPaystack = process.env.PAYSTACK_SECRET_KEY ? new Paystack(process.env.PAYSTACK_SECRET_KEY) : null;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizeCatalogMode(value) {
  const { normalizeBusinessMode } = require('../lib/businessMode');
  return normalizeBusinessMode(value);
}

function sanitizeLabel(value, max = 40) {
  return String(value || '')
    .replace(/[\r\n|]+/g, ' ')
    .trim()
    .slice(0, max);
}

function buildTapCustomerName({ tableRef, staffLabel }) {
  const parts = ['Tap'];
  const table = sanitizeLabel(tableRef, 24);
  const staff = sanitizeLabel(staffLabel, 24);
  if (table) parts.push(table);
  if (staff) parts.push(staff);
  return parts.join(' · ');
}

async function assertTapEligible(businessId) {
  const plan = await getBusinessPlan(businessId);
  if (!canAccessAnalytics(plan)) {
    return { ok: false, status: 403, error: 'Zuri Tap requires Growth plan or above.' };
  }

  const { data: business, error } = await db()
    .from('businesses')
    .select('id, name, logo_url, account_status, bank_verified_at, business_mode')
    .eq('id', businessId)
    .single();
  if (error || !business) return { ok: false, status: 404, error: 'Business not found' };

  if (!canAcceptPayments(business.account_status)) {
    return {
      ok: false,
      status: 403,
      error: statusMessage(business.account_status) || 'This venue cannot accept Tap payments yet.'
    };
  }
  if (!business.bank_verified_at) {
    return {
      ok: false,
      status: 403,
      error: 'Verify your payout bank account before turning on Zuri Tap.'
    };
  }
  return { ok: true, business };
}

function requireTapUser(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Tap authentication required' });
  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (!payload?.sub) return res.status(401).json({ error: 'Invalid tap token' });
    req.tapUserId = payload.sub;
    req.tapUserEmail = payload.email || null;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired tap token' });
  }
}

async function cancelPendingTapOrder(orderId, reason = 'cancelled') {
  const { data: order } = await db()
    .from('orders')
    .select('id, payment_status, status')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return { ok: false, error: 'Order not found' };
  if (order.payment_status === 'paid') return { ok: false, error: 'Order already paid' };

  await db()
    .from('orders')
    .update({ status: 'cancelled', payment_status: reason === 'expired' ? 'failed' : 'pending' })
    .eq('id', orderId)
    .neq('payment_status', 'paid');

  await deleteSessionByOrderId(orderId);
  return { ok: true, order };
}

function staffSocketRoom(code) {
  return `tap-room-${String(code || '').toUpperCase()}`;
}

router.get('/room', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.query;
    if (!businessId || businessId !== req.businessId) return res.status(403).json({ error: 'Forbidden' });
    const room = await getActiveRoomByBusiness(businessId);
    const staffCodes = room?.staffCodes || (await listStaffCodes(businessId));
    return res.json({
      enabled: Boolean(room?.enabled),
      code: room?.code || staffCodes[0]?.code || null,
      expiresAt: room?.expiresAt || null,
      staffCodes,
      roomTtlMs: ROOM_TTL_MS,
      sessionTtlMs: SESSION_TTL_MS
    });
  } catch (err) {
    console.error('Tap room get error:', err);
    return res.status(500).json({ error: 'Could not load Tap state' });
  }
});

router.post('/room/on', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.body || {};
    if (!businessId || businessId !== req.businessId) return res.status(403).json({ error: 'Forbidden' });

    const eligible = await assertTapEligible(businessId);
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error });

    const room = await turnRoomOn(businessId);
    return res.json({
      enabled: true,
      code: room.staffCodes[0]?.code || null,
      expiresAt: room.expiresAt,
      staffCodes: room.staffCodes,
      roomTtlMs: ROOM_TTL_MS,
      sessionTtlMs: SESSION_TTL_MS
    });
  } catch (err) {
    console.error('Tap room/on error:', err);
    return res.status(500).json({ error: 'Zuri Tap can’t start right now. Please try again shortly or contact support.' });
  }
});

/** Extend the Tap live window without rotating staff codes. */
router.post('/room/rotate', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.body || {};
    if (!businessId || businessId !== req.businessId) return res.status(403).json({ error: 'Forbidden' });

    const eligible = await assertTapEligible(businessId);
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error });

    const room = await extendRoom(businessId);
    const io = req.app.get('io');
    if (io) io.to(`business-${businessId}`).emit('tap-room-extended', { expiresAt: room.expiresAt });
    return res.json({
      enabled: true,
      code: room.staffCodes[0]?.code || null,
      expiresAt: room.expiresAt,
      staffCodes: room.staffCodes,
      roomTtlMs: ROOM_TTL_MS,
      sessionTtlMs: SESSION_TTL_MS
    });
  } catch (err) {
    console.error('Tap room/extend error:', err);
    return res.status(500).json({ error: 'Could not extend Tap session' });
  }
});

router.post('/room/off', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.body || {};
    if (!businessId || businessId !== req.businessId) return res.status(403).json({ error: 'Forbidden' });
    await turnRoomOff(businessId);
    return res.json({ success: true, enabled: false });
  } catch (err) {
    console.error('Tap room/off error:', err);
    return res.status(500).json({ error: 'Could not turn Tap off' });
  }
});

router.get('/staff-codes', requireBusinessAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const codes = await listStaffCodes(businessId);
    const state = await getBusinessTapState(businessId);
    return res.json({ enabled: state.enabled, expiresAt: state.expiresAt, codes });
  } catch (err) {
    console.error('Tap staff-codes list error:', err);
    return res.status(500).json({ error: 'Could not load staff codes' });
  }
});

router.post('/staff-codes', requireBusinessAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const eligible = await assertTapEligible(businessId);
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error });

    const created = await createStaffCode(businessId, req.body?.label);
    return res.status(201).json(created);
  } catch (err) {
    if (err.code === 'LIMIT_REACHED') return res.status(400).json({ error: err.message });
    console.error('Tap staff-codes create error:', err);
    return res.status(500).json({ error: 'Could not create staff code' });
  }
});

router.post('/staff-codes/:id/rotate', requireBusinessAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const rotated = await rotateStaffCode(businessId, req.params.id);
    if (!rotated) return res.status(404).json({ error: 'Staff code not found' });
    return res.json(rotated);
  } catch (err) {
    if (err.code === 'LIMIT_REACHED') return res.status(400).json({ error: err.message });
    console.error('Tap staff-codes rotate error:', err);
    return res.status(500).json({ error: 'Could not rotate staff code' });
  }
});

router.delete('/staff-codes/:id', requireBusinessAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const codes = await listStaffCodes(businessId);
    if (codes.length <= 1 && codes[0]?.id === req.params.id) {
      return res.status(400).json({ error: 'Keep at least one staff code while using Tap. Create another before revoking this one.' });
    }
    const ok = await revokeStaffCode(businessId, req.params.id);
    if (!ok) return res.status(404).json({ error: 'Staff code not found' });
    return res.json({ success: true });
  } catch (err) {
    console.error('Tap staff-codes revoke error:', err);
    return res.status(500).json({ error: 'Could not revoke staff code' });
  }
});

/** Public: confirm which business + staff a code belongs to before joining. */
router.get('/lookup/:code', async (req, res) => {
  try {
    const staff = await getActiveStaffByCode(req.params.code);
    if (!staff) return res.status(404).json({ error: 'Invalid or expired Tap code. Ask staff for their live code.' });

    const { data: business, error } = await db()
      .from('businesses')
      .select('id, name, logo_url, bank_verified_at, account_status, address')
      .eq('id', staff.businessId)
      .single();
    if (error || !business) return res.status(404).json({ error: 'Business not found for this code' });
    if (!canAcceptPayments(business.account_status)) {
      return res.status(403).json({ error: statusMessage(business.account_status) || 'This venue is unavailable' });
    }

    await touchStaffCode(staff.id);

    return res.json({
      code: staff.code,
      staffCodeId: staff.id,
      staffLabel: staff.label,
      businessId: business.id,
      businessName: business.name || 'Business',
      logoUrl: business.logo_url || null,
      address: business.address || null,
      bankVerified: Boolean(business.bank_verified_at),
      expiresAt: staff.expiresAt
    });
  } catch (err) {
    console.error('Tap lookup error:', err);
    return res.status(500).json({ error: 'Lookup failed' });
  }
});

router.post('/send', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId, staffCodeId, code, items, tableRef } = req.body || {};
    if (!businessId || businessId !== req.businessId) return res.status(403).json({ error: 'Forbidden' });

    const eligible = await assertTapEligible(businessId);
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error });

    const state = await getBusinessTapState(businessId);
    if (!state.enabled) {
      return res.status(400).json({ error: 'Tap is not live. Turn it on first.' });
    }

    if ((await countOpenSessionsForBusiness(businessId)) >= MAX_OPEN_PENDING_PER_BUSINESS) {
      return res.status(429).json({
        error: `You already have ${MAX_OPEN_PENDING_PER_BUSINESS} open Tap requests. Cancel or wait for payment before sending more.`
      });
    }

    const rate = await checkSendRate(businessId);
    if (!rate.ok) return res.status(429).json({ error: rate.error });

    let staff = null;
    if (staffCodeId) {
      staff = await getStaffCodeById(businessId, staffCodeId);
    } else if (code) {
      const byCode = await getActiveStaffByCode(code);
      if (byCode && byCode.businessId === businessId) staff = byCode;
    }
    if (!staff) {
      return res.status(400).json({ error: 'Select a staff Tap code to send from.' });
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
    const business = eligible.business;

    const { data: menuItems, error: mErr } = await db()
      .from('menu_items')
      .select('id,name,price,business_id,available,item_mode')
      .in('id', ids)
      .eq('business_id', businessId);
    if (mErr || !Array.isArray(menuItems) || !menuItems.length) {
      return res.status(400).json({ error: 'Items not found' });
    }

    const activeMode = normalizeCatalogMode(business.business_mode);
    const requestItems = menuItems
      .filter((mi) => !mi.item_mode || normalizeCatalogMode(mi.item_mode) === activeMode)
      .filter((mi) => mi.available !== false && qtyMap.has(mi.id))
      .map((mi) => ({
        id: mi.id,
        name: mi.name,
        quantity: Math.max(1, Math.floor(qtyMap.get(mi.id))),
        price: Number(mi.price) || 0
      }));
    if (!requestItems.length) return res.status(400).json({ error: 'No valid available items selected' });

    const amount = requestItems.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const table = sanitizeLabel(tableRef, 24);
    const staffLabel = sanitizeLabel(staff.label, 24);
    const customerName = buildTapCustomerName({ tableRef: table, staffLabel });

    const { data: order, error: oErr } = await db()
      .from('orders')
      .insert({
        business_id: businessId,
        customer_name: customerName,
        customer_phone: [table && `Table/ref: ${table}`, staffLabel && `Staff: ${staffLabel}`].filter(Boolean).join(' · ') || null,
        status: 'pending',
        payment_status: 'pending',
        total_amount: amount
      })
      .select('id')
      .single();
    if (oErr || !order?.id) return res.status(500).json({ error: 'Could not create order' });

    const { error: itemErr } = await db().from('order_items').insert(
      requestItems.map((i) => ({
        order_id: order.id,
        menu_item_id: i.id,
        quantity: i.quantity,
        price: i.price
      }))
    );
    if (itemErr) return res.status(500).json({ error: 'Could not save order items' });

    const lineItems = requestItems.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price }));
    const session = await createSession({
      orderId: order.id,
      businessId,
      staffCodeId: staff.id,
      businessName: business.name || 'Business',
      logoUrl: business.logo_url || null,
      bankVerified: Boolean(business.bank_verified_at),
      amount,
      items: lineItems,
      tableRef: table || null,
      staffLabel: staffLabel || null
    });

    await touchStaffCode(staff.id);

    const payload = {
      orderId: order.id,
      businessId,
      businessName: business.name || 'Business',
      logoUrl: business.logo_url || null,
      bankVerified: Boolean(business.bank_verified_at),
      amount,
      items: lineItems,
      token: session.token,
      expiresAt: session.expiresAt,
      tableRef: table || null,
      staffLabel: staffLabel || null,
      staffCodeId: staff.id
    };

    const io = req.app.get('io');
    if (io) {
      // Only customers who joined this staff's code see the request.
      io.to(staffSocketRoom(staff.code)).emit('tap-request', payload);
    }
    return res.json({
      orderId: order.id,
      token: session.token,
      expiresAt: session.expiresAt,
      sessionTtlMs: SESSION_TTL_MS,
      customerName,
      staffCodeId: staff.id,
      staffLabel
    });
  } catch (err) {
    console.error('Tap send error:', err);
    return res.status(500).json({ error: 'Failed to send tap request' });
  }
});

router.post('/cancel', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId, orderId } = req.body || {};
    if (!businessId || businessId !== req.businessId) return res.status(403).json({ error: 'Forbidden' });
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const { data: order } = await db()
      .from('orders')
      .select('id, business_id, payment_status')
      .eq('id', orderId)
      .single();
    if (!order || order.business_id !== businessId) return res.status(404).json({ error: 'Order not found' });
    if (order.payment_status === 'paid') return res.status(400).json({ error: 'Order already paid' });

    const session = await getSessionByOrderId(orderId);
    await cancelPendingTapOrder(orderId, 'cancelled');
    const io = req.app.get('io');
    if (io) {
      io.to(`business-${businessId}`).emit('tap-request-cancelled', { orderId });
      if (session?.staffCodeId) {
        const staff = await getStaffCodeById(businessId, session.staffCodeId);
        if (staff?.code) {
          io.to(staffSocketRoom(staff.code)).emit('tap-request-cancelled', {
            orderId,
            token: session?.token || null
          });
        }
      }
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Tap cancel error:', err);
    return res.status(500).json({ error: 'Could not cancel request' });
  }
});

router.post('/decline', requireTapUser, async (req, res) => {
  try {
    const { orderId, token } = req.body || {};
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const session = token ? await getSession(token) : await getSessionByOrderId(orderId);
    if (session && session.orderId !== orderId) {
      return res.status(400).json({ error: 'Session does not match order' });
    }

    const { data: order } = await db()
      .from('orders')
      .select('id, business_id, payment_status')
      .eq('id', orderId)
      .single();
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.payment_status === 'paid') return res.status(400).json({ error: 'Order already paid' });

    await cancelPendingTapOrder(orderId, 'cancelled');
    const io = req.app.get('io');
    if (io) {
      io.to(`business-${order.business_id}`).emit('tap-request-declined', { orderId });
      if (session?.staffCodeId) {
        const staff = await getStaffCodeById(order.business_id, session.staffCodeId);
        if (staff?.code) {
          io.to(staffSocketRoom(staff.code)).emit('tap-request-cancelled', {
            orderId,
            token: session?.token || null
          });
        }
      }
    }
    return res.json({ success: true });
  } catch (err) {
    console.error('Tap decline error:', err);
    return res.status(500).json({ error: 'Could not decline request' });
  }
});

router.get('/session/:token', async (req, res) => {
  try {
    const session = await getSession(req.params.token);
    if (!session || session.status !== 'open') {
      return res.status(404).json({ error: 'Session expired or not found' });
    }
    return res.json(session);
  } catch (err) {
    console.error('Tap session get error:', err);
    return res.status(500).json({ error: 'Could not load session' });
  }
});

router.delete('/session/:token', async (req, res) => {
  try {
    await deleteSession(req.params.token);
    return res.json({ success: true });
  } catch (err) {
    console.error('Tap session delete error:', err);
    return res.status(500).json({ error: 'Could not clear session' });
  }
});

router.post('/charge-with-password', requireTapUser, async (req, res) => {
  try {
    const { orderId, email, password, token: sessionToken } = req.body || {};
    if (!orderId || !email || !password) {
      return res.status(400).json({ error: 'orderId, email, and password are required' });
    }

    const lock = await checkChargeLock(req.tapUserId);
    if (!lock.ok) return res.status(429).json({ error: lock.error });

    const normalized = normalizeEmail(email);
    const { data: user, error: uErr } = await db()
      .from('zuri_tap_users')
      .select('id,email,password,name,zuri_customer_id')
      .eq('id', req.tapUserId)
      .single();
    if (uErr || !user || normalizeEmail(user.email) !== normalized) {
      return res.status(401).json({ error: 'Tap user mismatch' });
    }

    const validPassword = await bcrypt.compare(String(password), String(user.password || ''));
    if (!validPassword) {
      await recordChargeFailure(req.tapUserId);
      return res.status(401).json({ error: 'Incorrect password' });
    }
    await clearChargeFailures(req.tapUserId);

    const session = sessionToken ? await getSession(sessionToken) : await getSessionByOrderId(orderId);
    if (session && session.orderId !== orderId) {
      return res.status(400).json({ error: 'Session does not match order' });
    }
    if (session && new Date(session.expiresAt).getTime() <= Date.now()) {
      await cancelPendingTapOrder(orderId, 'expired');
      return res.status(410).json({ error: 'This payment request has expired. Ask the business to send a new one.' });
    }

    const { data: order, error: oErr } = await db()
      .from('orders')
      .select('id,business_id,total_amount,payment_status,status')
      .eq('id', orderId)
      .single();
    if (oErr || !order) return res.status(404).json({ error: 'Order not found' });
    if (order.status === 'cancelled') {
      return res.status(410).json({ error: 'This payment request was cancelled.' });
    }
    if (order.payment_status === 'paid') return res.json({ success: true, alreadyPaid: true });

    const eligible = await assertTapEligible(order.business_id);
    if (!eligible.ok) return res.status(eligible.status).json({ error: eligible.error });

    const { data: cards, error: cErr } = await db()
      .from('saved_cards')
      .select('authorization_code')
      .eq('business_id', order.business_id)
      .eq('email', normalized)
      .limit(1);
    if (cErr || !Array.isArray(cards) || !cards[0]?.authorization_code) {
      return res.status(400).json({ error: 'No saved card found for this business. Use card or transfer option.' });
    }

    if (!appPaystack) return res.status(503).json({ error: 'Payment not configured' });

    const amount = Number(order.total_amount) || 0;
    const amountInKobo = Math.round(amount * 100);
    const paymentReference = buildPaystackPaymentReference(order.id);
    await db()
      .from('orders')
      .update({
        paystack_payment_reference: paymentReference,
        payment_method: 'transfer',
        customer_email: normalized,
        zuri_customer_id: user.zuri_customer_id || null
      })
      .eq('id', order.id);

    const charge = await appPaystack.transaction.chargeAuthorization({
      email: normalized,
      amount: amountInKobo,
      reference: paymentReference,
      authorization_code: cards[0].authorization_code
    });
    if (!charge?.status || charge?.data?.status !== 'success') {
      return res.status(400).json({
        error: charge?.data?.message || 'Charge failed',
        retryable: true
      });
    }

    let finalizePaidOrder;
    try {
      finalizePaidOrder = require('../services/payments').finalizePaidOrder;
    } catch {
      finalizePaidOrder = null;
    }

    if (typeof finalizePaidOrder === 'function') {
      const marked = await finalizePaidOrder({
        req,
        orderId: order.id,
        businessId: order.business_id,
        paymentProvider: 'paystack',
        markExtra: { paystack_transaction_id: charge.data?.id || null },
        paidAt: new Date().toISOString(),
        reference: charge.data?.reference || paymentReference,
        payoutAmount: amount,
        tap: true
      });
      if (!marked?.ok) return res.status(500).json({ error: 'Failed to confirm payment', retryable: true });
    } else {
      const { processOrderPayout } = require('../lib/paystack-transfer');
      const { queueOrderReceiptOnce } = require('../lib/orderReceiptEmail');
      await db().from('orders').update({ payment_status: 'paid', payment_provider: 'paystack' }).eq('id', order.id);
      const io = req.app.get('io');
      if (io) {
        io.to(`business-${order.business_id}`).emit('tap-payment-success', { orderId: order.id });
        io.to(`business-${order.business_id}`).emit('order-payment-success', { orderId: order.id });
      }
      queueOrderReceiptOnce({
        orderId: order.id,
        paidAt: new Date().toISOString(),
        reference: paymentReference
      });
      setImmediate(() => {
        processOrderPayout(order.id, amount).catch((err) => console.error('Tap payout error:', err));
      });
    }

    if (sessionToken) await updateSession(sessionToken, { status: 'paid' });
    else if (session?.token) await updateSession(session.token, { status: 'paid' });
    await deleteSessionByOrderId(order.id);

    return res.json({ success: true, orderId: order.id, retryable: false });
  } catch (err) {
    console.error('Tap charge-with-password error:', err);
    return res.status(500).json({ error: 'Payment failed', retryable: true });
  }
});

router.getActiveRoomByCode = getActiveRoomByCode;
router.getActiveStaffByCode = getActiveStaffByCode;
router.SESSION_TTL_MS = SESSION_TTL_MS;
router.ROOM_TTL_MS = ROOM_TTL_MS;

module.exports = router;
module.exports.getActiveRoomByCode = getActiveRoomByCode;
module.exports.getActiveStaffByCode = getActiveStaffByCode;
