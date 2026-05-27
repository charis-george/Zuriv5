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
    auth: { user, pass },
    connectionTimeout: 12_000,
    greetingTimeout: 12_000,
    socketTimeout: 25_000
  });
}

async function sendMailWithTimeout(transporter, mail, timeoutMs = 4500) {
  if (!transporter) throw new Error('No transporter');
  let timer = null;
  try {
    const timeoutPromise = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`SMTP timeout after ${timeoutMs}ms`);
        err.code = 'SMTP_TIMEOUT';
        reject(err);
      }, timeoutMs);
    });
    return await Promise.race([transporter.sendMail(mail), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = { getTransporter, sendMailWithTimeout };
