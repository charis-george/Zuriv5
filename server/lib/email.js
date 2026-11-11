/**
 * @deprecated SMTP removed — all mail goes through Resend (see resendMail.js).
 */
const {
  getResendApiKey,
  getResendFrom,
  sendResendEmail,
  isResendConfigured
} = require('./resendMail');

module.exports = {
  getResendApiKey,
  getResendFrom,
  sendResendEmail,
  isResendConfigured
};
