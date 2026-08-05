/**
 * Protect the API when Supabase/Cloudflare origin is timing out (522).
 * Without this, hanging fetches + HTML error dumps exhaust Railway capacity
 * and block payment traffic.
 *
 * Tuned for post-upgrade / cold-start realities: prefer short shed windows and
 * more patience on fetch timeouts over flapping the whole API into 503s.
 */

const FAILURE_THRESHOLD = Math.max(1, Number(process.env.SUPABASE_CIRCUIT_FAILURES) || 5);
const OPEN_MS = Math.max(
  15_000,
  Math.min(300_000, Number(process.env.SUPABASE_CIRCUIT_OPEN_MS) || 45_000)
);
const FETCH_TIMEOUT_MS = Math.max(
  5_000,
  Math.min(60_000, Number(process.env.SUPABASE_FETCH_TIMEOUT_MS) || 20_000)
);
const PROBE_TIMEOUT_MS = Math.max(
  FETCH_TIMEOUT_MS,
  Math.min(60_000, Number(process.env.SUPABASE_PROBE_TIMEOUT_MS) || Math.round(FETCH_TIMEOUT_MS * 1.5))
);
const HALF_OPEN_MAX_PROBES = Math.max(
  1,
  Math.min(8, Number(process.env.SUPABASE_HALF_OPEN_PROBES) || 3)
);

/** @type {'closed' | 'open' | 'half_open'} */
let state = 'closed';
let consecutiveFailures = 0;
let openUntil = 0;
let halfOpenInFlight = 0;
let lastCause = null;
let openedAt = 0;
let openStreak = 0;

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
  if (/supabase_circuit_open|supabase_circuit_half_open/i.test(s)) return s.slice(0, 120);
  if (/<!DOCTYPE html>/i.test(s)) {
    return ray ? `upstream_html_error ray=${ray}` : 'upstream_html_error';
  }
  if (s.length > 240) return `${s.slice(0, 237)}...`;
  return s;
}

function isOriginOutageSignal(raw, status) {
  if (status === 521 || status === 522 || status === 523 || status === 524) return true;
  const s = String(raw?.message || raw || '');
  // Do NOT treat our own circuit-shed errors as fresh outage signals — that creates a death spiral.
  if (/supabase_circuit_open|supabase_circuit_half_open_busy/i.test(s)) return false;
  return (
    /supabase_origin_timeout_522|supabase_fetch_timeout/i.test(s) ||
    /Error code 52[1234]|connection timed out|connection_timeout/i.test(s) ||
    (/<!DOCTYPE html>/i.test(s) && /cloudflare|522|521|523|524/i.test(s)) ||
    raw?.name === 'AbortError' ||
    raw?.code === 'UND_ERR_CONNECT_TIMEOUT' ||
    raw?.code === 'ETIMEDOUT' ||
    raw?.code === 'ECONNRESET' ||
    raw?.code === 'SUPABASE_FETCH_TIMEOUT' ||
    raw?.code === 'SUPABASE_ORIGIN_TIMEOUT'
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
    fetchTimeoutMs: FETCH_TIMEOUT_MS,
    probeTimeoutMs: PROBE_TIMEOUT_MS,
    openStreak
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

function nextOpenMs() {
  // Soften repeated flaps: 45s → 60s → 90s … capped.
  const streak = Math.min(4, openStreak);
  return Math.min(180_000, Math.round(OPEN_MS * (1 + streak * 0.35)));
}

function openCircuit(cause, retryMs = nextOpenMs()) {
  state = 'open';
  openedAt = Date.now();
  openUntil = Date.now() + retryMs;
  lastCause = summarizeUpstreamError(cause);
  consecutiveFailures = FAILURE_THRESHOLD;
  openStreak += 1;
  console.error('[ZURI] Supabase circuit OPEN — shedding load', {
    openMs: retryMs,
    openStreak,
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
  openStreak = 0;
}

function recordFailure(cause, status) {
  if (!isOriginOutageSignal(cause, status)) return;

  lastCause = summarizeUpstreamError(cause);
  consecutiveFailures += 1;

  // Half-open probe failure: reopen, but don't require a full failure streak first.
  if (state === 'half_open' || consecutiveFailures >= FAILURE_THRESHOLD) {
    openCircuit(cause);
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

  // half_open: allow a few concurrent probes so one slow request doesn't starve recovery.
  if (halfOpenInFlight >= HALF_OPEN_MAX_PROBES) {
    const err = new Error('supabase_circuit_half_open_busy');
    err.code = 'SUPABASE_CIRCUIT_OPEN';
    err.retry_after_ms = 3_000;
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

  const timeoutMs = isProbe ? PROBE_TIMEOUT_MS : FETCH_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
      // Parent-driven abort is not an origin outage.
      if (parentSignal?.aborted) throw err;
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
  FETCH_TIMEOUT_MS,
  PROBE_TIMEOUT_MS,
  FAILURE_THRESHOLD,
  HALF_OPEN_MAX_PROBES
};
