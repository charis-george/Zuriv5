const crypto = require('crypto');
const { getDb } = require('../database');

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

function tokenExpiresAt() {
  return new Date(Date.now() + RESET_TOKEN_TTL_MS).toISOString();
}

/**
 * @param {'business' | 'tap'} subjectType
 * @param {string} subjectId
 * @returns {Promise<string>} raw token (send to user once)
 */
async function createPasswordResetToken(subjectType, subjectId) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = tokenExpiresAt();

  await getDb()
    .from('password_reset_tokens')
    .delete()
    .eq('subject_type', subjectType)
    .eq('subject_id', subjectId);

  const { error } = await getDb().from('password_reset_tokens').insert({
    token_hash: tokenHash,
    subject_type: subjectType,
    subject_id: subjectId,
    expires_at: expiresAt
  });

  if (error) {
    console.error('[ZURI] password reset token insert failed:', error.message || error);
    throw new Error('Could not create password reset token');
  }

  return token;
}

/**
 * @param {'business' | 'tap'} subjectType
 * @param {string} rawToken
 * @returns {Promise<string | null>} subject id
 */
async function consumePasswordResetToken(subjectType, rawToken) {
  const tokenHash = hashToken(String(rawToken).trim());
  const now = new Date().toISOString();

  const { data, error } = await getDb()
    .from('password_reset_tokens')
    .select('id, subject_id, expires_at')
    .eq('token_hash', tokenHash)
    .eq('subject_type', subjectType)
    .maybeSingle();

  if (error) {
    console.error('[ZURI] password reset token lookup failed:', error.message || error);
    return null;
  }
  if (!data || !data.subject_id || data.expires_at <= now) {
    return null;
  }

  await getDb().from('password_reset_tokens').delete().eq('id', data.id);
  return data.subject_id;
}

/** Best-effort cleanup of expired rows (called before issuing new tokens). */
async function purgeExpiredPasswordResetTokens() {
  try {
    await getDb()
      .from('password_reset_tokens')
      .delete()
      .lt('expires_at', new Date().toISOString());
  } catch (err) {
    console.warn('[ZURI] password reset token purge skipped:', err && err.message ? err.message : err);
  }
}

const MIN_PASSWORD_LENGTH = 8;

function validateNewPassword(password) {
  if (!password || typeof password !== 'string' || !password.trim()) {
    return 'Password is required';
  }
  if (password.trim().length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
  }
  return null;
}

module.exports = {
  createPasswordResetToken,
  consumePasswordResetToken,
  purgeExpiredPasswordResetTokens,
  validateNewPassword,
  MIN_PASSWORD_LENGTH
};
