/**
 * Per-email lockout for Tap login / password reset abuse.
 */
const loginFailsByEmail = new Map();

const LOGIN_MAX_FAILS = Number(process.env.TAP_LOGIN_MAX_FAILS) || 8;
const LOGIN_LOCK_MS = Number(process.env.TAP_LOGIN_LOCK_MS) || 15 * 60 * 1000;

function normalizeEmail(email) {
  return String(email || '')
    .trim()
    .toLowerCase();
}

function checkLoginLock(email) {
  const key = normalizeEmail(email);
  const entry = loginFailsByEmail.get(key);
  if (!entry?.lockedUntil) return { ok: true };
  if (entry.lockedUntil > Date.now()) {
    const mins = Math.ceil((entry.lockedUntil - Date.now()) / 60000);
    return { ok: false, error: `Too many sign-in attempts. Try again in ${mins} minute(s).` };
  }
  loginFailsByEmail.delete(key);
  return { ok: true };
}

function recordLoginFailure(email) {
  const key = normalizeEmail(email);
  const entry = loginFailsByEmail.get(key) || { fails: 0, lockedUntil: 0 };
  entry.fails += 1;
  if (entry.fails >= LOGIN_MAX_FAILS) {
    entry.lockedUntil = Date.now() + LOGIN_LOCK_MS;
    entry.fails = 0;
  }
  loginFailsByEmail.set(key, entry);
}

function clearLoginFailures(email) {
  loginFailsByEmail.delete(normalizeEmail(email));
}

module.exports = {
  checkLoginLock,
  recordLoginFailure,
  clearLoginFailures
};
