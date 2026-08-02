/**
 * Inspect recent ticket orders and receipt email status.
 * node scripts/debug-ticket-receipt.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../server/.env') });
const { getDb } = require('../server/database');
const { isResendConfigured } = require('../server/lib/resendMail');

async function main() {
  const supabase = getDb();
  console.log('RESEND configured:', isResendConfigured());
  console.log('RESEND_FROM:', process.env.RESEND_FROM || '(default)');

  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, name, business_mode, email')
    .eq('business_mode', 'ticketing')
    .limit(5);

  console.log('\nTicketing businesses:', businesses?.length || 0);
  for (const b of businesses || []) {
    console.log(' -', b.name, b.id.slice(0, 8), b.email);
  }

  const bizIds = (businesses || []).map((b) => b.id);
  if (!bizIds.length) {
    console.log('No ticketing businesses found.');
    return;
  }

  const { data: orders } = await supabase
    .from('orders')
    .select(
      'id, business_id, customer_email, payment_status, receipt_sent_at, receipt_sending_at, receipt_send_attempts, receipt_email_error, ticket_receipt_qr_token, total_amount, created_at'
    )
    .in('business_id', bizIds)
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\nRecent ticket orders:');
  for (const o of orders || []) {
    console.log({
      id: o.id,
      email: o.customer_email,
      paid: o.payment_status,
      receipt_sent_at: o.receipt_sent_at,
      receipt_sending_at: o.receipt_sending_at,
      receipt_attempts: o.receipt_send_attempts,
      receipt_error: o.receipt_email_error,
      has_qr: Boolean(o.ticket_receipt_qr_token),
      amount: o.total_amount,
      created: o.created_at
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
