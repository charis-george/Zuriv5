const { getDb } = require('../database');
const { enqueueOrderReceipt } = require('./orderReceiptQueue');
const {
  summarizeUpstreamError,
  isSupabaseCircuitOpen,
  isOriginOutageSignal
} = require('./supabaseResilience');

// Aggressive recovery: catch every unpaid ticket receipt, not just a tiny recent window.
const SWEEP_LIMIT = Math.max(5, Math.min(200, Number(process.env.ORDER_RECEIPT_SWEEP_LIMIT) || 80));
const LOOKBACK_HOURS = Math.max(1, Number(process.env.ORDER_RECEIPT_SWEEP_LOOKBACK_HOURS) || 336); // 14 days
const SWEEP_MAX_PAGES = Math.max(1, Math.min(20, Number(process.env.ORDER_RECEIPT_SWEEP_MAX_PAGES) || 5));
const SWEEP_QUERY_RETRIES = Math.max(1, Number(process.env.ORDER_RECEIPT_SWEEP_QUERY_RETRIES) || 2);
const SEND_LOCK_STALE_MS = Math.max(60_000, Number(process.env.ORDER_RECEIPT_LOCK_STALE_MS) || 2 * 60_000);
const AGED_ALERT_MS = Math.max(60_000, Number(process.env.ORDER_RECEIPT_AGED_ALERT_MS) || 5 * 60_000);

/** Avoid spamming the same permanent orphan every sweep cycle. */
const permanentLoggedAt = new Map();
const PERMANENT_LOG_COOLDOWN_MS = 6 * 60 * 60 * 1000;

/**
 * Only true data defects — transient business/order load misses must keep retrying.
 */
function isPermanentReceiptError(errorMessage) {
  if (!errorMessage) return false;
  const s = String(errorMessage);
  if (s.startsWith('permanent:no_tickets')) return true;
  if (s.startsWith('permanent:no_recipients')) return true;
  if (s.startsWith('permanent:no_customer_email')) return true;
  // Legacy permanent: prefixes that were over-broad — do NOT treat as terminal forever.
  if (s.startsWith('permanent:business_not_found')) return false;
  if (s.startsWith('permanent:order_not_found')) return false;
  if (s.startsWith('permanent:missing_resend_key')) return false;
  if (s.startsWith('permanent:')) {
    return /permanent:(no_tickets|no_recipients|no_customer_email)\|/i.test(s);
  }
  // Bare no_tickets / empty items without permanent: prefix stay retryable (payment race).
  return (
    /\bno_recipients\b/i.test(s) ||
    /\bno_customer_email\b/i.test(s)
  );
}

function needsMarkSentOnly(errorMessage) {
  if (!errorMessage) return false;
  return /mark_sent_failed|delivered via Resend but receipt_sent_at/i.test(String(errorMessage));
}

/** Canonical permanent:reason|cause form for DB + query exclusion. */
function normalizePermanentErrorMessage(errorMessage) {
  const s = String(errorMessage || '');
  if (s.startsWith('permanent:no_tickets') || s.startsWith('permanent:no_recipients') || s.startsWith('permanent:no_customer_email')) {
    return s.slice(0, 500);
  }
  let reason = 'no_tickets';
  if (/\bno_recipients\b/i.test(s) || /no_recipients/i.test(s)) reason = 'no_recipients';
  else if (/\bno_customer_email\b/i.test(s)) reason = 'no_customer_email';
  return `permanent:${reason}|${s.slice(0, 460)}`.slice(0, 500);
}

async function ensurePermanentErrorNormalized(supabase, order) {
  const err = order?.receipt_email_error;
  if (!err || !isPermanentReceiptError(err)) return err;
  if (String(err).startsWith('permanent:')) return err;
  const normalized = normalizePermanentErrorMessage(err);
  try {
    await supabase
      .from('orders')
      .update({ receipt_email_error: normalized, receipt_sending_at: null })
      .eq('id', order.id)
      .is('receipt_sent_at', null);
    order.receipt_email_error = normalized;
  } catch {
    // best-effort — query filter still helps once prefix lands
  }
  return normalized;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPendingReceiptPage(supabase, offset) {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  let lastError = null;

  for (let attempt = 0; attempt < SWEEP_QUERY_RETRIES; attempt += 1) {
    if (isSupabaseCircuitOpen()) {
      return {
        data: [],
        error: Object.assign(new Error('supabase_circuit_open'), { code: 'SUPABASE_CIRCUIT_OPEN' })
      };
    }

    try {
      // Exclude normalized permanent:* failures so orphans are not re-scanned every 90s.
      // Null / retryable errors still match. Legacy no-tickets rows are normalized once then excluded.
      const { data, error } = await supabase
        .from('orders')
        .select('id, created_at, receipt_email_error, receipt_send_attempts, receipt_sending_at')
        .eq('payment_status', 'paid')
        .is('receipt_sent_at', null)
        .gte('created_at', since)
        .or('receipt_email_error.is.null,receipt_email_error.not.ilike.permanent:*')
        .order('created_at', { ascending: true })
        .range(offset, offset + SWEEP_LIMIT - 1);

      if (!error) return { data: data || [], error: null };
      lastError = error;
    } catch (err) {
      lastError = err;
    }

    const cause = summarizeUpstreamError(lastError);
    if (isOriginOutageSignal(lastError) || lastError?.code === 'SUPABASE_CIRCUIT_OPEN') {
      console.warn('[ZURI] Receipt sweep query aborted (origin outage)', {
        attempt: attempt + 1,
        cause
      });
      break;
    }

    const delayMs = 400 * 2 ** attempt;
    console.warn('[ZURI] Receipt sweep query retry', {
      attempt: attempt + 1,
      maxAttempts: SWEEP_QUERY_RETRIES,
      delayMs,
      cause
    });
    await sleep(delayMs);
  }

  return { data: [], error: lastError };
}

async function fetchPendingReceiptOrders(supabase) {
  const all = [];
  let offset = 0;
  let lastError = null;

  for (let page = 0; page < SWEEP_MAX_PAGES; page += 1) {
    const { data, error } = await fetchPendingReceiptPage(supabase, offset);
    if (error) {
      lastError = error;
      break;
    }
    all.push(...(data || []));
    if (!data || data.length < SWEEP_LIMIT) break;
    offset += SWEEP_LIMIT;
  }

  return { data: all, error: lastError && all.length === 0 ? lastError : null };
}

function isFreshSendLock(order) {
  if (!order?.receipt_sending_at) return false;
  const lockedAt = Date.parse(order.receipt_sending_at);
  if (!Number.isFinite(lockedAt)) return false;
  return Date.now() - lockedAt < SEND_LOCK_STALE_MS;
}

/**
 * Find paid orders missing receipt emails and enqueue delivery.
 * Covers transient Resend failures, server restarts, and race windows.
 * Goal: every paid ticket order is re-queued until receipt_sent_at is set.
 */
async function sweepPendingOrderReceipts() {
  if (isSupabaseCircuitOpen()) {
    console.warn('[ZURI] Receipt sweep skipped — Supabase circuit open');
    return { scanned: 0, enqueued: 0, skipped: 0, failed: true, deferred: true };
  }

  const supabase = getDb();
  const { data: orders, error } = await fetchPendingReceiptOrders(supabase);

  if (error) {
    console.error('[ZURI] Receipt sweep query failed', {
      reason: 'sweep_query_error',
      cause: summarizeUpstreamError(error),
      retries: SWEEP_QUERY_RETRIES,
      severity: 'critical'
    });
    return { scanned: 0, enqueued: 0, skipped: 0, failed: true };
  }

  let enqueued = 0;
  let skipped = 0;
  let agedPending = 0;
  let permanentSkipped = 0;
  let markSentOnlyCount = 0;

  for (const order of orders || []) {
    const ageMs = Date.now() - Date.parse(order.created_at || '') || 0;
    const aged = ageMs >= AGED_ALERT_MS;

    if (isPermanentReceiptError(order.receipt_email_error)) {
      skipped += 1;
      permanentSkipped += 1;
      const normalized = await ensurePermanentErrorNormalized(supabase, order);
      const lastLog = permanentLoggedAt.get(order.id) || 0;
      if (Date.now() - lastLog >= PERMANENT_LOG_COOLDOWN_MS) {
        permanentLoggedAt.set(order.id, Date.now());
        console.error('[ZURI] Receipt sweep skipped permanent failure — needs ops fix', {
          orderId: order.id,
          reason: 'permanent_receipt_error',
          receipt_email_error: normalized || order.receipt_email_error,
          receipt_send_attempts: Number(order.receipt_send_attempts) || 0,
          ageMs,
          severity: 'critical'
        });
      }
      continue;
    }

    if (isFreshSendLock(order)) {
      skipped += 1;
      if (aged) {
        agedPending += 1;
        console.warn('[ZURI] Receipt still undelivered (send in flight)', {
          orderId: order.id,
          ageMs,
          reason: 'fresh_send_lock',
          receipt_sending_at: order.receipt_sending_at,
          severity: 'warning'
        });
      }
      continue;
    }

    const priorAttempts = Number(order.receipt_send_attempts) || 0;
    const delayMs =
      priorAttempts > 0
        ? Math.min(30_000, 500 * 2 ** Math.min(priorAttempts, 5))
        : 0;

    const markSentOnly = needsMarkSentOnly(order.receipt_email_error);
    if (markSentOnly) markSentOnlyCount += 1;

    const result = enqueueOrderReceipt(
      { orderId: order.id, paidAt: null, reference: order.id },
      { attempt: 0, delayMs, markSentOnly }
    );

    if (result?.queued) {
      enqueued += 1;
      const logFn = aged ? console.warn : console.log;
      logFn('[ZURI] Receipt sweep candidate queued', {
        orderId: order.id,
        reason: markSentOnly ? 'sweep_enqueued_mark_sent_only' : 'sweep_enqueued',
        cause: order.receipt_email_error
          ? `prior receipt_email_error: ${order.receipt_email_error}`
          : 'paid order missing receipt_sent_at',
        receipt_send_attempts: priorAttempts,
        receipt_sending_at: order.receipt_sending_at || null,
        receipt_email_error: order.receipt_email_error || null,
        ageMs,
        delayMs,
        severity: aged ? 'aged_pending' : 'ok'
      });
      if (aged) agedPending += 1;
    } else {
      skipped += 1;
      if (aged && result?.reason !== 'already_queued' && result?.reason !== 'already_in_flight') {
        agedPending += 1;
        console.error('[ZURI] Receipt still undelivered', {
          orderId: order.id,
          ageMs,
          reason: result?.reason || 'enqueue_skipped',
          receipt_send_attempts: priorAttempts,
          receipt_email_error: order.receipt_email_error || null,
          severity: 'critical'
        });
      } else {
        console.log('[ZURI] Receipt sweep candidate not queued', {
          orderId: order.id,
          reason: result?.reason || 'enqueue_skipped',
          cause:
            result?.reason === 'already_in_flight' || result?.reason === 'already_queued'
              ? 'already being processed or waiting in the receipt queue'
              : 'enqueue declined',
          receipt_send_attempts: priorAttempts,
          receipt_email_error: order.receipt_email_error || null
        });
      }
    }
  }

  if (enqueued > 0 || skipped > 0 || agedPending > 0 || permanentSkipped > 0) {
    console.log('[ZURI] Receipt sweep finished', {
      scanned: orders?.length || 0,
      enqueued,
      skipped,
      permanentSkipped,
      markSentOnlyCount,
      agedPending,
      lookbackHours: LOOKBACK_HOURS,
      reason: 'sweep_complete'
    });
  }

  if (agedPending > 0) {
    console.error('[ZURI] Receipt delivery backlog', {
      agedPending,
      scanned: orders?.length || 0,
      severity: 'critical',
      cause: 'paid orders still missing receipt_sent_at after aged threshold'
    });
  }

  return {
    scanned: orders?.length || 0,
    enqueued,
    skipped,
    permanentSkipped,
    markSentOnlyCount,
    agedPending
  };
}

module.exports = {
  sweepPendingOrderReceipts,
  isPermanentReceiptError
};
