/**
 * Fixture tests for payment SMS parsers.
 * Run: node scripts/test-payment-agent-parsers.js
 */
const assert = require('assert');
const path = require('path');

const { parsePaymentSms } = require(path.join(
  __dirname,
  '..',
  'server',
  'lib',
  'paymentAgent',
  'parsers'
));

const receivedAt = new Date('2026-07-30T14:00:00Z');

function run() {
  const moniePos = parsePaymentSms(
    'You have received NGN 4,500.00 from ADEOLA BAKARE on your POS Terminal. 30/07/2026 14:22',
    receivedAt
  );
  assert.strictEqual(moniePos.bank_or_provider, 'moniepoint');
  assert.strictEqual(moniePos.amount, 4500);
  assert.strictEqual(moniePos.channel, 'pos');
  assert.ok(moniePos.sender_name && /ADEOLA/i.test(moniePos.sender_name));
  assert.strictEqual(moniePos.parse_errors, null);

  const monieTf = parsePaymentSms(
    'NGN 2,000.00 credited to your Moniepoint account from CHINEDU OKAFOR via transfer.',
    receivedAt
  );
  assert.strictEqual(monieTf.bank_or_provider, 'moniepoint');
  assert.strictEqual(monieTf.amount, 2000);
  assert.ok(monieTf.sender_name && /CHINEDU/i.test(monieTf.sender_name));

  const opay = parsePaymentSms(
    'Payment of NGN 3,200.00 received from FATIMA BELLO. Ref: OPAY123. 30/07/2026 13:10',
    receivedAt
  );
  assert.strictEqual(opay.bank_or_provider, 'opay');
  assert.strictEqual(opay.amount, 3200);
  assert.ok(opay.sender_name && /FATIMA/i.test(opay.sender_name));

  const opay2 = parsePaymentSms(
    'You received NGN 1,500.00 via OPay from JOHN DOE to your account.',
    receivedAt
  );
  assert.strictEqual(opay2.bank_or_provider, 'opay');
  assert.strictEqual(opay2.amount, 1500);

  const generic = parsePaymentSms('Alert: ₦9,999.00 credited. Ref XYZ.', receivedAt);
  assert.strictEqual(generic.bank_or_provider, 'unknown');
  assert.strictEqual(generic.amount, 9999);

  const fail = parsePaymentSms('Hello from your bank, no amount here', receivedAt);
  assert.strictEqual(fail.amount, null);
  assert.ok(fail.parse_errors);

  console.log('OK: payment agent parsers');
}

run();
