const crypto = require('crypto');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const SECRET = process.env.MONNIFY_SECRET_KEY;
const WEBHOOK = 'https://zuriv5-production-e07b.up.railway.app/api/payment/monnify-webhook';
const REF = process.argv[2] || 'sub_a00000000000_1780739208342_056ff00e';

const event = {
  eventType: 'SUCCESSFUL_TRANSACTION',
  eventData: {
    paymentReference: REF,
    transactionReference: 'MNFY|95|20260606104649|000179',
    paymentStatus: 'PAID',
    amountPaid: 59900,
    totalPayable: 59900,
    metaData: {
      type: 'subscription',
      businessId: 'a0000000-0000-4000-8000-0000000000a1',
      plan: 'scale',
      interval: 'monthly'
    },
    customer: { name: 'Demo Kitchen (Zuri AI)', email: 'demo@zuri.com' }
  }
};

async function post(label, headers, body) {
  const res = await fetch(WEBHOOK, { method: 'POST', headers, body });
  const text = await res.text();
  console.log(`${label}: HTTP ${res.status} ${text}`);
}

async function main() {
  const body = JSON.stringify(event);
  const sig = crypto.createHmac('sha512', SECRET).update(body).digest('hex');
  await post('signed', { 'Content-Type': 'application/json', 'monnify-signature': sig }, body);
  await post('unsigned', { 'Content-Type': 'application/json' }, body);
  const legacy = crypto.createHash('sha512').update(`${SECRET}${body}`).digest('hex');
  await post('legacy-sig', { 'Content-Type': 'application/json', 'monnify-signature': legacy }, body);
}

main().catch(console.error);
