const crypto = require('crypto');

function verifyPaystackSignature(rawBody, signature, secret) {
  if (!signature || !secret) {
    return { ok: false, status: 400, message: 'Missing signature or secret' };
  }
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    return { ok: false, status: 400, message: 'Invalid body' };
  }
  const hash = crypto.createHmac('sha512', secret).update(rawBody).digest('hex');
  if (hash !== signature) {
    return { ok: false, status: 401, message: 'Invalid signature' };
  }
  try {
    return { ok: true, event: JSON.parse(rawBody.toString()) };
  } catch {
    return { ok: false, status: 400, message: 'Invalid JSON' };
  }
}

module.exports = { verifyPaystackSignature };
