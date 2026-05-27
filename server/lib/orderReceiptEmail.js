const { getDb } = require('../database');
const { ensureTicketReceiptQrForOrder } = require('./ticketReceiptQr');

function getSupabase() {
  return getDb();
}

const RESEND_FROM =
  process.env.RESEND_FROM || process.env.SMTP_FROM || 'ZURI <onboarding@resend.dev>';

function getResendApiKey() {
  const key = process.env.RESEND_API_KEY;
  if (!key || typeof key !== 'string' || !key.trim()) return null;
  return key.trim();
}

async function sendViaResendApi(apiKey, payload, timeoutMs = 10_000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const err = new Error(
        `Resend API ${response.status}${text ? `: ${text.slice(0, 300)}` : ''}`
      );
      err.code = `RESEND_HTTP_${response.status}`;
      throw err;
    }
  } finally {
    clearTimeout(timer);
  }
}

function money(n) {
  const x = Number(n) || 0;
  return `₦${x.toFixed(2)}`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;');
}

function summarizeItems(items) {
  return items
    .map((i) => {
      const qty = Number(i.quantity) || 0;
      const name = i.name || 'Item';
      const unit = Number(i.price) || 0;
      const line = qty * unit;
      return `${qty} × ${name} — ${money(line)}`;
    })
    .join('\n');
}

function itemsHtml(items) {
  const rows = items
    .map((i) => {
      const qty = Number(i.quantity) || 0;
      const name = escapeHtml(i.name || 'Item');
      const unit = Number(i.price) || 0;
      const line = qty * unit;
      return `<tr>
  <td style="padding:8px 0;color:#1a1a1a;">${qty} × ${name}</td>
  <td style="padding:8px 0;color:#1a1a1a;text-align:right;white-space:nowrap;">${money(line)}</td>
</tr>`;
    })
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${rows}</table>`;
}

async function loadOrderReceiptData(orderId) {
  const supabase = getSupabase();
  const { data: order, error: oErr } = await supabase
    .from('orders')
    .select('id,business_id,total_amount,customer_name,customer_phone,customer_email,created_at,payment_status,receipt_sent_at')
    .eq('id', orderId)
    .single();
  if (oErr || !order) return { error: 'order_not_found' };

  const { data: biz } = await supabase
    .from('businesses')
    .select('id,name,email,business_mode')
    .eq('id', order.business_id)
    .single();

  const { data: lines, error: liErr } = await supabase
    .from('order_items')
    .select('menu_item_id,quantity,price,special_notes')
    .eq('order_id', orderId);
  if (liErr) return { error: 'order_items_error' };

  const ids = [...new Set((lines || []).map((l) => l.menu_item_id).filter(Boolean))];
  let nameById = {};
  if (ids.length) {
    const { data: items } = await supabase.from('menu_items').select('id,name').in('id', ids);
    nameById = (items || []).reduce((acc, m) => {
      acc[m.id] = m.name || 'Item';
      return acc;
    }, {});
  }

  const receiptItems = (lines || []).map((l) => ({
    name: nameById[l.menu_item_id] || 'Menu item',
    quantity: Number(l.quantity) || 0,
    price: Number(l.price) || 0
  }));

  return { order, biz, receiptItems };
}

/**
 * Send receipt to customer + business via Resend once per order.
 * Best-effort: if RESEND_API_KEY is missing, does nothing.
 */
async function sendOrderReceiptOnce({ orderId, paidAt, reference }) {
  const resendKey = getResendApiKey();
  if (!resendKey) return { skipped: true, reason: 'missing_resend_key' };

  const loaded = await loadOrderReceiptData(orderId);
  if (loaded.error) return { skipped: true, reason: loaded.error };

  const { order, biz, receiptItems } = loaded;
  if (order.receipt_sent_at) return { skipped: true, reason: 'already_sent' };
  if (order.payment_status !== 'paid') return { skipped: true, reason: 'not_paid' };

  const ticketQr = biz?.business_mode === 'ticketing'
    ? await ensureTicketReceiptQrForOrder(orderId)
    : null;

  const customerEmail = (order.customer_email && String(order.customer_email).trim().toLowerCase()) || '';
  const businessEmail = (biz?.email && String(biz.email).trim().toLowerCase()) || '';
  const to = [customerEmail, businessEmail].filter(Boolean);
  if (!to.length) return { skipped: true, reason: 'no_recipients' };

  const businessName = biz?.name || 'ZURI business';
  const subject = `ZURI receipt — Ref ${reference || orderId}`;
  const ticketQrTextBlock =
    ticketQr && !ticketQr.error && !ticketQr.skipped && ticketQr.verificationUrl
      ? [
          '',
          'Ticket check-in QR:',
          'Present the QR in this email for entry verification.',
          `Verification link: ${ticketQr.verificationUrl}`,
          'Once a business confirms it, the QR cannot be reused.'
        ]
      : [];

  const text = [
    `Receipt (Ref: ${reference || orderId})`,
    `Business: ${businessName}`,
    '',
    `Amount paid: ${money(order.total_amount)}`,
    '',
    'Customer details:',
    `Name: ${order.customer_name || ''}`,
    `Phone: ${order.customer_phone || ''}`,
    `Email: ${order.customer_email || ''}`,
    '',
    'Order:',
    summarizeItems(receiptItems),
    '',
    `Paid at: ${paidAt || ''}`,
    ...ticketQrTextBlock
  ].join('\n');

  const ticketQrHtml =
    ticketQr && !ticketQr.error && !ticketQr.skipped && ticketQr.qrImageUrl
      ? `
            <tr>
              <td style="padding:0 22px 18px 22px;">
                <div style="border:1px solid #f0e6d8;border-radius:16px;padding:18px;background:#fffaf2;">
                  <p style="margin:0 0 8px 0;color:#1a1a1a;font-weight:700;">Ticket check-in QR</p>
                  <p style="margin:0 0 14px 0;color:#555;font-size:13px;line-height:1.5;">
                    Show this QR at the door. When your host scans and confirms it, the receipt cannot be used again.
                  </p>
                  <div style="text-align:center;">
                    <img
                      src="${escapeHtml(ticketQr.qrImageUrl)}"
                      alt="Ticket receipt QR"
                      width="220"
                      height="220"
                      style="display:inline-block;width:220px;height:220px;border-radius:18px;border:1px solid #f0e6d8;background:#ffffff;padding:10px;"
                    />
                  </div>
                  <p style="margin:14px 0 0 0;color:#666;font-size:12px;line-height:1.5;">
                    If your mail app blocks images, open this verification link:<br/>
                    <a href="${escapeHtml(ticketQr.verificationUrl)}" style="color:#b96f00;text-decoration:none;">${escapeHtml(ticketQr.verificationUrl)}</a>
                  </p>
                </div>
              </td>
            </tr>`
      : '';

  const html = `
<!doctype html>
<html>
  <head><meta charset="utf-8" /></head>
  <body style="margin:0;padding:0;background:#fafafa;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#fafafa;padding:28px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;border:1px solid #f0e6d8;overflow:hidden;">
            <tr>
              <td style="padding:22px 22px 10px 22px;">
                <div style="display:inline-block;padding:8px 14px;border-radius:999px;background:#fff7eb;color:#1a1a1a;font-size:12px;font-weight:700;letter-spacing:0.04em;">ZURI</div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 18px 22px;">
                <h1 style="margin:0 0 6px 0;font-size:18px;line-height:1.3;color:#1a1a1a;">Payment receipt</h1>
                <p style="margin:0;color:#555;font-size:13px;">Ref: <strong>${escapeHtml(reference || orderId)}</strong></p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 14px 22px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
                  <tr>
                    <td style="padding:10px 0;color:#1a1a1a;font-weight:700;">Amount paid</td>
                    <td style="padding:10px 0;color:#1a1a1a;font-weight:700;text-align:right;white-space:nowrap;">${escapeHtml(money(order.total_amount))}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 14px 22px;">
                <p style="margin:0 0 6px 0;color:#1a1a1a;font-weight:700;">Customer</p>
                <p style="margin:0;color:#444;font-size:13px;line-height:1.5;">
                  ${escapeHtml(order.customer_name || '')}<br/>
                  ${escapeHtml(order.customer_phone || '')}<br/>
                  ${escapeHtml(order.customer_email || '')}
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 22px 18px 22px;">
                <p style="margin:0 0 8px 0;color:#1a1a1a;font-weight:700;">Order</p>
                ${itemsHtml(receiptItems)}
              </td>
            </tr>
            ${ticketQrHtml}
            <tr>
              <td style="padding:14px 22px 22px 22px;border-top:1px solid #f5f0e8;">
                <p style="margin:0;color:#666;font-size:12px;">Business: ${escapeHtml(businessName)}</p>
                <p style="margin:6px 0 0 0;color:#666;font-size:12px;">Paid at: ${escapeHtml(paidAt || '')}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  try {
    await sendViaResendApi(resendKey, {
      from: RESEND_FROM,
      to,
      subject,
      text,
      html
    });

    const supabase = getSupabase();
    await supabase
      .from('orders')
      .update({ receipt_sent_at: new Date().toISOString(), receipt_email_error: null })
      .eq('id', orderId);

    return { skipped: false, to };
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    const supabase = getSupabase();
    await supabase
      .from('orders')
      .update({ receipt_email_error: msg })
      .eq('id', orderId);
    throw err;
  }
}

function queueOrderReceiptOnce(args) {
  setImmediate(() => {
    sendOrderReceiptOnce(args).catch((err) =>
      console.error('[ZURI] receipt email error:', args?.orderId, err && err.message ? err.message : err)
    );
  });
}

module.exports = {
  sendOrderReceiptOnce,
  queueOrderReceiptOnce
};

