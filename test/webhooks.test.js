const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { decideSettlement } = require('../server/lib/webhookSettlement');
const { verifyPaystackSignature } = require('../server/lib/paystackWebhook');

function applyWebhook(order, amountPaid) {
  const decision = decideSettlement(order, amountPaid);
  if (decision.action === 'finalize') {
    order.payment_status = 'paid';
    order.settled = (order.settled || 0) + 1;
  }
  return decision;
}

test('Paystack signatures reject missing, forged, and valid bodies', () => {
  const secret = 'sk_test_portfolio';
  const body = Buffer.from(JSON.stringify({ event: 'charge.success', data: { amount: 450000 } }));

  const missing = verifyPaystackSignature(body, '', secret);
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 400);

  const forged = verifyPaystackSignature(body, 'deadbeef', secret);
  assert.equal(forged.ok, false);
  assert.equal(forged.status, 401);

  const signature = crypto.createHmac('sha512', secret).update(body).digest('hex');
  const ok = verifyPaystackSignature(body, signature, secret);
  assert.equal(ok.ok, true);
  assert.equal(ok.event.event, 'charge.success');

  const badBody = Buffer.from('{');
  const badSignature = crypto.createHmac('sha512', secret).update(badBody).digest('hex');
  const junk = verifyPaystackSignature(badBody, badSignature, secret);
  assert.equal(junk.ok, false);
  assert.equal(junk.status, 400);
});

test('a repeated payment webhook does not settle the order twice', () => {
  const order = {
    id: 'order-1',
    payment_status: 'pending',
    total_amount: 4500,
    receipt_sent_at: null,
    settled: 0
  };

  const first = applyWebhook(order, 4500);
  assert.equal(first.action, 'finalize');
  assert.equal(order.settled, 1);
  assert.equal(order.payment_status, 'paid');

  const replay = applyWebhook(order, 4500);
  assert.equal(replay.action, 'retry_receipt');
  assert.equal(order.settled, 1);

  order.receipt_sent_at = '2026-11-11T12:00:00.000Z';
  const afterReceipt = applyWebhook(order, 4500);
  assert.equal(afterReceipt.action, 'already_complete');
  assert.equal(order.settled, 1);
});

test('underpaid webhooks are ignored and do not mark the order paid', () => {
  const order = { payment_status: 'pending', total_amount: 10000, receipt_sent_at: null };
  const decision = applyWebhook(order, 100);
  assert.equal(decision.action, 'amount_mismatch');
  assert.equal(order.payment_status, 'pending');
  assert.equal(decideSettlement(null, 100).action, 'ignore');
});

test('a gateway fee on top of the order total can still settle', () => {
  const order = { payment_status: 'pending', total_amount: 4000, receipt_sent_at: null };
  const decision = applyWebhook(order, 4100);
  assert.equal(decision.action, 'finalize');
  assert.equal(order.payment_status, 'paid');
});
