/**
 * Africa's Talking SMS client (Nigeria).
 * Docs: https://developers.africastalking.com/docs/sms/sending
 */

function isAfricasTalkingConfigured() {
  return Boolean(process.env.AT_USERNAME && process.env.AT_API_KEY);
}

function getAtAgentNumber() {
  return (process.env.AT_AGENT_NUMBER || '').trim() || null;
}

/**
 * Send SMS via Africa's Talking REST API.
 * @param {{ to: string|string[], message: string, from?: string }} opts
 * @returns {Promise<{ ok: boolean, skipped?: boolean, reason?: string, data?: object, error?: string }>}
 */
async function sendSms({ to, message, from }) {
  if (!isAfricasTalkingConfigured()) {
    return { ok: false, skipped: true, reason: 'at_not_configured' };
  }
  const recipients = (Array.isArray(to) ? to : [to])
    .map((n) => normalizeMsisdn(n))
    .filter(Boolean);
  if (!recipients.length) {
    return { ok: false, skipped: true, reason: 'missing_recipient' };
  }
  if (!message || !String(message).trim()) {
    return { ok: false, skipped: true, reason: 'empty_message' };
  }

  const username = process.env.AT_USERNAME;
  const apiKey = process.env.AT_API_KEY;
  const sender = from || process.env.AT_SENDER_ID || undefined;

  const body = new URLSearchParams();
  body.set('username', username);
  body.set('to', recipients.join(','));
  body.set('message', String(message).slice(0, 480));
  if (sender) body.set('from', sender);

  try {
    const res = await fetch('https://api.africastalking.com/version1/messaging', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        apiKey
      },
      body: body.toString()
    });
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!res.ok) {
      return { ok: false, error: `AT HTTP ${res.status}`, data };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
}

/**
 * Normalize NG MSISDN to +234... form for comparison / sending.
 */
function normalizeMsisdn(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/[\s\-()]/g, '').trim();
  if (!s) return null;
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('0') && s.length === 11) s = `234${s.slice(1)}`;
  if (!s.startsWith('234') && /^[789]\d{9}$/.test(s)) {
    s = `234${s}`;
  }
  if (!/^\d{10,15}$/.test(s)) return null;
  return `+${s}`;
}

/** Compare two MSISDNs ignoring formatting. */
function msisdnEqual(a, b) {
  const na = normalizeMsisdn(a);
  const nb = normalizeMsisdn(b);
  if (!na || !nb) return false;
  return na === nb;
}

function msisdnInAllowlist(from, allowlist) {
  if (!Array.isArray(allowlist) || !allowlist.length) return false;
  return allowlist.some((n) => msisdnEqual(from, n));
}

/**
 * Validate inbound webhook via shared secret header (preferred).
 * Query ?secret= is accepted only as a legacy fallback (prefer header — secrets in URLs leak via logs).
 * Deployed envs (production / RAILWAY) always require AT_WEBHOOK_SECRET.
 */
function verifyAtWebhook(req) {
  const secret = (process.env.AT_WEBHOOK_SECRET || '').trim();
  const isDeployed =
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_SERVICE_NAME);

  if (!secret) {
    return !isDeployed;
  }

  const header = req.headers['x-zuri-at-secret'] || req.headers['x-at-secret'];
  if (header && header === secret) return true;

  // Legacy query fallback — discouraged
  const query = req.query?.secret;
  return Boolean(query && query === secret);
}

module.exports = {
  isAfricasTalkingConfigured,
  getAtAgentNumber,
  sendSms,
  normalizeMsisdn,
  msisdnEqual,
  msisdnInAllowlist,
  verifyAtWebhook
};
