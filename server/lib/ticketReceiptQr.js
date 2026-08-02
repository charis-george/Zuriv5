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

function mapTicketRow(row) {
  if (!row?.token) return null;
  return {
    id: row.id,
    ticketNumber: row.ticket_number,
    token: row.token,
    verificationUrl: buildTicketReceiptVerificationUrl(row.token),
    qrImageUrl: buildTicketReceiptQrImageUrl(row.token),
    usedAt: row.used_at || null,
    usedBy: row.used_by || null,
    createdAt: row.created_at || null
  };
}

async function getOrderTicketCount(orderId) {
  const supabase = getDb();
  const { data: lines, error } = await supabase
    .from('order_items')
    .select('quantity')
    .eq('order_id', orderId);

  if (error) {
    console.error('[ZURI] Ticket count lookup failed', {
      orderId,
      reason: 'order_items_count_error',
      cause: error.message || String(error)
    });
    return { count: 0, error: 'order_items_count_error', cause: error.message || String(error) };
  }
  return {
    count: (lines || []).reduce((sum, line) => sum + (Number(line.quantity) || 0), 0)
  };
}

async function loadTicketReceiptOrderByToken(token) {
  const supabase = getDb();
  const normalized = String(token || '').trim();
  if (!normalized) return { error: 'missing_token' };

  const { data: ticketRow, error: ticketError } = await supabase
    .from('order_ticket_qrs')
    .select('id,order_id,token,ticket_number,created_at,used_at,used_by')
    .eq('token', normalized)
    .maybeSingle();

  if (!ticketError && ticketRow) {
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select(
        'id,business_id,customer_name,customer_email,total_amount,created_at,payment_status,ticket_receipt_qr_token,ticket_receipt_qr_created_at,ticket_receipt_qr_used_at,ticket_receipt_qr_used_by'
      )
      .eq('id', ticketRow.order_id)
      .maybeSingle();

    if (orderError || !order) return { error: 'ticket_not_found' };

    const { data: business, error: businessError } = await supabase
      .from('businesses')
      .select('id,name,business_mode')
      .eq('id', order.business_id)
      .maybeSingle();

    if (businessError || !business) return { error: 'business_not_found' };

    return { order, business, ticket: mapTicketRow(ticketRow) };
  }

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

  return { order, business, ticket: null };
}

async function insertTicketQrToken({ supabase, orderId, ticketNumber, token }) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from('order_ticket_qrs')
    .insert({
      order_id: orderId,
      ticket_number: ticketNumber,
      token,
      created_at: nowIso
    })
    .select('id,order_id,token,ticket_number,created_at,used_at,used_by')
    .maybeSingle();

  if (!error && data) return data;

  const { data: existing } = await supabase
    .from('order_ticket_qrs')
    .select('id,order_id,token,ticket_number,created_at,used_at,used_by')
    .eq('order_id', orderId)
    .eq('ticket_number', ticketNumber)
    .maybeSingle();

  return existing || null;
}

async function migrateLegacyOrderTicketToken({ supabase, order }) {
  const legacyToken = order.ticket_receipt_qr_token;
  if (!legacyToken) return null;

  return insertTicketQrToken({
    supabase,
    orderId: order.id,
    ticketNumber: 1,
    token: legacyToken
  });
}

async function ensureTicketReceiptQrsForOrder(orderId) {
  const supabase = getDb();
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select(
      'id,business_id,payment_status,ticket_receipt_qr_token,ticket_receipt_qr_created_at,ticket_receipt_qr_used_at,ticket_receipt_qr_used_by'
    )
    .eq('id', orderId)
    .maybeSingle();

  if (orderError || !order) {
    const cause = orderError?.message || 'order row missing while ensuring ticket QRs';
    console.warn('[ZURI] Ticket QR ensure failed', {
      orderId,
      reason: 'order_not_found',
      cause
    });
    return { error: 'order_not_found', cause };
  }

  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id,name,business_mode')
    .eq('id', order.business_id)
    .maybeSingle();

  if (businessError || !business) {
    const cause = businessError?.message || `business ${order.business_id} not found`;
    console.warn('[ZURI] Ticket QR ensure failed', {
      orderId,
      reason: 'business_not_found',
      cause
    });
    return { error: 'business_not_found', cause };
  }
  if (business.business_mode !== 'ticketing') {
    return {
      skipped: true,
      reason: 'not_ticketing',
      cause: `business_mode is "${business.business_mode}"`,
      order,
      business
    };
  }
  if (order.payment_status !== 'paid') {
    return {
      skipped: true,
      reason: 'not_paid',
      cause: `payment_status is "${order.payment_status}"`,
      order,
      business
    };
  }

  const ticketCountResult = await getOrderTicketCount(orderId);
  if (ticketCountResult.error) {
    console.warn('[ZURI] Ticket QR ensure failed', {
      orderId,
      reason: ticketCountResult.error,
      cause: ticketCountResult.cause
    });
    return {
      error: ticketCountResult.error,
      cause: ticketCountResult.cause
    };
  }
  const ticketCount = ticketCountResult.count;
  if (ticketCount < 1) {
    const cause = 'order has no order_items quantity to mint ticket QRs from';
    console.warn('[ZURI] Ticket QR ensure failed', {
      orderId,
      reason: 'no_tickets',
      cause
    });
    return { error: 'no_tickets', cause };
  }

  let { data: existingRows, error: existingError } = await supabase
    .from('order_ticket_qrs')
    .select('id,order_id,token,ticket_number,created_at,used_at,used_by')
    .eq('order_id', orderId)
    .order('ticket_number', { ascending: true });

  if (existingError) {
    console.warn('[ZURI] Ticket QR existing rows lookup failed', {
      orderId,
      reason: 'existing_ticket_qrs_error',
      cause: existingError.message || String(existingError)
    });
  }

  existingRows = existingRows || [];

  if (!existingRows.length && order.ticket_receipt_qr_token) {
    const migrated = await migrateLegacyOrderTicketToken({ supabase, order });
    if (migrated) existingRows = [migrated];
  }

  const needed = ticketCount - existingRows.length;
  for (let i = 0; i < needed; i += 1) {
    const ticketNumber = existingRows.length + 1;
    let inserted = null;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const token = crypto.randomBytes(24).toString('hex');
      inserted = await insertTicketQrToken({ supabase, orderId: order.id, ticketNumber, token });
      if (inserted) break;
    }

    if (!inserted) {
      const cause = `failed to insert order_ticket_qrs row for ticket_number=${ticketNumber} after 5 attempts`;
      console.error('[ZURI] Ticket QR ensure failed', {
        orderId,
        reason: 'ticket_token_generation_failed',
        cause,
        ticketNumber
      });
      return { error: 'ticket_token_generation_failed', cause };
    }
    existingRows.push(inserted);
  }

  const tickets = existingRows.map(mapTicketRow).filter(Boolean);
  const primary = tickets[0] || null;

  return {
    order,
    business,
    tickets,
    ticketCount,
    token: primary?.token || null,
    verificationUrl: primary?.verificationUrl || null,
    qrImageUrl: primary?.qrImageUrl || null
  };
}

/** @deprecated Use ensureTicketReceiptQrsForOrder — kept for single-ticket callers. */
async function ensureTicketReceiptQrForOrder(orderId) {
  const result = await ensureTicketReceiptQrsForOrder(orderId);
  if (result.error || result.skipped) return result;
  const primary = result.tickets?.[0];
  if (!primary) return { error: 'ticket_token_generation_failed' };
  return {
    order: result.order,
    business: result.business,
    token: primary.token,
    verificationUrl: primary.verificationUrl,
    qrImageUrl: primary.qrImageUrl
  };
}

async function generateTicketReceiptQrImagePng(token) {
  try {
    const loaded = await loadTicketReceiptOrderByToken(token);
    if (loaded.error) {
      return {
        error: loaded.error,
        cause: loaded.cause || `loadTicketReceiptOrderByToken failed: ${loaded.error}`
      };
    }
    if (loaded.business.business_mode !== 'ticketing') {
      return {
        error: 'not_ticketing',
        cause: `business_mode is "${loaded.business.business_mode}"`
      };
    }
    if (loaded.order.payment_status !== 'paid') {
      return {
        error: 'not_paid',
        cause: `payment_status is "${loaded.order.payment_status}"`
      };
    }

    const qrUrl = buildTicketReceiptVerificationUrl(token);
    const dataUrl = await qrToBrandedDataUrl(qrUrl, { width: 500, margin: 1 });
    return {
      pngBuffer: decodePngDataUrl(dataUrl),
      qrUrl,
      order: loaded.order,
      business: loaded.business,
      ticket: loaded.ticket || null
    };
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    console.error('[ZURI] Ticket QR PNG generation threw', {
      reason: 'qr_png_generation_error',
      cause: message
    });
    return { error: 'qr_png_generation_error', cause: message };
  }
}

async function resolveTicketTypeLabel(orderId, ticketNumber) {
  const supabase = getDb();
  const num = Number(ticketNumber);
  if (!orderId || !Number.isFinite(num) || num < 1) return null;

  const { data: orderItems, error } = await supabase
    .from('order_items')
    .select('menu_item_id, quantity')
    .eq('order_id', orderId);

  if (error || !orderItems?.length) return null;

  const menuItemIds = [...new Set(orderItems.map((row) => row.menu_item_id).filter(Boolean))];
  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id, name')
    .in('id', menuItemIds);

  const nameById = (menuItems || []).reduce((acc, row) => {
    acc[row.id] = row.name || 'Ticket';
    return acc;
  }, {});

  const slots = [];
  for (const line of orderItems) {
    const qty = Math.max(0, Number(line.quantity) || 0);
    const label = nameById[line.menu_item_id] || 'Ticket';
    for (let i = 0; i < qty; i += 1) {
      slots.push(label);
    }
  }

  return slots[num - 1] || null;
}

async function verifyTicketReceiptQrOnce(token, scannedByBusinessId) {
  const supabase = getDb();
  const loaded = await loadTicketReceiptOrderByToken(token);
  if (loaded.error) return { ok: false, status: 'invalid', code: 404 };

  const { order, business, ticket } = loaded;
  if (business.id !== scannedByBusinessId) {
    return { ok: false, status: 'wrong_business', code: 403, order, business, ticket };
  }
  if (business.business_mode !== 'ticketing') {
    return { ok: false, status: 'invalid', code: 400, order, business, ticket };
  }
  if (order.payment_status !== 'paid') {
    return { ok: false, status: 'unpaid', code: 400, order, business, ticket };
  }

  if (ticket) {
    if (ticket.usedAt) {
      return { ok: false, status: 'used', code: 409, order, business, ticket };
    }

    const scannedAt = new Date().toISOString();
    const { data: consumed, error: consumeError } = await supabase
      .from('order_ticket_qrs')
      .update({
        used_at: scannedAt,
        used_by: scannedByBusinessId
      })
      .eq('id', ticket.id)
      .eq('order_id', order.id)
      .eq('token', String(token || '').trim())
      .is('used_at', null)
      .select('id,order_id,token,ticket_number,created_at,used_at,used_by')
      .maybeSingle();

    if (!consumeError && consumed?.used_at) {
      return {
        ok: true,
        status: 'confirmed',
        order,
        business,
        ticket: mapTicketRow(consumed)
      };
    }

    const { data: reread } = await supabase
      .from('order_ticket_qrs')
      .select('id,order_id,token,ticket_number,created_at,used_at,used_by')
      .eq('id', ticket.id)
      .maybeSingle();

    if (reread?.used_at) {
      return {
        ok: false,
        status: 'used',
        code: 409,
        order,
        business,
        ticket: mapTicketRow(reread)
      };
    }

    return { ok: false, status: 'error', code: 500, order, business, ticket };
  }

  if (order.ticket_receipt_qr_used_at) {
    return { ok: false, status: 'used', code: 409, order, business, ticket: null };
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
    return { ok: true, status: 'confirmed', order: consumed, business, ticket: null };
  }

  const { data: reread } = await supabase
    .from('orders')
    .select(
      'id,business_id,customer_name,customer_email,total_amount,created_at,payment_status,ticket_receipt_qr_used_at,ticket_receipt_qr_used_by'
    )
    .eq('id', order.id)
    .maybeSingle();

  if (reread?.ticket_receipt_qr_used_at) {
    return { ok: false, status: 'used', code: 409, order: reread, business, ticket: null };
  }

  return { ok: false, status: 'error', code: 500, order, business, ticket: null };
}

module.exports = {
  buildTicketReceiptVerificationUrl,
  buildTicketReceiptQrImageUrl,
  ensureTicketReceiptQrForOrder,
  ensureTicketReceiptQrsForOrder,
  generateTicketReceiptQrImagePng,
  getOrderTicketCount,
  loadTicketReceiptOrderByToken,
  resolveTicketTypeLabel,
  verifyTicketReceiptQrOnce
};
