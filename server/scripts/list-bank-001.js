/**
 * One-off script: list Paystack Nigeria banks and find bank code 001.
 * Run from repo root: node server/scripts/list-bank-001.js
 * Requires PAYSTACK_SECRET_KEY in server/.env (or .env in cwd).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE = 'https://api.paystack.co';

async function main() {
  if (!PAYSTACK_SECRET) {
    console.error('Set PAYSTACK_SECRET_KEY in server/.env');
    process.exit(1);
  }
  const res = await fetch(`${PAYSTACK_BASE}/bank?country=nigeria&perPage=200`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` }
  });
  const data = await res.json();
  if (!data.status || !Array.isArray(data.data)) {
    console.error('Paystack response:', data.message || data);
    process.exit(1);
  }
  const code001 = data.data.find((b) => String(b.code) === '001');
  const codes001x = data.data.filter((b) => String(b.code).startsWith('001'));
  if (code001) {
    console.log('Bank with code 001:', code001.name, '| code:', code001.code);
  } else if (codes001x.length) {
    console.log('No exact code "001". Banks starting with 001:');
    codes001x.forEach((b) => console.log('  ', b.code, b.name));
  } else {
    console.log('No bank with code 001 in this list. All codes:', data.data.map((b) => b.code).sort().join(', '));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
