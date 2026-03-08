const jwt = require('jsonwebtoken');

const BUSINESS_JWT_SECRET = process.env.BUSINESS_JWT_SECRET || process.env.JWT_SECRET || 'zuri-business-secret-change-in-production';

function signBusinessToken(businessId) {
  return jwt.sign(
    { sub: businessId },
    BUSINESS_JWT_SECRET,
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
    const payload = jwt.verify(token, BUSINESS_JWT_SECRET);
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
    const payload = jwt.verify(token, BUSINESS_JWT_SECRET);
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
