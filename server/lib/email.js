const nodemailer = require('nodemailer');

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = process.env.SMTP_PORT || 587;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  const portNumber = Number(port);
  const secure = portNumber === 465;
  return nodemailer.createTransport({
    host,
    port: portNumber,
    secure,
    auth: { user, pass }
  });
}

module.exports = { getTransporter };
