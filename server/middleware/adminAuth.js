/**
 * Admin API key auth for platform moderation routes.
 * Set ZURI_ADMIN_API_KEY in server env.
 */

function requireAdminAuth(req, res, next) {
  const expected = process.env.ZURI_ADMIN_API_KEY;
  if (!expected || !String(expected).trim()) {
    return res.status(503).json({ error: 'Admin tools aren’t available right now.' });
  }
  const header = req.headers['x-zuri-admin-key'] || req.headers.authorization;
  const key = header && String(header).startsWith('Bearer ')
    ? String(header).slice(7).trim()
    : String(header || '').trim();
  if (!key || key !== String(expected).trim()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { requireAdminAuth };
