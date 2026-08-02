/**
 * Postgres-backed Zuri Tap state (multi-instance safe).
 * Staff sub-codes are the join codes; business Tap must be enabled for them to work.
 */
const crypto = require('crypto');
const { getDb } = require('../database');
const { redisIncrWindow, redisGetJson, redisSetJson, redisDel } = require('./redis');

const ROOM_TTL_MS = Number(process.env.TAP_ROOM_TTL_MS) || 60 * 60 * 1000;
const SESSION_TTL_MS = Number(process.env.TAP_SESSION_TTL_MS) || 15 * 60 * 1000;
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_STAFF_CODES = Number(process.env.TAP_MAX_STAFF_CODES) || 20;
const MAX_SENDS_PER_HOUR = Number(process.env.TAP_MAX_SENDS_PER_HOUR) || 40;
const MAX_OPEN_PENDING_PER_BUSINESS = Number(process.env.TAP_MAX_OPEN_PENDING) || 8;
const CHARGE_MAX_FAILS = Number(process.env.TAP_CHARGE_MAX_FAILS) || 5;
const CHARGE_LOCK_MS = Number(process.env.TAP_CHARGE_LOCK_MS) || 15 * 60 * 1000;

/** Process-local fallbacks when Redis is down */
const sendRateByBusiness = new Map();
const chargeLockByUser = new Map();

function db() {
  return getDb();
}

function nowMs() {
  return Date.now();
}

function expiresIso(msFromNow) {
  return new Date(nowMs() + msFromNow).toISOString();
}

function normalizeCode(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 6);
}

function randomCode() {
  let out = '';
  for (let i = 0; i < 6; i += 1) {
    out += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
  }
  return out;
}

async function allocateUniqueCode() {
  for (let i = 0; i < 24; i += 1) {
    const code = randomCode();
    const { data } = await db()
      .from('tap_staff_codes')
      .select('id')
      .eq('code', code)
      .is('revoked_at', null)
      .maybeSingle();
    if (!data) return code;
  }
  throw new Error('Could not allocate Tap staff code');
}

function mapStaffRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    businessId: row.business_id,
    code: row.code,
    label: row.label || 'Staff',
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at || null
  };
}

async function getBusinessTapState(businessId) {
  const { data, error } = await db()
    .from('tap_business_state')
    .select('business_id, enabled, expires_at, updated_at')
    .eq('business_id', businessId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.enabled) return { enabled: false, expiresAt: null };

  if (data.expires_at && new Date(data.expires_at).getTime() <= nowMs()) {
    await db()
      .from('tap_business_state')
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq('business_id', businessId);
    return { enabled: false, expiresAt: null };
  }
  return { enabled: true, expiresAt: data.expires_at || null };
}

async function setBusinessTapEnabled(businessId, enabled, ttlMs = ROOM_TTL_MS) {
  const expiresAt = enabled ? expiresIso(ttlMs) : null;
  const { data, error } = await db()
    .from('tap_business_state')
    .upsert(
      {
        business_id: businessId,
        enabled: Boolean(enabled),
        expires_at: expiresAt,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'business_id' }
    )
    .select('enabled, expires_at')
    .single();
  if (error) throw error;
  return { enabled: Boolean(data.enabled), expiresAt: data.expires_at || null };
}

async function countActiveStaffCodes(businessId) {
  const { count, error } = await db()
    .from('tap_staff_codes')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .is('revoked_at', null);
  if (error) throw error;
  return count || 0;
}

async function listStaffCodes(businessId) {
  const { data, error } = await db()
    .from('tap_staff_codes')
    .select('id, business_id, code, label, created_at, last_used_at')
    .eq('business_id', businessId)
    .is('revoked_at', null)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data || []).map(mapStaffRow);
}

async function createStaffCode(businessId, label) {
  const active = await countActiveStaffCodes(businessId);
  if (active >= MAX_STAFF_CODES) {
    const err = new Error(`You can have at most ${MAX_STAFF_CODES} active Tap staff codes. Revoke one first.`);
    err.code = 'LIMIT_REACHED';
    throw err;
  }
  const safeLabel = String(label || 'Staff')
    .replace(/[\r\n|]+/g, ' ')
    .trim()
    .slice(0, 40) || 'Staff';

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const code = await allocateUniqueCode();
    const { data, error } = await db()
      .from('tap_staff_codes')
      .insert({
        business_id: businessId,
        code,
        label: safeLabel
      })
      .select('id, business_id, code, label, created_at, last_used_at')
      .single();
    if (!error && data) return mapStaffRow(data);
    if (error && !/duplicate|unique/i.test(error.message || '')) throw error;
  }
  throw new Error('Could not create Tap staff code');
}

async function rotateStaffCode(businessId, staffCodeId) {
  const { data: existing, error } = await db()
    .from('tap_staff_codes')
    .select('id, label')
    .eq('id', staffCodeId)
    .eq('business_id', businessId)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!existing) return null;

  await db()
    .from('tap_staff_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', staffCodeId);

  return createStaffCode(businessId, existing.label);
}

async function revokeStaffCode(businessId, staffCodeId) {
  const { data, error } = await db()
    .from('tap_staff_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', staffCodeId)
    .eq('business_id', businessId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return Boolean(data?.id);
}

async function getStaffCodeById(businessId, staffCodeId) {
  const { data, error } = await db()
    .from('tap_staff_codes')
    .select('id, business_id, code, label, created_at, last_used_at')
    .eq('id', staffCodeId)
    .eq('business_id', businessId)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw error;
  return mapStaffRow(data);
}

/**
 * Resolve a customer-entered code → staff + business, only if Tap is live.
 */
async function getActiveStaffByCode(code) {
  const roomCode = normalizeCode(code);
  if (roomCode.length !== 6) return null;

  const { data: staff, error } = await db()
    .from('tap_staff_codes')
    .select('id, business_id, code, label, created_at, last_used_at')
    .eq('code', roomCode)
    .is('revoked_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!staff) return null;

  const state = await getBusinessTapState(staff.business_id);
  if (!state.enabled) return null;

  return {
    ...mapStaffRow(staff),
    expiresAt: state.expiresAt
  };
}

async function touchStaffCode(staffCodeId) {
  if (!staffCodeId) return;
  await db()
    .from('tap_staff_codes')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', staffCodeId);
}

async function ensureDefaultStaffCode(businessId) {
  const existing = await listStaffCodes(businessId);
  if (existing.length) return existing;
  const created = await createStaffCode(businessId, 'Main');
  return [created];
}

async function turnRoomOn(businessId) {
  const state = await setBusinessTapEnabled(businessId, true, ROOM_TTL_MS);
  const staffCodes = await ensureDefaultStaffCode(businessId);
  return { ...state, staffCodes };
}

async function extendRoom(businessId) {
  const current = await getBusinessTapState(businessId);
  if (!current.enabled) return turnRoomOn(businessId);
  const state = await setBusinessTapEnabled(businessId, true, ROOM_TTL_MS);
  const staffCodes = await listStaffCodes(businessId);
  return { ...state, staffCodes };
}

async function turnRoomOff(businessId) {
  await setBusinessTapEnabled(businessId, false);
  return { enabled: false, expiresAt: null };
}

/** @deprecated alias — use getActiveStaffByCode */
async function getActiveRoomByCode(code) {
  const staff = await getActiveStaffByCode(code);
  if (!staff) return null;
  return {
    code: staff.code,
    businessId: staff.businessId,
    expiresAt: staff.expiresAt,
    staffCodeId: staff.id,
    staffLabel: staff.label
  };
}

async function getActiveRoomByBusiness(businessId) {
  const state = await getBusinessTapState(businessId);
  if (!state.enabled) return null;
  const staffCodes = await listStaffCodes(businessId);
  return {
    enabled: true,
    expiresAt: state.expiresAt,
    staffCodes,
    /** first code for backward-compatible clients */
    code: staffCodes[0]?.code || null
  };
}

async function checkSendRate(businessId) {
  const redisResult = await redisIncrWindow(
    `tap:send:${businessId}`,
    60 * 60 * 1000,
    MAX_SENDS_PER_HOUR
  );
  if (redisResult) {
    if (!redisResult.ok) {
      return { ok: false, error: `Tap send limit reached (${MAX_SENDS_PER_HOUR}/hour). Try again later.` };
    }
    return { ok: true };
  }

  const now = nowMs();
  const entry = sendRateByBusiness.get(businessId);
  if (!entry || now - entry.windowStart >= 60 * 60 * 1000) {
    sendRateByBusiness.set(businessId, { count: 1, windowStart: now });
    return { ok: true };
  }
  if (entry.count >= MAX_SENDS_PER_HOUR) {
    return { ok: false, error: `Tap send limit reached (${MAX_SENDS_PER_HOUR}/hour). Try again later.` };
  }
  entry.count += 1;
  return { ok: true };
}

async function countOpenSessionsForBusiness(businessId) {
  const nowIso = new Date().toISOString();
  const { count, error } = await db()
    .from('tap_sessions')
    .select('token', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('status', 'open')
    .gt('expires_at', nowIso);
  if (error) throw error;
  return count || 0;
}

async function createSession(payload) {
  const token = crypto.randomBytes(16).toString('hex');
  const expiresAt = expiresIso(SESSION_TTL_MS);
  const session = {
    token,
    orderId: payload.orderId,
    businessId: payload.businessId,
    staffCodeId: payload.staffCodeId || null,
    businessName: payload.businessName,
    logoUrl: payload.logoUrl || null,
    bankVerified: Boolean(payload.bankVerified),
    amount: payload.amount,
    items: payload.items || [],
    tableRef: payload.tableRef || null,
    staffLabel: payload.staffLabel || null,
    status: 'open',
    expiresAt,
    createdAt: new Date().toISOString()
  };

  const { error } = await db().from('tap_sessions').insert({
    token,
    order_id: session.orderId,
    business_id: session.businessId,
    staff_code_id: session.staffCodeId,
    payload: session,
    status: 'open',
    expires_at: expiresAt
  });
  if (error) throw error;

  await redisSetJson(`tap:session:${token}`, session, SESSION_TTL_MS);
  return session;
}

function rowToSession(row) {
  if (!row) return null;
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  return {
    ...payload,
    token: row.token,
    orderId: row.order_id || payload.orderId,
    businessId: row.business_id || payload.businessId,
    staffCodeId: row.staff_code_id || payload.staffCodeId || null,
    status: row.status || payload.status || 'open',
    expiresAt: row.expires_at || payload.expiresAt
  };
}

async function getSession(token) {
  const key = String(token || '').trim();
  if (!key) return null;

  const cached = await redisGetJson(`tap:session:${key}`);
  if (cached) {
    if (new Date(cached.expiresAt).getTime() <= nowMs() || cached.status !== 'open') {
      await redisDel(`tap:session:${key}`);
      return null;
    }
    return cached;
  }

  const { data, error } = await db().from('tap_sessions').select('*').eq('token', key).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.status !== 'open' || new Date(data.expires_at).getTime() <= nowMs()) {
    if (data.status === 'open') {
      await db().from('tap_sessions').update({ status: 'expired' }).eq('token', key);
    }
    return null;
  }
  const session = rowToSession(data);
  await redisSetJson(`tap:session:${key}`, session, Math.max(1000, new Date(session.expiresAt).getTime() - nowMs()));
  return session;
}

async function getSessionByOrderId(orderId) {
  const { data, error } = await db()
    .from('tap_sessions')
    .select('*')
    .eq('order_id', orderId)
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (new Date(data.expires_at).getTime() <= nowMs()) {
    await db().from('tap_sessions').update({ status: 'expired' }).eq('token', data.token);
    return null;
  }
  return rowToSession(data);
}

async function updateSession(token, patch) {
  const session = await getSession(token);
  if (!session) return null;
  const next = { ...session, ...patch };
  await db()
    .from('tap_sessions')
    .update({
      status: next.status || session.status,
      payload: next,
      staff_code_id: next.staffCodeId || null
    })
    .eq('token', token);
  if (next.status === 'open') {
    await redisSetJson(`tap:session:${token}`, next, Math.max(1000, new Date(next.expiresAt).getTime() - nowMs()));
  } else {
    await redisDel(`tap:session:${token}`);
  }
  return next;
}

async function deleteSession(token) {
  const key = String(token || '').trim();
  await db().from('tap_sessions').delete().eq('token', key);
  await redisDel(`tap:session:${key}`);
}

async function deleteSessionByOrderId(orderId) {
  const { data } = await db().from('tap_sessions').select('token').eq('order_id', orderId);
  await db().from('tap_sessions').delete().eq('order_id', orderId);
  for (const row of data || []) {
    await redisDel(`tap:session:${row.token}`);
  }
}

async function checkChargeLock(userId) {
  const cached = await redisGetJson(`tap:charge-lock:${userId}`);
  if (cached?.lockedUntil && cached.lockedUntil > nowMs()) {
    const mins = Math.ceil((cached.lockedUntil - nowMs()) / 60000);
    return { ok: false, error: `Too many incorrect password attempts. Try again in ${mins} minute(s).` };
  }

  const entry = chargeLockByUser.get(userId);
  if (!entry) return { ok: true };
  if (entry.lockedUntil && entry.lockedUntil > nowMs()) {
    const mins = Math.ceil((entry.lockedUntil - nowMs()) / 60000);
    return { ok: false, error: `Too many incorrect password attempts. Try again in ${mins} minute(s).` };
  }
  return { ok: true };
}

async function recordChargeFailure(userId) {
  const cached = (await redisGetJson(`tap:charge-lock:${userId}`)) || { fails: 0, lockedUntil: 0 };
  const entry = chargeLockByUser.get(userId) || cached;
  entry.fails = (entry.fails || 0) + 1;
  if (entry.fails >= CHARGE_MAX_FAILS) {
    entry.lockedUntil = nowMs() + CHARGE_LOCK_MS;
    entry.fails = 0;
  }
  chargeLockByUser.set(userId, entry);
  await redisSetJson(`tap:charge-lock:${userId}`, entry, CHARGE_LOCK_MS);
}

async function clearChargeFailures(userId) {
  chargeLockByUser.delete(userId);
  await redisDel(`tap:charge-lock:${userId}`);
}

module.exports = {
  ROOM_TTL_MS,
  SESSION_TTL_MS,
  MAX_OPEN_PENDING_PER_BUSINESS,
  MAX_STAFF_CODES,
  normalizeCode,
  getBusinessTapState,
  listStaffCodes,
  createStaffCode,
  rotateStaffCode,
  revokeStaffCode,
  getStaffCodeById,
  getActiveStaffByCode,
  touchStaffCode,
  ensureDefaultStaffCode,
  turnRoomOn,
  extendRoom,
  turnRoomOff,
  getActiveRoomByCode,
  getActiveRoomByBusiness,
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
};
