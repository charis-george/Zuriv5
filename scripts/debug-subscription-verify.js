/**
 * Debug Paystack subscription verify/recover — run: node scripts/debug-subscription-verify.js [reference]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../server/.env') });
const Paystack = require('@paystack/paystack-sdk');
const { normalizeMetadata, activateSubscriptionFromCharge } = require('../server/lib/subscriptionActivate');

const appPaystack = process.env.PAYSTACK_SECRET_KEY
  ? new Paystack(process.env.PAYSTACK_SECRET_KEY)
  : null;

async function main() {
  if (!appPaystack) {
    console.error('No PAYSTACK_SECRET_KEY');
    process.exit(1);
  }

  const refArg = process.argv[2];

  console.log('--- List recent successful transactions ---');
  try {
    const listRes = await appPaystack.transaction.list({ perPage: 20, status: 'success' });
    console.log('list status:', listRes?.status);
    const rows = Array.isArray(listRes?.data) ? listRes.data : (listRes?.data?.data || []);
    console.log('row count:', rows.length);
    const subs = rows.filter((tx) => String(tx?.reference || '').startsWith('sub_'));
    console.log('sub_ count:', subs.length);
    for (const tx of subs.slice(0, 5)) {
      console.log('\nTX:', {
        reference: tx.reference,
        status: tx.status,
        amount: tx.amount,
        paid_at: tx.paid_at,
        metadata: tx.metadata,
        plan: tx.plan,
        customer: tx.customer?.email
      });
    }
  } catch (err) {
    console.error('list error:', err?.message || err);
  }

  const refs = refArg
    ? [refArg]
    : (await (async () => {
        const listRes = await appPaystack.transaction.list({ perPage: 20, status: 'success' });
        const rows = Array.isArray(listRes?.data) ? listRes.data : (listRes?.data?.data || []);
        return rows
          .filter((tx) => String(tx?.reference || '').startsWith('sub_'))
          .map((tx) => tx.reference)
          .slice(0, 3);
      })());

  for (const reference of refs) {
    console.log('\n--- Verify:', reference, '---');
    try {
      const response = await appPaystack.transaction.verify({ reference });
      console.log('verify status:', response?.status);
      const charge = response?.data;
      if (!charge) {
        console.log('no data');
        continue;
      }
      console.log('charge:', {
        reference: charge.reference,
        status: charge.status,
        amount: charge.amount,
        metadata: charge.metadata,
        plan: charge.plan,
        subscription: charge.subscription
      });
      const meta = normalizeMetadata(charge.metadata);
      console.log('normalized meta:', meta);
      const result = await activateSubscriptionFromCharge(charge);
      console.log('activate result:', result);
    } catch (err) {
      console.error('verify error:', err?.message || err);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
