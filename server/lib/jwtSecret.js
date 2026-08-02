/**
 * Central JWT secret resolution. In production a strong secret is mandatory.
 */
function resolveJwtSecret() {
  const raw = process.env.BUSINESS_JWT_SECRET || process.env.JWT_SECRET;
  if (raw && typeof raw === 'string' && raw.trim()) return raw.trim();
  if (process.env.NODE_ENV === 'production') return null;
  return 'zuri-dev-secret-change-me';
}

const JWT_SECRET = resolveJwtSecret();

if (process.env.NODE_ENV === 'production' && !JWT_SECRET) {
  console.error(
    '[ZURI] FATAL: Set BUSINESS_JWT_SECRET or JWT_SECRET in production. Auth routes will fail until this is set.'
  );
}

function getJwtSecret() {
  if (JWT_SECRET) return JWT_SECRET;
  throw new Error('JWT secret is not configured');
}

module.exports = { getJwtSecret, JWT_SECRET };
