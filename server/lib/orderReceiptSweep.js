const { getDb } = require('../database');
const { enqueueOrderReceipt } = require('./orderReceiptQueue');

const SWEEP_LIMIT = Math.max(5, Math.min(150, Number(process.env.ORDER_RECEIPT_SWEEP_LIMIT) || 60));
const LOOKBACK_HOURS = Math.max(1, Number(process.env.ORDER_RECEIPT_SWEEP_LOOKBACK_HOURS) || 72);
const SWEEP_QUERY_RETRIES = Math.max(1, Number(process.env.ORDER_RECEIPT_SWEEP_QUERY_RETRIES) || 3);
const SEND_LOCK_STALE_MS = Math.max(60_000, Number(process.env.ORDER_RECEIPT_LOCK_STALE_MS) || 2 * 60_000);
const AGED_ALERT_MS = Math.max(60_000, Number(process.env.ORDER_RECEIPT_AGED_ALERT_MS) || 10 * 60_000);

/** Match permanent failures so the sweep does not re-enqueue forever. */
function isPermanentReceiptError(errorMessage) {
  if (!errorMessage) return false;
  const s = String(errorMessage);
  if (s.startsWith('permanent:')) return true;
  return (
    /no_tickets|business_not_found|order_not_found|no_recipients|missing_resend_key|no_customer_email/i.test(s) ||
    /no order_items quantity to mint ticket QRs/i.test(s)
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchPendingReceiptOrders(supabase) {
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  let lastError = null;

  for (let attempt = 0; attempt < SWEEP_QUERY_RETRIES; attempt += 1) {
    try {
      const { data, error } = await supabase
        .from('orders')
        .select('id, created_at, receipt_email_error, receipt_send_attempts, receipt_sending_at')
        .eq('payment_status', 'paid')
        .is('receipt_sent_at', null)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .limit(SWEEP_LIMIT);

      if (!error) return { data: data || [], error: null };
      lastError = error;
    } catch (err) {
      lastError = err;
    }

    const delayMs = 400 * 2 ** attempt;
    console.warn('[ZURI] Receipt sweep query retry', {
      attempt: attempt + 1,
      maxAttempts: SWEEP_QUERY_RETRIES,
      delayMs,
      cause: lastError?.message || String(lastError)
    });
    await sleep(delayMs);
  }

  return { data: [], error: lastError };
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
 */
async function sweepPendingOrderReceipts() {
  const supabase = getDb();
  const { data: orders, error } = await fetchPendingReceiptOrders(supabase);

  if (error) {
    console.error('[ZURI] Receipt sweep query failed', {
      reason: 'sweep_query_error',
      cause: error.message || String(error),
      retries: SWEEP_QUERY_RETRIES,
      severity: 'critical'
    });
    return { scanned: 0, enqueued: 0, skipped: 0, failed: true };
  }

  let enqueued = 0;
  let skipped = 0;
  let agedPending = 0;
  let permanentSkipped = 0;

  for (const order of orders || []) {
    const ageMs = Date.now() - Date.parse(order.created_at || '') || 0;
    const aged = ageMs >= AGED_ALERT_MS;

    // Permanent data defects (e.g. no order_items) — never re-enqueue.
    if (isPermanentReceiptError(order.receipt_email_error)) {
      skipped += 1;
      permanentSkipped += 1;
      if (aged && permanentSkipped <= 3) {
        console.log('[ZURI] Receipt sweep skipped permanent failure', {
          orderId: order.id,
          reason: 'permanent_receipt_error',
          receipt_email_error: order.receipt_email_error,
          receipt_send_attempts: Number(order.receipt_send_attempts) || 0,
          ageMs
        });
      }
      continue;
    }

    // Another worker is actively sending — do not stampede the queue.
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

    // Back off hot failures so we do not hammer Resend under traction spikes.
    const priorAttempts = Number(order.receipt_send_attempts) || 0;
    const delayMs =
      priorAttempts > 0
        ? Math.min(60_000, 1_000 * 2 ** Math.min(priorAttempts, 5))
        : 0;

    const result = enqueueOrderReceipt(
      { orderId: order.id, paidAt: null, reference: order.id },
      { attempt: 0, delayMs }
    );

    if (result?.queued) {
      enqueued += 1;
      const logFn = aged ? console.warn : console.log;
      logFn('[ZURI] Receipt sweep candidate queued', {
        orderId: order.id,
        reason: 'sweep_enqueued',
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
      agedPending,
      reason: 'sweep_complete'
    });
  }

  return { scanned: orders?.length || 0, enqueued, skipped, permanentSkipped, agedPending };
}

module.exports = {
  sweepPendingOrderReceipts,
  isPermanentReceiptError
};
