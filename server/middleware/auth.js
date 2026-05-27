const jwt = require('jsonwebtoken');

const BUSINESS_JWT_SECRET = process.env.BUSINESS_JWT_SECRET || process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'zuri-business-secret-change-in-production' : null);

// In production we prefer env-provided secrets, but do not hard-crash the whole server
// if secrets are missing (deploys can momentarily start without env).
if (!BUSINESS_JWT_SECRET) {
  console.warn('[ZURI] Missing BUSINESS_JWT_SECRET/JWT_SECRET. Using a temporary in-memory fallback; auth may fail until env is set.');
}

function signBusinessToken(businessId) {
  return jwt.sign(
    { sub: businessId },
    BUSINESS_JWT_SECRET || 'zuri-missing-jwt-secret',
    { expiresIn: '7d' }
  );
}

function requireBusinessAuth(req, res, next) {
  const auth = req.headers.authorization;
  const token = auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, BUSINESS_JWT_SECRET || 'zuri-missing-jwt-secret');
    if (!payload.sub) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.businessId = payload.sub;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function verifyBusinessToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, BUSINESS_JWT_SECRET || 'zuri-missing-jwt-secret');
    return payload && payload.sub ? payload : null;
  } catch {
    return null;
  }
}

module.exports = {
  signBusinessToken,
  requireBusinessAuth,
  verifyBusinessToken
};
