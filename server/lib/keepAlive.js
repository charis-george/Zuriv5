/**
 * Free-tier keep-alive: one cheap Supabase touch every few minutes so the
 * project is less likely to auto-pause. Skips when the circuit is open.
 */

const { getDb } = require('../database');
const {
  isSupabaseCircuitOpen,
  summarizeUpstreamError
} = require('./supabaseResilience');

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

function keepAliveEnabled() {
  const raw = process.env.KEEPALIVE_ENABLED;
  if (raw === 'false' || raw === '0') return false;
  if (raw === 'true' || raw === '1') return true;
  // On by default in production so Free Supabase stays warm without extra setup.
  return process.env.NODE_ENV === 'production';
}

function keepAliveIntervalMs() {
  return Math.max(
    60_000,
    Math.min(30 * 60_000, Number(process.env.KEEPALIVE_INTERVAL_MS) || DEFAULT_INTERVAL_MS)
  );
}

async function pingSupabaseOnce() {
  if (!keepAliveEnabled()) return { skipped: true, reason: 'disabled' };
  if (isSupabaseCircuitOpen()) return { skipped: true, reason: 'circuit_open' };

  const supabase = getDb();
  const started = Date.now();
  // Tiny read — enough activity to discourage idle pause; not a full table scan.
  const { error } = await supabase.from('businesses').select('id').limit(1);
  const ms = Date.now() - started;

  if (error) {
    return {
      ok: false,
      ms,
      cause: summarizeUpstreamError(error)
    };
  }
  return { ok: true, ms };
}

function scheduleKeepAlive() {
  if (!keepAliveEnabled()) {
    console.log('[ZURI] Keep-alive disabled (set KEEPALIVE_ENABLED=true to enable)');
    return;
  }

  const intervalMs = keepAliveIntervalMs();
  let inFlight = false;

  const run = () => {
    if (inFlight) return;
    inFlight = true;
    pingSupabaseOnce()
      .then((result) => {
        if (result.skipped) return;
        if (result.ok) {
          // Quiet success — only log occasionally via debug-ish single line.
          if (process.env.KEEPALIVE_LOG === 'true') {
            console.log('[ZURI] Keep-alive ok', { ms: result.ms });
          }
        } else {
          console.warn('[ZURI] Keep-alive failed', {
            ms: result.ms,
            cause: result.cause
          });
        }
      })
      .catch((err) => {
        console.warn('[ZURI] Keep-alive error', summarizeUpstreamError(err));
      })
      .finally(() => {
        inFlight = false;
      });
  };

  // First ping after one interval so boot/payment traffic is not competing.
  setTimeout(run, intervalMs);
  setInterval(run, intervalMs);
  console.log('[ZURI] Keep-alive scheduled', { intervalMs });
}

module.exports = {
  keepAliveEnabled,
  keepAliveIntervalMs,
  pingSupabaseOnce,
  scheduleKeepAlive
};
