/**
 * Stress-check: 100 concurrent receipt enqueues must all complete under the worker pool.
 * Run: node server/scripts/stressReceiptQueue.js
 *
 * Mocks sendOrderReceiptOnce so we validate queue concurrency / drain, not Resend/DB.
 */
const emailPath = require.resolve('../lib/orderReceiptEmail');
const sent = new Set();
const started = new Set();
let inFlightPeak = 0;
let currentInFlight = 0;

require.cache[emailPath] = {
  id: emailPath,
  filename: emailPath,
  loaded: true,
  exports: {
    sendOrderReceiptOnce: async ({ orderId }) => {
      started.add(orderId);
      currentInFlight += 1;
      inFlightPeak = Math.max(inFlightPeak, currentInFlight);
      // Simulate QR mint + Resend (~80–200ms)
      await new Promise((r) => setTimeout(r, 80 + Math.floor(Math.random() * 120)));
      currentInFlight -= 1;
      sent.add(orderId);
      return { ok: true, reason: 'sent' };
    },
    forceMarkReceiptSent: async () => ({ ok: true })
  }
};

const {
  queueOrderReceiptOnce,
  getReceiptQueueStats,
  CONCURRENCY
} = require('../lib/orderReceiptQueue');

async function main() {
  const N = 100;
  const t0 = Date.now();
  for (let i = 0; i < N; i += 1) {
    queueOrderReceiptOnce({ orderId: `order-${i}`, reference: `ref-${i}` });
  }

  const deadline = Date.now() + 60_000;
  while (sent.size < N && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
  }

  const elapsed = Date.now() - t0;
  const stats = getReceiptQueueStats();
  const ok = sent.size === N && started.size === N;
  console.log(
    JSON.stringify(
      {
        ok,
        expected: N,
        sent: sent.size,
        started: started.size,
        elapsedMs: elapsed,
        concurrency: CONCURRENCY,
        inFlightPeak,
        queueStats: stats
      },
      null,
      2
    )
  );
  if (!ok) process.exit(1);
  if (inFlightPeak > CONCURRENCY) {
    console.error('inFlightPeak exceeded CONCURRENCY');
    process.exit(1);
  }
  console.log(`[ok] ${N}/${N} receipts processed in ${elapsed}ms (peak parallel ${inFlightPeak})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
