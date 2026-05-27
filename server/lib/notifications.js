const { getTransporter } = require('./email')
const { getDb } = require('../database')

const supabase = getDb()

async function getBusinessEmail(businessId) {
  const { data, error } = await supabase
    .from('businesses')
    .select('email, name')
    .eq('id', businessId)
    .single()

  if (error || !data?.email) return null
  return data
}

async function sendBusinessEmail({ businessId, subject, text }) {
  const business = await getBusinessEmail(businessId)
  if (!business?.email) return { skipped: true, reason: 'missing business email' }

  const transporter = getTransporter()
  if (!transporter) return { skipped: true, reason: 'smtp not configured' }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER

  await transporter.sendMail({
    from,
    to: business.email,
    subject,
    text
  })

  return { skipped: false }
}

/** Fire-and-forget: never block HTTP handlers on SMTP (slow/hanging mail servers freeze the UI). */
function queueBusinessEmail(args) {
  setImmediate(() => {
    sendBusinessEmail(args).catch((err) => console.error('Business email queue error:', err))
  })
}

module.exports = {
  sendBusinessEmail,
  queueBusinessEmail
}

