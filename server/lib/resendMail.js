/**
 * All outbound email via Resend (https://resend.com).
 * Set RESEND_API_KEY and RESEND_FROM in production.
 *
 * Reliability (aligned with Resend best practices):
 * - Deterministic Idempotency-Key per business event (caller supplies)
 * - Inline retry on 429 / 5xx / concurrent_idempotent 409
 * - Client-side RPS cap so venue bursts stay under Resend's ~10/s limit
 */

const RESEND_API = 'https://api.resend.com/emails';

/** Stay under Resend default ~10 req/s across parallel workers. */
const RESEND_MAX_RPS = Math.max(2, Math.min(10, Number(process.env.RESEND_MAX_RPS) || 8));
let resendTokens = RESEND_MAX_RPS;
let lastTokenRefill = Date.now();

function refillResendTokens() {
  const now = Date.now();
  const elapsed = now - lastTokenRefill;
  if (elapsed <= 0) return;
  const add = (elapsed / 1000) * RESEND_MAX_RPS;
  resendTokens = Math.min(RESEND_MAX_RPS, resendTokens + add);
  lastTokenRefill = now;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireResendSlot() {
  for (;;) {
    refillResendTokens();
    if (resendTokens >= 1) {
      resendTokens -= 1;
      return;
    }
    await sleep(40);
  }
}

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

function isConcurrentIdempotentConflict(err) {
  if (!err) return false;
  if (Number(err.status) !== 409) return false;
  const body = String(err.body || err.message || '').toLowerCase();
  return body.includes('concurrent_idempotent') || body.includes('concurrent');
}

/** Same key used with a different payload — prior accept likely already happened. */
function isInvalidIdempotentConflict(err) {
  if (!err) return false;
  if (Number(err.status) !== 409) return false;
  if (isConcurrentIdempotentConflict(err)) return false;
  const body = String(err.body || err.message || '').toLowerCase();
  return (
    body.includes('invalid_idempotent') ||
    body.includes('idempotent') ||
    body.includes('409')
  );
}

/**
 * @param {{
 *   to: string | string[],
 *   subject: string,
 *   text?: string,
 *   html?: string,
 *   from?: string,
 *   reply_to?: string,
 *   attachments?: Array<{ filename: string, content: string, content_type?: string, content_id?: string }>
 * }} mail
 * @param {{ timeoutMs?: number, idempotencyKey?: string }} [opts]
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
  const idempotencyKey = opts.idempotencyKey ? String(opts.idempotencyKey).slice(0, 256) : '';
  const maxAttempts = 4;
  let lastErr = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await acquireResendSlot();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    };
    // Stable key so retries / timeouts after accept do not double-deliver the same ticket email.
    if (idempotencyKey) {
      headers['Idempotency-Key'] = idempotencyKey;
    }

    try {
      const response = await fetch(RESEND_API, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (response.ok) {
        return { ok: true, to };
      }

      const text = await response.text().catch(() => '');
      const err = new Error(
        `Resend API ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`
      );
      err.code = `RESEND_HTTP_${response.status}`;
      err.status = response.status;
      err.body = text ? text.slice(0, 500) : '';
      lastErr = err;

      // 409 concurrent_idempotent_requests — same key in flight; wait and retry (Resend docs).
      if (isConcurrentIdempotentConflict(err) && attempt < maxAttempts - 1) {
        await sleep(150 * 2 ** attempt + Math.floor(Math.random() * 100));
        continue;
      }

      // 429 / 5xx — short inline backoff then retry within this call.
      if (
        (response.status === 429 || response.status >= 500) &&
        attempt < maxAttempts - 1
      ) {
        await sleep(300 * 2 ** attempt + Math.floor(Math.random() * 200));
        continue;
      }

      throw err;
    } catch (err) {
      if (err?.name === 'AbortError') {
        const timeoutErr = new Error(`Resend request timed out after ${timeoutMs}ms`);
        timeoutErr.code = 'RESEND_TIMEOUT';
        timeoutErr.cause = err;
        lastErr = timeoutErr;
        if (attempt < maxAttempts - 1) {
          await sleep(200 * 2 ** attempt);
          continue;
        }
        throw timeoutErr;
      }
      if (err?.status && err?.code) {
        lastErr = err;
        if (
          (isConcurrentIdempotentConflict(err) ||
            err.status === 429 ||
            err.status >= 500) &&
          attempt < maxAttempts - 1
        ) {
          await sleep(200 * 2 ** attempt);
          continue;
        }
        throw err;
      }
      // Network blip — retry once or twice.
      lastErr = err;
      if (attempt < maxAttempts - 1 && isRetryableNetworkError(err)) {
        await sleep(200 * 2 ** attempt);
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastErr || new Error('Resend send failed');
}

function isResendConfigured() {
  return Boolean(getResendApiKey());
}

function isPermanentResendError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  if (code === 'RESEND_NOT_CONFIGURED' || code === 'RESEND_NO_RECIPIENTS') return true;
  // Client / auth / validation errors — retrying will not help.
  // 409 invalid_idempotent_request (different payload) is permanent for this key.
  if (
    code === 'RESEND_HTTP_400' ||
    code === 'RESEND_HTTP_401' ||
    code === 'RESEND_HTTP_403' ||
    code === 'RESEND_HTTP_404' ||
    code === 'RESEND_HTTP_422'
  ) {
    return true;
  }
  if (code === 'RESEND_HTTP_409' && !isConcurrentIdempotentConflict(err) && !isInvalidIdempotentConflict(err)) {
    return true;
  }
  // invalid_idempotent is handled by sendOrderReceiptOnce as mark-sent — not permanent give-up.
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
    msg.includes('service unavailable') ||
    msg.includes('concurrent_idempotent')
  );
}

function isRetryableResendError(err) {
  if (!err) return false;
  if (isPermanentResendError(err)) return false;
  const code = String(err.code || '');
  if (code === 'RESEND_TIMEOUT') return true;
  if (code === 'RESEND_HTTP_429') return true;
  if (code === 'RESEND_HTTP_409' && isConcurrentIdempotentConflict(err)) return true;
  if (code === 'RESEND_HTTP_409' && isInvalidIdempotentConflict(err)) return true;
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
  isConcurrentIdempotentConflict,
  isInvalidIdempotentConflict,
  normalizeRecipients,
  RESEND_MAX_RPS
};
