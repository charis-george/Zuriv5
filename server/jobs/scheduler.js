const { isSupabaseCircuitOpen, summarizeUpstreamError } = require('../lib/supabaseResilience');

function supabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL &&
      (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY)
  );
}

function startBackgroundJobs() {
  const timers = [];

  if (!supabaseConfigured()) {
    console.warn('[ZURI] Background jobs skipped — Supabase env is not set.');
    return { stop() {} };
  }

  if (process.env.SUBSCRIPTION_REMINDERS_ENABLED !== 'false') {
    const intervalMs = Math.max(
      3_600_000,
      Number(process.env.SUBSCRIPTION_REMINDER_INTERVAL_MS) || 6 * 3_600_000
    );
    const run = () => {
      try {
        if (isSupabaseCircuitOpen()) {
          console.warn('[ZURI] Subscription reminder scan skipped — Supabase circuit open');
          return;
        }
        const { processUpcomingRenewalReminders } = require('../lib/paystack-subscription');
        processUpcomingRenewalReminders().catch((err) =>
          console.error('[ZURI] Subscription reminder scan error:', summarizeUpstreamError(err))
        );
      } catch (err) {
        console.error('[ZURI] Subscription reminder module error:', err);
      }
    };
    timers.push(setTimeout(run, 30_000));
    timers.push(setInterval(run, intervalMs));
  }

  if (process.env.ORDER_RECEIPT_SWEEP_ENABLED !== 'false') {
    const intervalMs = Math.max(30_000, Number(process.env.ORDER_RECEIPT_SWEEP_INTERVAL_MS) || 90_000);
    const run = () => {
      try {
        if (isSupabaseCircuitOpen()) {
          console.warn('[ZURI] Receipt sweep skipped — Supabase circuit open');
          return;
        }
        const { sweepPendingOrderReceipts } = require('../lib/orderReceiptSweep');
        sweepPendingOrderReceipts().catch((err) =>
          console.error('[ZURI] Receipt sweep error:', summarizeUpstreamError(err))
        );
      } catch (err) {
        console.error('[ZURI] Receipt sweep module error:', err);
      }
    };
    timers.push(setTimeout(run, 5_000));
    timers.push(setInterval(run, intervalMs));
  }

  try {
    const { scheduleKeepAlive } = require('../lib/keepAlive');
    scheduleKeepAlive();
  } catch (err) {
    console.warn('[ZURI] Keep-alive not started:', err?.message || err);
  }

  return {
    stop() {
      for (const timer of timers) {
        clearTimeout(timer);
        clearInterval(timer);
      }
    }
  };
}

module.exports = { startBackgroundJobs };
