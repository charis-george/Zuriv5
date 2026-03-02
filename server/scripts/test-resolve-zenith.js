/**
 * Test Paystack resolve: Zenith Bank 057, account 0000000000.
 * Run from repo root: node server/scripts/test-resolve-zenith.js
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE = 'https://api.paystack.co';
const BANK_CODE = '057';
const ACCOUNT_NUMBER = '0000000000';

async function main() {
  if (!PAYSTACK_SECRET) {
    console.error('Set PAYSTACK_SECRET_KEY in server/.env');
    process.exit(1);
  }
  const url = `${PAYSTACK_BASE}/bank/resolve?account_number=${ACCOUNT_NUMBER}&bank_code=${BANK_CODE}`;
  console.log('GET', url);
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }
  });
  const data = await res.json();
  console.log('Status:', data.status);
  console.log('Message:', data.message);
  if (data.data) {
    console.log('Account name:', data.data.account_name);
    console.log('Account number:', data.data.account_number);
  }
  if (!data.status) {
    process.exit(1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
