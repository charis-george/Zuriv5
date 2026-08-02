const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../lib/jwtSecret');
const { normalizeUuid } = require('../lib/normalizeUuid');

function signBusinessToken(businessId) {
  const sub = normalizeUuid(businessId) || businessId;
  return jwt.sign({ sub }, getJwtSecret(), { expiresIn: '7d' });
}

/** Limited token for ticket scanning only — no dashboard access. */
function signScannerToken(businessId, scannerCodeId) {
  const sub = normalizeUuid(businessId) || businessId;
  return jwt.sign({ sub, scope: 'scanner', sid: scannerCodeId }, getJwtSecret(), {
    expiresIn: '30d'
  });
}

function readBearerToken(req) {
  const auth = req.headers.authorization;
  return auth && auth.startsWith('Bearer ') ? auth.slice(7) : null;
}

function attachBusinessFromPayload(req, payload) {
  if (!payload?.sub) return false;
  req.businessId = normalizeUuid(payload.sub) || payload.sub;
  req.isScannerSession = payload.scope === 'scanner';
  req.scannerCodeId = payload.sid || null;
  return true;
}

function requireBusinessAuth(req, res, next) {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (!attachBusinessFromPayload(req, payload)) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (req.isScannerSession) {
      return res.status(403).json({ error: 'Scanner access cannot use this endpoint. Log in with your full business account.' });
    }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please log in again.' });
    }
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Full business login or scanner-only session (ticket verify). */
function requireBusinessOrScannerAuth(req, res, next) {
  const token = readBearerToken(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, getJwtSecret());
    if (!attachBusinessFromPayload(req, payload)) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Session expired. Please connect again or log in.' });
    }
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function verifyBusinessToken(token) {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, getJwtSecret());
    return payload && payload.sub ? payload : null;
  } catch {
    return null;
  }
}

module.exports = {
  signBusinessToken,
  signScannerToken,
  requireBusinessAuth,
  requireBusinessOrScannerAuth,
  verifyBusinessToken
};
