/**
 * End-to-end Monnify sandbox diagnostic:
 * 1) Auth + init-transaction (Scale monthly)
 * 2) Webhook signature round-trip
 * 3) POST webhook to local server
 */
const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const API_KEY = process.env.MONNIFY_API_KEY;
const SECRET = process.env.MONNIFY_SECRET_KEY;
const CONTRACT = process.env.MONNIFY_CONTRACT_CODE;
const BASE = (process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com').replace(/\/$/, '');
const WEBHOOK = process.env.MONNIFY_WEBHOOK_TEST_URL || 'http://localhost:3001/api/payment/monnify-webhook';

function hmac(body) {
  return crypto.createHmac('sha512', SECRET).update(body).digest('hex');
}

async function login() {
  const basic = Buffer.from(`${API_KEY}:${SECRET}`).toString('base64');
  const res = await fetch(`${BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/json' }
  });
  const data = await res.json();
  if (!data?.responseBody?.accessToken) {
    throw new Error(`Auth failed: ${data?.responseMessage || res.status}`);
  }
  return data.responseBody.accessToken;
}

async function initTransaction(token, ref) {
  const payload = {
    amount: 59900,
    customerName: 'Zuri Tech',
    customerEmail: 'demo@zuri.com',
    paymentReference: ref,
    paymentDescription: 'ZURI scale subscription',
    currencyCode: 'NGN',
    contractCode: CONTRACT,
    redirectUrl: 'http://localhost:5173/upgrade-done?reference=' + encodeURIComponent(ref),
    metaData: {
      type: 'subscription',
      businessId: 'test-business-id',
      plan: 'scale',
      interval: 'monthly'
    }
  };
  const res = await fetch(`${BASE}/api/v1/merchant/transactions/init-transaction`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function postWebhook(bodyObj) {
  const body = JSON.stringify(bodyObj);
  const sig = hmac(body);
  const res = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'monnify-signature': sig },
    body
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  console.log('=== Monnify checkout diagnostic ===');
  console.log('BASE_URL:', BASE);
  console.log('API_KEY prefix:', (API_KEY || '').slice(0, 12));
  console.log('WEBHOOK:', WEBHOOK);

  const token = await login();
  console.log('Auth: OK');

  const ref = `sub_test_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
  const init = await initTransaction(token, ref);
  console.log('\n--- init-transaction ---');
  console.log('HTTP', init.status);
  console.log('requestSuccessful:', init.data?.requestSuccessful);
  console.log('message:', init.data?.responseMessage);
  const body = init.data?.responseBody;
  if (body) {
    console.log('paymentReference:', body.paymentReference);
    console.log('transactionReference:', body.transactionReference);
    console.log('checkoutUrl:', body.checkoutUrl ? body.checkoutUrl.slice(0, 80) + '...' : null);
  }
  if (!init.data?.requestSuccessful) {
    process.exit(1);
  }

  const sampleEvent = {
    eventType: 'SUCCESSFUL_TRANSACTION',
    eventData: {
      paymentReference: ref,
      transactionReference: body.transactionReference,
      paymentStatus: 'PAID',
      amountPaid: 59900,
      totalPayable: 59900,
      metaData: {
        type: 'subscription',
        businessId: 'test-business-id',
        plan: 'scale',
        interval: 'monthly'
      },
      customer: { name: 'Zuri Tech', email: 'demo@zuri.com' }
    }
  };

  console.log('\n--- webhook POST (signed) ---');
  const wh = await postWebhook(sampleEvent);
  console.log('HTTP', wh.status, wh.text);

  console.log('\n--- webhook POST (unsigned) ---');
  const body2 = JSON.stringify(sampleEvent);
  const wh2 = await fetch(WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body2
  });
  console.log('HTTP', wh2.status, await wh2.text());

  console.log('\n--- webhook GET health ---');
  const health = await fetch(WEBHOOK);
  console.log('HTTP', health.status, await health.text());
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
