/**
 * All outbound email via Resend (https://resend.com).
 * Set RESEND_API_KEY and RESEND_FROM in production.
 */

const RESEND_API = 'https://api.resend.com/emails';

function getResendApiKey() {
  const key = process.env.RESEND_API_KEY;
  if (!key || typeof key !== 'string' || !key.trim()) return null;
  return key.trim();
}

function getResendFrom() {
  return process.env.RESEND_FROM || 'ZURI <onboarding@resend.dev>';
}

function normalizeRecipients(to) {
  const list = Array.isArray(to) ? to : [to];
  return list
    .map((addr) => (addr == null ? '' : String(addr).trim().toLowerCase()))
    .filter(Boolean);
}

/**
 * @param {{
 *   to: string | string[],
 *   subject: string,
 *   text?: string,
 *   html?: string,
 *   from?: string,
 *   reply_to?: string,
 *   attachments?: Array<{ filename: string, content: string, content_type?: string }>
 * }} mail
 * @param {{ timeoutMs?: number }} [opts]
 */
async function sendResendEmail(mail, opts = {}) {
  const apiKey = getResendApiKey();
  if (!apiKey) {
    const err = new Error('RESEND_API_KEY is not configured');
    err.code = 'RESEND_NOT_CONFIGURED';
    throw err;
  }

  const to = normalizeRecipients(mail.to);
  if (!to.length) {
    const err = new Error('No email recipients');
    err.code = 'RESEND_NO_RECIPIENTS';
    throw err;
  }

  const payload = {
    from: mail.from || getResendFrom(),
    to,
    subject: mail.subject
  };
  if (mail.text) payload.text = mail.text;
  if (mail.html) payload.html = mail.html;
  if (mail.reply_to) payload.reply_to = mail.reply_to;
  if (mail.attachments?.length) {
    payload.attachments = mail.attachments.map((att) => {
      const out = {
        filename: att.filename,
        content: att.content
      };
      if (att.content_type) out.content_type = att.content_type;
      if (att.content_id) out.content_id = att.content_id;
      return out;
    });
  }

  const timeoutMs = opts.timeoutMs ?? 10_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(RESEND_API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const err = new Error(
        `Resend API ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`
      );
      err.code = `RESEND_HTTP_${response.status}`;
      err.status = response.status;
      err.body = text ? text.slice(0, 500) : '';
      throw err;
    }

    return { ok: true, to };
  } catch (err) {
    if (err?.name === 'AbortError') {
      const timeoutErr = new Error(`Resend request timed out after ${timeoutMs}ms`);
      timeoutErr.code = 'RESEND_TIMEOUT';
      timeoutErr.cause = err;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function isResendConfigured() {
  return Boolean(getResendApiKey());
}

function isPermanentResendError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  if (code === 'RESEND_NOT_CONFIGURED' || code === 'RESEND_NO_RECIPIENTS') return true;
  // Client / auth / validation errors — retrying will not help.
  if (
    code === 'RESEND_HTTP_400' ||
    code === 'RESEND_HTTP_401' ||
    code === 'RESEND_HTTP_403' ||
    code === 'RESEND_HTTP_404' ||
    code === 'RESEND_HTTP_422'
  ) {
    return true;
  }
  return false;
}

/** Transient network / upstream failures (Supabase, Resend, DNS, Railway blips). */
function isRetryableNetworkError(err) {
  if (!err) return false;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  const code = String(err.code || err.cause?.code || '');
  if (
    code === 'RESEND_TIMEOUT' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'EPIPE' ||
    code === 'ETIMEDOUT' ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'UND_ERR_CONNECT_TIMEOUT' ||
    code === 'UND_ERR_HEADERS_TIMEOUT' ||
    code === 'UND_ERR_BODY_TIMEOUT' ||
    code === 'UND_ERR_SOCKET'
  ) {
    return true;
  }
  const msg = String(err.message || err.cause?.message || err || '').toLowerCase();
  return (
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('socket') ||
    msg.includes('econnreset') ||
    msg.includes('etimedout') ||
    msg.includes('aborted') ||
    msg.includes('timeout') ||
    msg.includes('rate limit') ||
    msg.includes('temporarily unavailable') ||
    msg.includes('service unavailable')
  );
}

function isRetryableResendError(err) {
  if (!err) return false;
  if (isPermanentResendError(err)) return false;
  const code = String(err.code || '');
  if (code === 'RESEND_TIMEOUT') return true;
  if (code === 'RESEND_HTTP_429') return true;
  if (/^RESEND_HTTP_5\d\d$/.test(code)) return true;
  if (isRetryableNetworkError(err)) return true;
  // Fail-safe for ticket delivery: unknown errors retry until MAX_ATTEMPTS.
  return true;
}

module.exports = {
  getResendApiKey,
  getResendFrom,
  sendResendEmail,
  isResendConfigured,
  isPermanentResendError,
  isRetryableNetworkError,
  isRetryableResendError,
  normalizeRecipients
};
