/**
 * Fixture tests for scoreMatch / decideMatchOutcome.
 * Run: node scripts/test-payment-agent-match.js
 */
const assert = require('assert');
const path = require('path');

const {
  scoreMatch,
  decideMatchOutcome,
  AUTO_THRESHOLD
} = require(path.join(__dirname, '..', 'server', 'lib', 'paymentAgent', 'scoreMatch'));

const baseOrder = {
  id: 'ord-1',
  total_amount: 4500,
  created_at: '2026-07-30T14:20:00Z',
  customer_name: 'Adeola Bakare'
};

const baseAlert = {
  parsed_amount: 4500,
  alert_timestamp: '2026-07-30T14:22:00Z',
  parsed_sender_name: 'ADEOLA BAKARE',
  parsed_bank_or_provider: 'moniepoint'
};

function run() {
  const exact = scoreMatch(baseAlert, baseOrder, { matchWindowMinutes: 20 });
  assert.ok(exact.score >= AUTO_THRESHOLD, `expected high score, got ${exact.score}`);
  assert.ok(!exact.flags.partial && !exact.flags.overpayment);

  const partial = scoreMatch(
    { ...baseAlert, parsed_amount: 2000 },
    baseOrder,
    { matchWindowMinutes: 20 }
  );
  assert.ok(partial.flags.partial);
  assert.ok(partial.score < AUTO_THRESHOLD);

  const over = scoreMatch(
    { ...baseAlert, parsed_amount: 9000 },
    baseOrder,
    { matchWindowMinutes: 20 }
  );
  assert.ok(over.flags.overpayment);

  const stale = scoreMatch(
    { ...baseAlert, alert_timestamp: '2026-07-30T18:00:00Z' },
    baseOrder,
    { matchWindowMinutes: 20 }
  );
  assert.ok(stale.flags.outsideWindow);

  const a = { order: baseOrder, ...scoreMatch(baseAlert, baseOrder, { matchWindowMinutes: 20 }) };
  const auto = decideMatchOutcome([a]);
  assert.strictEqual(auto.decision, 'auto_matched');

  const order2 = { ...baseOrder, id: 'ord-2', customer_name: 'Someone Else' };
  const b = {
    order: order2,
    ...scoreMatch(
      { ...baseAlert, parsed_sender_name: null },
      order2,
      { matchWindowMinutes: 20 }
    )
  };
  // Force both high + close scores for tie
  const tie = decideMatchOutcome([
    { order: baseOrder, score: 0.9, reasons: [], flags: {} },
    { order: order2, score: 0.88, reasons: [], flags: {} }
  ]);
  assert.strictEqual(tie.decision, 'pending_review');
  assert.strictEqual(tie.reviewReason, 'ambiguous_tie');

  const none = decideMatchOutcome([
    { order: baseOrder, score: 0.5, reasons: [], flags: { outsideWindow: true } }
  ]);
  assert.strictEqual(none.decision, 'unmatchable');

  const generic = scoreMatch(
    { ...baseAlert, parsed_bank_or_provider: 'unknown', parsed_sender_name: null },
    { ...baseOrder, customer_name: null },
    { matchWindowMinutes: 20 }
  );
  assert.ok(generic.score <= 0.85);

  void b;
  console.log('OK: payment agent scoreMatch');
}

run();
