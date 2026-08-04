const { sendOrderReceiptOnce } = require('./orderReceiptEmail');
const { isPermanentResendError, isRetryableResendError } = require('./resendMail');

const MAX_ATTEMPTS = Math.max(3, Number(process.env.ORDER_RECEIPT_MAX_ATTEMPTS) || 8);
// Survival default: serialize receipt sends so free Supabase is not stampeded.
const CONCURRENCY = Math.max(1, Math.min(12, Number(process.env.ORDER_RECEIPT_EMAIL_CONCURRENCY) || 1));
const BASE_RETRY_MS = Math.max(500, Number(process.env.ORDER_RECEIPT_RETRY_BASE_MS) || 2000);
const MAX_RETRY_MS = Math.max(BASE_RETRY_MS, Number(process.env.ORDER_RECEIPT_RETRY_MAX_MS) || 120_000);
/** Extra patience while another worker / stale DB lock holds the send. */
const MAX_IN_FLIGHT_SOFT_RETRIES = Math.max(5, Number(process.env.ORDER_RECEIPT_IN_FLIGHT_SOFT_RETRIES) || 20);

/** @type {Array<{ args: object, attempt: number, runAt: number, softRetries?: number }>} */
const queue = [];
const queuedOrderIds = new Set();
const inFlightOrderIds = new Set();
/** Orders that already delivered a receipt in this process (avoids verify/webhook re-queue noise). */
const sentOrderIds = new Set();
let activeWorkers = 0;
let pumpScheduled = false;
let acceptingJobs = true;

function markReceiptSent(orderId) {
  if (!orderId) return;
  sentOrderIds.add(orderId);
  // Bound memory on long-lived processes
  if (sentOrderIds.size > 5000) {
    const drop = sentOrderIds.values().next().value;
    sentOrderIds.delete(drop);
  }
}

function retryDelayMs(attempt) {
  const exp = Math.min(MAX_RETRY_MS, BASE_RETRY_MS * 2 ** Math.max(0, attempt));
  const jitter = Math.floor(Math.random() * Math.min(1000, exp * 0.2));
  return exp + jitter;
}

function shouldRetryResult(result, attempt) {
  if (!result || result.ok) return false;
  if (result.permanent) return false;
  if (result.reason === 'already_sent') return false;
  if (result.reason === 'no_recipients') return false;
  if (result.reason === 'missing_resend_key') return false;
  if (result.reason === 'no_tickets') return false;
  if (result.reason === 'business_not_found') return false;
  if (result.reason === 'order_not_found') return false;
  if (result.reason === 'no_customer_email') return false;
  if (attempt >= MAX_ATTEMPTS) return false;
  return Boolean(result.retryable);
}

function shouldRetryError(err, attempt) {
  if (attempt >= MAX_ATTEMPTS) return false;
  if (isPermanentResendError(err)) return false;
  return isRetryableResendError(err);
}

function schedulePump() {
  if (pumpScheduled) return;
  pumpScheduled = true;
  setImmediate(() => {
    pumpScheduled = false;
    void drainQueue();
  });
}

/**
 * @returns {{ queued: boolean, reason: string, orderId?: string, attempt?: number, delayMs?: number }}
 */
function enqueueOrderReceipt(args, opts = {}) {
  const orderId = args?.orderId;
  if (!orderId) {
    console.warn('[ZURI] Receipt email enqueue skipped', {
      reason: 'missing_order_id',
      cause: 'queueOrderReceiptOnce was called without an orderId'
    });
    return { queued: false, reason: 'missing_order_id' };
  }

  if (!acceptingJobs && !(Number(opts.attempt) > 0 || Number(opts.softRetries) > 0)) {
    // During shutdown, still allow retries of in-flight work; new paid orders rely on sweep after boot.
    return { queued: false, reason: 'shutting_down', orderId };
  }

  if (sentOrderIds.has(orderId)) {
    return { queued: false, reason: 'already_sent', orderId };
  }

  if (inFlightOrderIds.has(orderId)) {
    return { queued: false, reason: 'already_in_flight', orderId };
  }

  if (queuedOrderIds.has(orderId)) {
    return { queued: false, reason: 'already_queued', orderId };
  }

  const attempt = Number(opts.attempt) || 0;
  const softRetries = Number(opts.softRetries) || 0;
  const delayMs = Math.max(0, Number(opts.delayMs) || 0);
  const runAt = Date.now() + delayMs;
  const markSentOnly = Boolean(opts.markSentOnly);

  queuedOrderIds.add(orderId);
  queue.push({ args, attempt, runAt, softRetries, markSentOnly });

  if (attempt === 0 && softRetries === 0 && delayMs === 0 && !markSentOnly) {
    console.log('[ZURI] Receipt email queued', { orderId, reason: 'enqueued', attempt, delayMs });
  }

  if (delayMs > 0) {
    setTimeout(schedulePump, delayMs + 10);
  } else {
    schedulePump();
  }

  return { queued: true, reason: 'enqueued', orderId, attempt, delayMs };
}

async function drainQueue() {
  while (activeWorkers < CONCURRENCY && queue.length > 0) {
    const now = Date.now();
    const nextIdx = queue.findIndex((job) => job.runAt <= now);
    if (nextIdx < 0) {
      const soonest = Math.min(...queue.map((job) => job.runAt));
      const waitMs = Math.max(50, soonest - now);
      setTimeout(schedulePump, waitMs);
      break;
    }

    const [job] = queue.splice(nextIdx, 1);
    const orderId = job.args?.orderId;
    if (!orderId) {
      console.warn('[ZURI] Receipt email job dropped', {
        reason: 'missing_order_id',
        cause: 'queued job had no orderId'
      });
      continue;
    }

    queuedOrderIds.delete(orderId);
    if (inFlightOrderIds.has(orderId)) {
      console.log('[ZURI] Receipt email job skipped', {
        orderId,
        reason: 'already_in_flight',
        cause: 'another worker claimed this order between dequeue and start'
      });
      continue;
    }

    inFlightOrderIds.add(orderId);
    activeWorkers += 1;

    void processJob(job).finally(() => {
      inFlightOrderIds.delete(orderId);
      activeWorkers -= 1;
      schedulePump();
    });
  }
}

async function processJob(job) {
  const orderId = job.args?.orderId;
  try {
    // Email already accepted by Resend — only finish the DB mark, never resend.
    if (job.markSentOnly) {
      const { forceMarkReceiptSent } = require('./orderReceiptEmail');
      const marked = await forceMarkReceiptSent(orderId);
      if (marked.ok) {
        markReceiptSent(orderId);
        console.log('[ZURI] Receipt mark-sent recovered', {
          orderId,
          reason: 'mark_sent_recovered'
        });
        return;
      }
      if (job.attempt < MAX_ATTEMPTS) {
        const delayMs = retryDelayMs(job.attempt);
        console.warn('[ZURI] Receipt mark-sent retry scheduled', {
          orderId,
          attempt: job.attempt + 1,
          maxAttempts: MAX_ATTEMPTS,
          delayMs
        });
        enqueueOrderReceipt(job.args, {
          attempt: job.attempt + 1,
          delayMs,
          markSentOnly: true
        });
      } else {
        console.error('[ZURI] Receipt mark-sent giving up', {
          orderId,
          reason: 'mark_sent_exhausted',
          severity: 'critical_needs_sweep',
          cause: marked.error?.message || 'could not persist receipt_sent_at'
        });
      }
      return;
    }

    const result = await sendOrderReceiptOnce(job.args);
    if (result?.ok) {
      markReceiptSent(orderId);
      return;
    }
    if (result?.reason === 'already_sent') {
      markReceiptSent(orderId);
      return;
    }

    if (result?.reason === 'mark_sent_failed') {
      const delayMs = Math.min(10_000, BASE_RETRY_MS);
      console.warn('[ZURI] Receipt email delivered — scheduling mark-sent only', {
        orderId,
        reason: 'mark_sent_failed',
        cause: result.cause,
        delayMs
      });
      enqueueOrderReceipt(job.args, {
        attempt: job.attempt,
        delayMs,
        markSentOnly: true
      });
      return;
    }

    // Lock contention / deploy overlap: wait without burning hard attempts as fast.
    if (result?.reason === 'in_flight') {
      const soft = Number(job.softRetries) || 0;
      if (soft < MAX_IN_FLIGHT_SOFT_RETRIES) {
        const delayMs = Math.min(30_000, 3_000 + soft * 1_500);
        console.warn('[ZURI] Receipt email waiting on lock', {
          orderId,
          softRetry: soft + 1,
          maxSoftRetries: MAX_IN_FLIGHT_SOFT_RETRIES,
          reason: 'in_flight',
          cause: result.cause || result.reason,
          delayMs
        });
        enqueueOrderReceipt(job.args, {
          attempt: job.attempt,
          softRetries: soft + 1,
          delayMs
        });
        return;
      }
      console.warn('[ZURI] Receipt email lock wait exhausted — sweep will retry', {
        orderId,
        reason: 'in_flight_soft_exhausted',
        cause: result.cause || result.reason,
        softRetries: soft
      });
      return;
    }

    if (shouldRetryResult(result, job.attempt)) {
      const delayMs = retryDelayMs(job.attempt);
      console.warn('[ZURI] Receipt email retry scheduled', {
        orderId,
        attempt: job.attempt + 1,
        maxAttempts: MAX_ATTEMPTS,
        reason: result.reason,
        cause: result.cause || result.reason,
        retryable: true,
        delayMs
      });
      enqueueOrderReceipt(job.args, { attempt: job.attempt + 1, delayMs });
      return;
    }
    if (result && !result.ok && result.skipped) {
      const level = result.retryable ? 'error' : 'warn';
      console[level]('[ZURI] Receipt email skipped (not retrying)', {
        orderId,
        attempt: job.attempt,
        maxAttempts: MAX_ATTEMPTS,
        reason: result.reason,
        cause: result.cause || result.reason,
        retryable: Boolean(result.retryable),
        willRetry: false,
        severity: result.retryable ? 'critical_needs_sweep' : 'terminal'
      });
    }
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    const code = err && err.code ? err.code : undefined;
    if (shouldRetryError(err, job.attempt)) {
      const delayMs = retryDelayMs(job.attempt);
      console.warn('[ZURI] Receipt email failed — retry scheduled', {
        orderId,
        attempt: job.attempt + 1,
        maxAttempts: MAX_ATTEMPTS,
        reason: 'send_error',
        cause: message,
        code,
        retryable: true,
        delayMs
      });
      enqueueOrderReceipt(job.args, { attempt: job.attempt + 1, delayMs });
      return;
    }
    console.error('[ZURI] Receipt email failed (giving up)', {
      orderId,
      attempt: job.attempt,
      maxAttempts: MAX_ATTEMPTS,
      reason: 'send_error',
      cause: message,
      code,
      retryable: false,
      severity: 'critical_needs_sweep',
      note: 'periodic receipt sweep will keep trying until receipt_sent_at is set'
    });
  }
}

function queueOrderReceiptOnce(args) {
  return enqueueOrderReceipt(args, { attempt: 0, delayMs: 0 });
}

function getReceiptQueueStats() {
  return {
    queued: queue.length,
    activeWorkers,
    acceptingJobs,
    concurrency: CONCURRENCY
  };
}

/**
 * Stop accepting brand-new jobs and wait for in-flight sends to finish
 * so deploy SIGTERM does not strand a delivered email without receipt_sent_at.
 */
async function drainOrderReceiptQueueForShutdown(timeoutMs = 15_000) {
  acceptingJobs = false;
  const deadline = Date.now() + Math.max(1_000, timeoutMs);
  schedulePump();
  while (activeWorkers > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  const stats = getReceiptQueueStats();
  console.log('[ZURI] Receipt queue shutdown drain', {
    ...stats,
    drained: activeWorkers === 0,
    reason: activeWorkers === 0 ? 'in_flight_complete' : 'timeout'
  });
  return stats;
}

module.exports = {
  queueOrderReceiptOnce,
  enqueueOrderReceipt,
  drainQueue,
  drainOrderReceiptQueueForShutdown,
  getReceiptQueueStats,
  markReceiptSent,
  CONCURRENCY,
  MAX_ATTEMPTS
};
