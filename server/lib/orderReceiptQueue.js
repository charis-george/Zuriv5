const { sendOrderReceiptOnce } = require('./orderReceiptEmail');
const { isPermanentResendError, isRetryableResendError } = require('./resendMail');

const MAX_ATTEMPTS = Math.max(3, Number(process.env.ORDER_RECEIPT_MAX_ATTEMPTS) || 12);
/**
 * Resend allows ~10 req/s. Default 8 parallel ticket emails so a venue burst
 * of 100 buyers clears in seconds — not minutes (old default was 2).
 */
const CONCURRENCY = Math.max(1, Math.min(15, Number(process.env.ORDER_RECEIPT_EMAIL_CONCURRENCY) || 8));
const BASE_RETRY_MS = Math.max(250, Number(process.env.ORDER_RECEIPT_RETRY_BASE_MS) || 800);
const MAX_RETRY_MS = Math.max(BASE_RETRY_MS, Number(process.env.ORDER_RECEIPT_RETRY_MAX_MS) || 45_000);
/** Extra patience while another worker / stale DB lock holds the send. */
const MAX_IN_FLIGHT_SOFT_RETRIES = Math.max(5, Number(process.env.ORDER_RECEIPT_IN_FLIGHT_SOFT_RETRIES) || 40);

/** @type {Array<{ args: object, attempt: number, runAt: number, softRetries?: number, markSentOnly?: boolean, priority?: boolean }>} */
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
  const jitter = Math.floor(Math.random() * Math.min(800, exp * 0.25));
  return exp + jitter;
}

function shouldRetryResult(result, attempt) {
  if (!result || result.ok) return false;
  if (result.permanent) return false;
  if (result.reason === 'already_sent') return false;
  if (result.reason === 'no_recipients') return false;
  if (result.reason === 'no_customer_email') return false;
  // no_tickets stays retryable until sendOrderReceiptOnce marks it permanent.
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

/** Fill every free worker slot immediately (venue burst). */
function kickWorkersHard() {
  schedulePump();
  // Second tick catches jobs that landed while first drain was starting.
  setImmediate(schedulePump);
}

function findNextRunnableIndex(now) {
  let priorityIdx = -1;
  let normalIdx = -1;
  for (let i = 0; i < queue.length; i += 1) {
    const job = queue[i];
    if (job.runAt > now) continue;
    if (job.priority && priorityIdx < 0) priorityIdx = i;
    else if (!job.priority && normalIdx < 0) normalIdx = i;
    if (priorityIdx >= 0) break;
  }
  return priorityIdx >= 0 ? priorityIdx : normalIdx;
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
  // Payment success path always priority so venue buys jump ahead of sweep retries.
  const priority = opts.priority !== false && attempt === 0 && softRetries === 0 && !markSentOnly;

  queuedOrderIds.add(orderId);
  const job = { args, attempt, runAt, softRetries, markSentOnly, priority };
  if (priority && delayMs === 0) {
    queue.unshift(job);
  } else {
    queue.push(job);
  }

  if (attempt === 0 && softRetries === 0 && delayMs === 0 && !markSentOnly) {
    console.log('[ZURI] Receipt email queued', {
      orderId,
      reason: 'enqueued',
      attempt,
      delayMs,
      priority,
      concurrency: CONCURRENCY,
      queuedDepth: queue.length
    });
  }

  if (delayMs > 0) {
    setTimeout(kickWorkersHard, delayMs + 5);
  } else {
    kickWorkersHard();
  }

  return { queued: true, reason: 'enqueued', orderId, attempt, delayMs };
}

async function drainQueue() {
  while (activeWorkers < CONCURRENCY && queue.length > 0) {
    const now = Date.now();
    const nextIdx = findNextRunnableIndex(now);
    if (nextIdx < 0) {
      const soonest = Math.min(...queue.map((job) => job.runAt));
      const waitMs = Math.max(25, soonest - now);
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

    if (inFlightOrderIds.has(orderId)) {
      queuedOrderIds.delete(orderId);
      console.log('[ZURI] Receipt email job requeued after in-flight race', {
        orderId,
        reason: 'already_in_flight',
        cause: 'another worker claimed this order between dequeue and start'
      });
      enqueueOrderReceipt(job.args, {
        attempt: job.attempt,
        softRetries: (Number(job.softRetries) || 0) + 1,
        delayMs: 800,
        priority: true,
        markSentOnly: Boolean(job.markSentOnly)
      });
      continue;
    }

    // Claim in-flight before clearing queued — prevents a second enqueue from
    // slipping in and then being dropped with no retry.
    inFlightOrderIds.add(orderId);
    queuedOrderIds.delete(orderId);
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
          markSentOnly: true,
          priority: false
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
      const delayMs = Math.min(3_000, BASE_RETRY_MS);
      console.warn('[ZURI] Receipt email delivered — scheduling mark-sent only', {
        orderId,
        reason: 'mark_sent_failed',
        cause: result.cause,
        delayMs
      });
      enqueueOrderReceipt(job.args, {
        attempt: job.attempt,
        delayMs,
        markSentOnly: true,
        priority: true
      });
      return;
    }

    // Lock contention / deploy overlap: wait briefly without burning hard attempts.
    if (result?.reason === 'in_flight') {
      const soft = Number(job.softRetries) || 0;
      if (soft < MAX_IN_FLIGHT_SOFT_RETRIES) {
        const delayMs = Math.min(8_000, 600 + soft * 400);
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
          delayMs,
          priority: true
        });
        return;
      }
      console.warn('[ZURI] Receipt email lock wait exhausted — requeue after lock TTL', {
        orderId,
        reason: 'in_flight_soft_exhausted',
        cause: result.cause || result.reason,
        softRetries: soft
      });
      // Do not rely on sweep alone — schedule another try after the DB lock can go stale.
      const lockStaleMs = Math.max(
        60_000,
        Number(process.env.ORDER_RECEIPT_LOCK_STALE_MS) || 10 * 60_000
      );
      enqueueOrderReceipt(job.args, {
        attempt: job.attempt,
        softRetries: 0,
        delayMs: Math.min(lockStaleMs + 1_000, 11 * 60_000),
        priority: true
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
      enqueueOrderReceipt(job.args, { attempt: job.attempt + 1, delayMs, priority: true });
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
      enqueueOrderReceipt(job.args, { attempt: job.attempt + 1, delayMs, priority: true });
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

/** Payment / verify hot path — priority, zero delay, immediate worker kick. */
function queueOrderReceiptOnce(args) {
  return enqueueOrderReceipt(args, { attempt: 0, delayMs: 0, priority: true });
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
async function drainOrderReceiptQueueForShutdown(timeoutMs = 25_000) {
  acceptingJobs = false;
  const deadline = Date.now() + Math.max(1_000, timeoutMs);
  kickWorkersHard();
  while ((activeWorkers > 0 || queue.some((j) => j.runAt <= Date.now())) && Date.now() < deadline) {
    schedulePump();
    await new Promise((r) => setTimeout(r, 80));
  }
  const stats = getReceiptQueueStats();
  console.log('[ZURI] Receipt queue shutdown drain', {
    ...stats,
    drained: activeWorkers === 0 && queue.length === 0,
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
  kickWorkersHard,
  CONCURRENCY,
  MAX_ATTEMPTS
};
