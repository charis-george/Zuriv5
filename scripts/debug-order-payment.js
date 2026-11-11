require('dotenv').config({ path: require('path').join(__dirname, '../server/.env') });
const Paystack = require('@paystack/paystack-sdk');

const orderId = process.argv[2] || '3ea4966a-17ad-4f40-ac34-c506f462ac76';
const appPaystack = process.env.PAYSTACK_SECRET_KEY
  ? new Paystack(process.env.PAYSTACK_SECRET_KEY)
  : null;

async function main() {
  if (!appPaystack) {
    console.error('No PAYSTACK_SECRET_KEY');
    process.exit(1);
  }
  console.log('Verifying Paystack reference:', orderId);
  try {
    const response = await appPaystack.transaction.verify({ reference: orderId });
    console.log('status:', response?.status);
    console.log('data:', JSON.stringify(response?.data, null, 2));
  } catch (e) {
    console.error('verify error:', e?.message || e);
  }
}

main();
