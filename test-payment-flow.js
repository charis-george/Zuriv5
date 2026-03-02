// Run from project root: node test-payment-flow.js
// Requires server running on port 3000

const BASE = 'http://localhost:3000';

async function run() {
  console.log('1. Login as demo business...');
  const loginRes = await fetch(`${BASE}/api/business/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@zuri.com', password: 'demo123' })
  });
  if (!loginRes.ok) {
    console.error('Login failed:', loginRes.status, await loginRes.text());
    process.exit(1);
  }
  const business = await loginRes.json();
  const businessId = business.id;
  console.log('   Business ID:', businessId);

  console.log('2. Get menu...');
  const menuRes = await fetch(`${BASE}/api/menu/business/${businessId}`);
  if (!menuRes.ok) {
    console.error('Menu failed:', menuRes.status);
    process.exit(1);
  }
  const menu = await menuRes.json();
  const firstItem = menu[0]?.items?.[0];
  if (!firstItem) {
    console.error('No menu items');
    process.exit(1);
  }
  console.log('   First item:', firstItem.name, '₦' + firstItem.price);

  console.log('3. Create order...');
  const orderRes = await fetch(`${BASE}/api/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      businessId,
      customerName: 'Test Customer',
      customerPhone: '+2348000000000',
      customerEmail: 'test@example.com',
      items: [{ menuItemId: firstItem.id, quantity: 1, price: firstItem.price }],
      estimatedPrepTime: 15
    })
  });
  if (!orderRes.ok) {
    console.error('Order failed:', orderRes.status, await orderRes.text());
    process.exit(1);
  }
  const order = await orderRes.json();
  const orderId = order.id;
  const totalAmount = order.total_amount ?? order.totalAmount;
  console.log('   Order ID:', orderId, 'Total: ₦' + totalAmount);

  console.log('4. Initialize payment (Paystack)...');
  const payRes = await fetch(`${BASE}/api/payment/initialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'test@example.com',
      amount: totalAmount,
      orderId,
      businessId,
      callbackUrl: `http://localhost:5173/payment-done?reference=${orderId}`,
      saveCard: false
    })
  });
  if (!payRes.ok) {
    console.error('Payment initialize failed:', payRes.status, await payRes.text());
    process.exit(1);
  }
  const payData = await payRes.json();
  if (payData.authorizationUrl) {
    console.log('   Success! Redirect URL:', payData.authorizationUrl);
    console.log('\n--- Full flow (order + payment init) works. ---');
    console.log('To complete payment in browser: open the order page, place order, click Pay, use Paystack test card 5060 6666 6666 6666 6666.');
  } else {
    console.error('   No authorizationUrl in response:', payData);
    process.exit(1);
  }

  console.log('\n5. Verify endpoint (optional): GET /api/payment/verify/' + orderId);
  const verifyRes = await fetch(`${BASE}/api/payment/verify/${orderId}`);
  const verifyData = await verifyRes.json();
  console.log('   Before payment:', verifyData.success ? 'paid' : 'pending (expected until user pays)');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
