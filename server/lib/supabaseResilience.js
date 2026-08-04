/**
 * Protect the API when Supabase/Cloudflare origin is timing out (522).
 * Without this, hanging fetches + HTML error dumps exhaust Railway capacity
 * and block payment traffic.
 */

const FAILURE_THRESHOLD = Math.max(1, Number(process.env.SUPABASE_CIRCUIT_FAILURES) || 2);
const OPEN_MS = Math.max(
  30_000,
  Math.min(300_000, Number(process.env.SUPABASE_CIRCUIT_OPEN_MS) || 120_000)
);
const FETCH_TIMEOUT_MS = Math.max(
  3_000,
  Math.min(60_000, Number(process.env.SUPABASE_FETCH_TIMEOUT_MS) || 12_000)
);

/** @type {'closed' | 'open' | 'half_open'} */
let state = 'closed';
let consecutiveFailures = 0;
let openUntil = 0;
let halfOpenInFlight = 0;
let lastCause = null;
let openedAt = 0;

function summarizeUpstreamError(raw) {
  const s = String(raw?.message || raw || '').trim();
  if (!s) return 'unknown_error';

  const ray =
    s.match(/Cloudflare Ray ID:\s*<strong[^>]*>([a-f0-9]+)/i)?.[1] ||
    s.match(/Ray ID[:\s*]+([a-f0-9]+)/i)?.[1] ||
    null;

  if (
    /Error code 522|connection timed out|error_name['":\s]+connection_timeout/i.test(s) ||
    (/<!DOCTYPE html>/i.test(s) && /cloudflare|522/i.test(s))
  ) {
    return ray ? `supabase_origin_timeout_522 ray=${ray}` : 'supabase_origin_timeout_522';
  }
  if (/Error code 521|Error code 523|Error code 524/i.test(s)) {
    const code = (s.match(/Error code (52[134])/i) || [])[1] || '52x';
    return ray ? `supabase_origin_error_${code} ray=${ray}` : `supabase_origin_error_${code}`;
  }
  if (/supabase_circuit_open/i.test(s)) return s.slice(0, 120);
  if (/<!DOCTYPE html>/i.test(s)) {
    return ray ? `upstream_html_error ray=${ray}` : 'upstream_html_error';
  }
  if (s.length > 240) return `${s.slice(0, 237)}...`;
  return s;
}

function isOriginOutageSignal(raw, status) {
  if (status === 521 || status === 522 || status === 523 || status === 524) return true;
  const s = String(raw?.message || raw || '');
  return (
    /supabase_origin_timeout_522|supabase_fetch_timeout|supabase_circuit_open/i.test(s) ||
    /Error code 52[1234]|connection timed out|connection_timeout/i.test(s) ||
    (/<!DOCTYPE html>/i.test(s) && /cloudflare|522|521|523|524/i.test(s)) ||
    raw?.name === 'AbortError' ||
    raw?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
    raw?.code === 'ETIMEDOUT' ||
    raw?.code === 'ECONNRESET'
  );
}

function getCircuitStatus() {
  refreshState();
  return {
    state,
    open: state === 'open',
    openUntil: state === 'open' ? openUntil : 0,
    retryAfterMs: state === 'open' ? Math.max(0, openUntil - Date.now()) : 0,
    consecutiveFailures,
    lastCause,
    openedAt: state === 'open' ? openedAt : 0,
    fetchTimeoutMs: FETCH_TIMEOUT_MS
  };
}

function isSupabaseCircuitOpen() {
  refreshState();
  return state === 'open';
}

function refreshState() {
  if (state === 'open' && Date.now() >= openUntil) {
    state = 'half_open';
    halfOpenInFlight = 0;
  }
}

function openCircuit(cause, retryMs = OPEN_MS) {
  state = 'open';
  openedAt = Date.now();
  openUntil = Date.now() + retryMs;
  lastCause = summarizeUpstreamError(cause);
  consecutiveFailures = FAILURE_THRESHOLD;
  console.error('[ZURI] Supabase circuit OPEN — shedding load', {
    openMs: retryMs,
    cause: lastCause,
    fetchTimeoutMs: FETCH_TIMEOUT_MS
  });
}

function recordSuccess() {
  if (state !== 'closed') {
    console.log('[ZURI] Supabase circuit CLOSED — origin reachable again');
  }
  state = 'closed';
  consecutiveFailures = 0;
  halfOpenInFlight = 0;
  openUntil = 0;
  lastCause = null;
  openedAt = 0;
}

function recordFailure(cause, status) {
  if (!isOriginOutageSignal(cause, status)) return;

  lastCause = summarizeUpstreamError(cause);
  consecutiveFailures += 1;

  if (state === 'half_open' || consecutiveFailures >= FAILURE_THRESHOLD) {
    openCircuit(cause, OPEN_MS);
  }
}

function assertCircuitAllowsRequest() {
  refreshState();

  if (state === 'closed') return;

  if (state === 'open') {
    const err = new Error(
      `supabase_circuit_open retry_after_ms=${Math.max(0, openUntil - Date.now())}`
    );
    err.code = 'SUPABASE_CIRCUIT_OPEN';
    err.retry_after_ms = Math.max(0, openUntil - Date.now());
    throw err;
  }

  // half_open: allow a single probe; everyone else fails fast.
  if (halfOpenInFlight >= 1) {
    const err = new Error('supabase_circuit_half_open_busy');
    err.code = 'SUPABASE_CIRCUIT_OPEN';
    err.retry_after_ms = 5_000;
    throw err;
  }
}

function circuitErrorResponse() {
  const status = getCircuitStatus();
  return {
    error: 'Database temporarily unavailable. Please retry shortly.',
    code: 'SUPABASE_CIRCUIT_OPEN',
    retryable: true,
    retry_after_ms: status.retryAfterMs || OPEN_MS,
    cause: status.lastCause || 'supabase_origin_timeout'
  };
}

/**
 * Custom fetch for @supabase/supabase-js — fail fast on outages, never hang.
 */
async function resilientSupabaseFetch(input, init = {}) {
  assertCircuitAllowsRequest();

  const isProbe = state === 'half_open';
  if (isProbe) halfOpenInFlight += 1;

  const controller = new AbortController();
  const parentSignal = init.signal;
  const onParentAbort = () => controller.abort(parentSignal?.reason);
  if (parentSignal) {
    if (parentSignal.aborted) controller.abort(parentSignal.reason);
    else parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(input, { ...init, signal: controller.signal });

    if ([521, 522, 523, 524].includes(res.status)) {
      const text = await res.text().catch(() => '');
      const summary = summarizeUpstreamError(text || `HTTP ${res.status}`);
      recordFailure({ message: summary }, res.status);
      throw Object.assign(new Error(summary), { status: res.status, code: 'SUPABASE_ORIGIN_TIMEOUT' });
    }

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('text/html')) {
      const text = await res.clone().text().catch(() => '');
      if (isOriginOutageSignal(text, res.status)) {
        const summary = summarizeUpstreamError(text);
        recordFailure({ message: summary }, res.status || 522);
        throw Object.assign(new Error(summary), { status: 522, code: 'SUPABASE_ORIGIN_TIMEOUT' });
      }
    }

    recordSuccess();
    return res;
  } catch (err) {
    if (err?.code === 'SUPABASE_CIRCUIT_OPEN') throw err;

    if (err?.name === 'AbortError') {
      const timeoutErr = Object.assign(new Error('supabase_fetch_timeout'), {
        code: 'SUPABASE_FETCH_TIMEOUT'
      });
      recordFailure(timeoutErr);
      throw timeoutErr;
    }

    recordFailure(err, err?.status);
    if (err?.message && /<!DOCTYPE html>/i.test(err.message)) {
      throw Object.assign(new Error(summarizeUpstreamError(err)), {
        status: err.status,
        code: err.code || 'SUPABASE_ORIGIN_TIMEOUT'
      });
    }
    throw err;
  } finally {
    clearTimeout(timer);
    if (parentSignal) parentSignal.removeEventListener('abort', onParentAbort);
    if (isProbe) halfOpenInFlight = Math.max(0, halfOpenInFlight - 1);
  }
}

module.exports = {
  summarizeUpstreamError,
  isOriginOutageSignal,
  getCircuitStatus,
  isSupabaseCircuitOpen,
  circuitErrorResponse,
  resilientSupabaseFetch,
  recordFailure,
  recordSuccess,
  OPEN_MS,
  FETCH_TIMEOUT_MS
};
