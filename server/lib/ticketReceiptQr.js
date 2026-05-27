const crypto = require('crypto');
const { getDb } = require('../database');
const { qrToBrandedDataUrl } = require('./brandedQr');

function getFrontendBaseUrl() {
  const raw = process.env.FRONTEND_URL || '';
  const first = String(raw)
    .split(',')
    .map((part) => part.trim().replace(/\/$/, ''))
    .filter(Boolean)[0];
  return first || 'http://localhost:5173';
}

function getPublicApiBaseUrl() {
  const explicit = process.env.PUBLIC_API_URL;
  if (explicit && typeof explicit === 'string' && explicit.trim()) {
    return explicit.trim().replace(/\/$/, '');
  }
  return getFrontendBaseUrl();
}

function buildTicketReceiptVerificationUrl(token) {
  return `${getFrontendBaseUrl()}/scan?ticket=${encodeURIComponent(String(token || ''))}`;
}

function buildTicketReceiptQrImageUrl(token) {
  return `${getPublicApiBaseUrl()}/api/qr/ticket-receipt/image/${encodeURIComponent(String(token || ''))}`;
}

function decodePngDataUrl(dataUrl) {
  const raw = String(dataUrl || '');
  const match = raw.match(/^data:image\/png;base64,(.+)$/);
  if (!match?.[1]) throw new Error('Invalid PNG data URL');
  return Buffer.from(match[1], 'base64');
}

async function loadTicketReceiptOrderByToken(token) {
  const supabase = getDb();
  const normalized = String(token || '').trim();
  if (!normalized) return { error: 'missing_token' };

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(
      'id,business_id,customer_name,customer_email,total_amount,created_at,payment_status,ticket_receipt_qr_token,ticket_receipt_qr_created_at,ticket_receipt_qr_used_at,ticket_receipt_qr_used_by'
    )
    .eq('ticket_receipt_qr_token', normalized)
    .maybeSingle();

  if (orderError || !order) return { error: 'ticket_not_found' };

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id,name,business_mode')
    .eq('id', order.business_id)
    .maybeSingle();

  if (businessError || !business) return { error: 'business_not_found' };

  return { order, business };
}

async function ensureTicketReceiptQrForOrder(orderId) {
  const supabase = getDb();
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(
      'id,business_id,payment_status,ticket_receipt_qr_token,ticket_receipt_qr_created_at,ticket_receipt_qr_used_at,ticket_receipt_qr_used_by'
    )
    .eq('id', orderId)
    .maybeSingle();

  if (orderError || !order) return { error: 'order_not_found' };

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id,name,business_mode')
    .eq('id', order.business_id)
    .maybeSingle();

  if (businessError || !business) return { error: 'business_not_found' };
  if (business.business_mode !== 'ticketing') return { skipped: true, reason: 'not_ticketing', order, business };
  if (order.payment_status !== 'paid') return { skipped: true, reason: 'not_paid', order, business };

  if (order.ticket_receipt_qr_token) {
    const token = order.ticket_receipt_qr_token;
    return {
      order,
      business,
      token,
      verificationUrl: buildTicketReceiptVerificationUrl(token),
      qrImageUrl: buildTicketReceiptQrImageUrl(token)
    };
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const token = crypto.randomBytes(24).toString('hex');
    const nowIso = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('orders')
      .update({
        ticket_receipt_qr_token: token,
        ticket_receipt_qr_created_at: nowIso
      })
      .eq('id', order.id)
      .is('ticket_receipt_qr_token', null)
      .select(
        'id,business_id,payment_status,ticket_receipt_qr_token,ticket_receipt_qr_created_at,ticket_receipt_qr_used_at,ticket_receipt_qr_used_by'
      )
      .maybeSingle();

    if (!updateError && updated?.ticket_receipt_qr_token) {
      return {
        order: updated,
        business,
        token: updated.ticket_receipt_qr_token,
        verificationUrl: buildTicketReceiptVerificationUrl(updated.ticket_receipt_qr_token),
        qrImageUrl: buildTicketReceiptQrImageUrl(updated.ticket_receipt_qr_token)
      };
    }

    const { data: reread } = await supabase
      .from('orders')
      .select(
        'id,business_id,payment_status,ticket_receipt_qr_token,ticket_receipt_qr_created_at,ticket_receipt_qr_used_at,ticket_receipt_qr_used_by'
      )
      .eq('id', order.id)
      .maybeSingle();

    if (reread?.ticket_receipt_qr_token) {
      return {
        order: reread,
        business,
        token: reread.ticket_receipt_qr_token,
        verificationUrl: buildTicketReceiptVerificationUrl(reread.ticket_receipt_qr_token),
        qrImageUrl: buildTicketReceiptQrImageUrl(reread.ticket_receipt_qr_token)
      };
    }
  }

  return { error: 'ticket_token_generation_failed' };
}

async function generateTicketReceiptQrImagePng(token) {
  const loaded = await loadTicketReceiptOrderByToken(token);
  if (loaded.error) return { error: loaded.error };
  if (loaded.business.business_mode !== 'ticketing') return { error: 'not_ticketing' };
  if (loaded.order.payment_status !== 'paid') return { error: 'not_paid' };

  const qrUrl = buildTicketReceiptVerificationUrl(token);
  const dataUrl = await qrToBrandedDataUrl(qrUrl, { width: 500, margin: 1 });
  return { pngBuffer: decodePngDataUrl(dataUrl), qrUrl, order: loaded.order, business: loaded.business };
}

async function verifyTicketReceiptQrOnce(token, scannedByBusinessId) {
  const supabase = getDb();
  const loaded = await loadTicketReceiptOrderByToken(token);
  if (loaded.error) return { ok: false, status: 'invalid', code: 404 };

  const { order, business } = loaded;
  if (business.id !== scannedByBusinessId) {
    return { ok: false, status: 'wrong_business', code: 403, order, business };
  }
  if (business.business_mode !== 'ticketing') {
    return { ok: false, status: 'invalid', code: 400, order, business };
  }
  if (order.payment_status !== 'paid') {
    return { ok: false, status: 'unpaid', code: 400, order, business };
  }
  if (order.ticket_receipt_qr_used_at) {
    return { ok: false, status: 'used', code: 409, order, business };
  }

  const scannedAt = new Date().toISOString();
  const { data: consumed, error: consumeError } = await supabase
    .from('orders')
    .update({
      ticket_receipt_qr_used_at: scannedAt,
      ticket_receipt_qr_used_by: scannedByBusinessId
    })
    .eq('id', order.id)
    .eq('business_id', scannedByBusinessId)
    .eq('ticket_receipt_qr_token', String(token || '').trim())
    .is('ticket_receipt_qr_used_at', null)
    .select(
      'id,business_id,customer_name,customer_email,total_amount,created_at,payment_status,ticket_receipt_qr_used_at,ticket_receipt_qr_used_by'
    )
    .maybeSingle();

  if (!consumeError && consumed?.ticket_receipt_qr_used_at) {
    return { ok: true, status: 'confirmed', order: consumed, business };
  }

  const { data: reread } = await supabase
    .from('orders')
    .select(
      'id,business_id,customer_name,customer_email,total_amount,created_at,payment_status,ticket_receipt_qr_used_at,ticket_receipt_qr_used_by'
    )
    .eq('id', order.id)
    .maybeSingle();

  if (reread?.ticket_receipt_qr_used_at) {
    return { ok: false, status: 'used', code: 409, order: reread, business };
  }

  return { ok: false, status: 'error', code: 500, order, business };
}

module.exports = {
  buildTicketReceiptVerificationUrl,
  buildTicketReceiptQrImageUrl,
  ensureTicketReceiptQrForOrder,
  generateTicketReceiptQrImagePng,
  loadTicketReceiptOrderByToken,
  verifyTicketReceiptQrOnce
};
