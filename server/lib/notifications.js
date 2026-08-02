const { getDb } = require('../database');
const { sendResendEmail, isResendConfigured } = require('./resendMail');

const supabase = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getDb();
      return client[prop];
    }
  }
);

async function getBusinessEmail(businessId) {
  const { data, error } = await supabase
    .from('businesses')
    .select('email, name')
    .eq('id', businessId)
    .single();

  if (error || !data?.email) return null;
  return data;
}

async function sendBusinessEmail({ businessId, subject, text, html }) {
  const business = await getBusinessEmail(businessId);
  if (!business?.email) return { skipped: true, reason: 'missing business email' };
  if (!isResendConfigured()) {
    return { skipped: true, reason: 'resend not configured' };
  }

  await sendResendEmail({
    to: business.email,
    subject,
    text,
    html
  });

  return { skipped: false };
}

/** Fire-and-forget: never block HTTP handlers on email delivery. */
function queueBusinessEmail(args) {
  setImmediate(() => {
    sendBusinessEmail(args).catch((err) =>
      console.error('Business email queue error:', err?.message || err)
    );
  });
}

module.exports = {
  sendBusinessEmail,
  queueBusinessEmail
};
