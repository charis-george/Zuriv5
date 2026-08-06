const { getDb } = require('../database');
const {
  ensureTicketReceiptQrsForOrder,
  generateTicketReceiptQrImagePng
} = require('./ticketReceiptQr');
const { sendResendEmail, isResendConfigured, isInvalidIdempotentConflict } = require('./resendMail');

// Long enough for multi-ticket PNG generation + Resend (45s timeout) without lock steal.
const SEND_LOCK_STALE_MS = Math.max(180_000, Number(process.env.ORDER_RECEIPT_LOCK_STALE_MS) || 10 * 60_000);
const LOCK_RELEASE_RETRIES = Math.max(2, Number(process.env.ORDER_RECEIPT_LOCK_RELEASE_RETRIES) || 5);
/** Empty order_items often race payment — only permanize after enough failed attempts. */
const NO_TICKETS_PERMANENT_AFTER_ATTEMPTS = Math.max(
  3,
  Number(process.env.ORDER_RECEIPT_NO_TICKETS_PERMANENT_AFTER) || 8
);

function getSupabase() {
  return getDb();
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Hard permanent defects only. no_tickets is decided dynamically (race vs true empty).
 * business_not_found / order_not_found / missing_resend_key stay retryable.
 */
const PERMANENT_RECEIPT_REASONS = new Set(['no_recipients', 'no_customer_email']);

function isPermanentReceiptReason(reason, { attempts = 0 } = {}) {
  const r = String(reason || '');
  if (PERMANENT_RECEIPT_REASONS.has(r)) return true;
  if (r === 'no_tickets' && attempts >= NO_TICKETS_PERMANENT_AFTER_ATTEMPTS) return true;
  return false;
}

function formatReceiptErrorMessage(reason, cause, { attempts = 0 } = {}) {
  const body = String(cause || reason || 'unknown').slice(0, 460);
  if (isPermanentReceiptReason(reason, { attempts })) {
    return `permanent:${reason}|${body}`.slice(0, 500);
  }
  return body.slice(0, 500);
}

function skipped(reason, retryable = false, cause = null, { attempts = 0 } = {}) {
  const permanent = isPermanentReceiptReason(reason, { attempts });
  return {
    ok: false,
    skipped: true,
    reason,
    retryable: permanent ? false : retryable,
    cause: cause || reason,
    permanent
  };
}

async function claimReceiptSendLock(orderId) {
  const supabase = getSupabase();
  const nowIso = new Date().toISOString();
  const staleBefore = new Date(Date.now() - SEND_LOCK_STALE_MS).toISOString();

  let claimed = null;
  let claimError = null;

  try {
    ({ data: claimed, error: claimError } = await supabase
      .from('orders')
      .update({ receipt_sending_at: nowIso })
      .eq('id', orderId)
      .is('receipt_sent_at', null)
      .is('receipt_sending_at', null)
      .select('id,payment_status,receipt_sent_at,receipt_send_attempts')
      .maybeSingle());
  } catch (err) {
    claimError = err;
  }

  if (claimError) {
    console.error('[ZURI] Receipt email lock claim failed', {
      orderId,
      reason: 'lock_claim_error',
      cause: claimError.message || String(claimError)
    });
  }

  if (!claimed) {
    try {
      ({ data: claimed, error: claimError } = await supabase
        .from('orders')
        .update({ receipt_sending_at: nowIso })
        .eq('id', orderId)
        .is('receipt_sent_at', null)
        .lt('receipt_sending_at', staleBefore)
        .select('id,payment_status,receipt_sent_at,receipt_send_attempts')
        .maybeSingle());
    } catch (err) {
      claimError = err;
    }

    if (claimError) {
      console.error('[ZURI] Receipt email stale lock reclaim failed', {
        orderId,
        reason: 'stale_lock_reclaim_error',
        cause: claimError.message || String(claimError)
      });
    }
  }

  if (claimed) {
    const attempts = (Number(claimed.receipt_send_attempts) || 0) + 1;
    const { error: attemptsError } = await supabase
      .from('orders')
      .update({ receipt_send_attempts: attempts })
      .eq('id', orderId);
    if (attemptsError) {
      console.warn('[ZURI] Receipt email attempt counter update failed', {
        orderId,
        reason: 'attempt_counter_error',
        cause: attemptsError.message || String(attemptsError)
      });
    }
    return {
      claimed: true,
      lockToken: nowIso,
      order: { ...claimed, receipt_send_attempts: attempts }
    };
  }

  // If both claim attempts failed with a transport error, retry later — do not treat as in_flight.
  if (claimError) {
    return {
      claimed: false,
      result: skipped(
        'lock_claim_error',
        true,
        claimError.message || String(claimError)
      )
    };
  }

  let current = null;
  let currentError = null;
  try {
    ({ data: current, error: currentError } = await supabase
      .from('orders')
      .select('receipt_sent_at,receipt_sending_at,receipt_email_error,payment_status')
      .eq('id', orderId)
      .maybeSingle());
  } catch (err) {
    currentError = err;
  }

  if (currentError) {
    console.error('[ZURI] Receipt email lock status lookup failed', {
      orderId,
      reason: 'lock_status_lookup_error',
      cause: currentError.message || String(currentError)
    });
    return {
      claimed: false,
      result: skipped(
        'lock_status_lookup_error',
        true,
        currentError.message || String(currentError)
      )
    };
  }

  if (!current) {
    return {
      claimed: false,
      result: skipped('order_not_found', true, 'order row not found while claiming receipt send lock')
    };
  }
  if (current.receipt_sent_at) {
    return {
      claimed: false,
      result: skipped(
        'already_sent',
        false,
        `receipt_sent_at already set (${current.receipt_sent_at})`
      )
    };
  }
  return {
    claimed: false,
    result: skipped(
      'in_flight',
      true,
      `another send holds receipt_sending_at=${current.receipt_sending_at}` +
        (current.receipt_email_error ? `; last_error=${current.receipt_email_error}` : '')
    )
  };
}

async function releaseReceiptSendLock(
  orderId,
  { sent = false, errorMessage = null, lockToken = null } = {}
) {
  const supabase = getSupabase();
  const updates = sent
    ? {
        receipt_sent_at: new Date().toISOString(),
        receipt_sending_at: null,
        receipt_email_error: null
      }
    : {
        receipt_sending_at: null,
        ...(errorMessage ? { receipt_email_error: String(errorMessage).slice(0, 500) } : {})
      };

  let lastError = null;
  for (let attempt = 0; attempt < LOCK_RELEASE_RETRIES; attempt += 1) {
    try {
      let q = supabase.from('orders').update(updates).eq('id', orderId);
      // Only the worker that holds this lock token may clear it (avoids steal races).
      if (lockToken && !sent) {
        q = q.eq('receipt_sending_at', lockToken);
      }
      if (sent) {
        // Mark sent even if another worker holds the lock — Resend already accepted.
        q = q.is('receipt_sent_at', null);
      }
      const { error, data } = await q.select('id').maybeSingle();
      if (!error) {
        // Ownership miss on non-sent release: another worker owns the lock — OK.
        if (!sent && lockToken && !data) return { ok: true, skippedOwnership: true };
        return { ok: true };
      }
      lastError = error;
    } catch (err) {
      lastError = err;
    }
    await sleep(200 * 2 ** attempt);
  }

  // Last resort for sent=true: unconditional mark if still unsent.
  if (sent) {
    try {
      const { error } = await supabase
        .from('orders')
        .update(updates)
        .eq('id', orderId)
        .is('receipt_sent_at', null);
      if (!error) return { ok: true };
      lastError = error;
    } catch (err) {
      lastError = err;
    }
  }

  console.error('[ZURI] Receipt email lock release failed', {
    orderId,
    reason: 'lock_release_error',
    cause: lastError?.message || String(lastError),
    sent,
    errorMessage,
    retries: LOCK_RELEASE_RETRIES
  });
  return { ok: false, error: lastError };
}

/**
 * Persist receipt_sent_at after Resend already accepted the message.
 * Used when the post-send DB write fails so we never re-email the guest.
 */
async function forceMarkReceiptSent(orderId) {
  return releaseReceiptSendLock(orderId, { sent: true });
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

function ticketQrAttachmentFilename(reference, orderId, ticketNumber, ticketCount) {
  const refSlug = String(reference || orderId)
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  const suffix =
    ticketCount > 1 && ticketNumber
      ? `-${ticketNumber}-of-${ticketCount}`
      : '';
  return `ticket-check-in-${refSlug || 'receipt'}${suffix}.png`;
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
    .select('id,business_id,total_amount,customer_name,customer_phone,customer_email,created_at,payment_status,receipt_sent_at,paystack_payment_reference')
    .eq('id', orderId)
    .single();
  if (oErr || !order) {
    return {
      error: 'order_not_found',
      cause: oErr?.message || 'order row missing for receipt load'
    };
  }

  const { data: biz, error: bizErr } = await supabase
    .from('businesses')
    .select('id,name,email,business_mode')
    .eq('id', order.business_id)
    .single();
  // Never soft-continue without business — ticketing mode would be unknown and we
  // could mark a ticket order "sent" without QR attachments.
  if (bizErr || !biz) {
    return {
      error: 'business_load_error',
      cause: bizErr?.message || 'business row missing for receipt load'
    };
  }

  const { data: lines, error: liErr } = await supabase
    .from('order_items')
    .select('menu_item_id,quantity,price,special_notes')
    .eq('order_id', orderId);
  if (liErr) {
    return {
      error: 'order_items_error',
      cause: liErr.message || 'failed to load order_items for receipt'
    };
  }

  const ids = [...new Set((lines || []).map((l) => l.menu_item_id).filter(Boolean))];
  let nameById = {};
  if (ids.length) {
    const { data: items, error: itemsErr } = await supabase
      .from('menu_items')
      .select('id,name')
      .in('id', ids);
    if (itemsErr) {
      console.warn('[ZURI] Receipt email menu names load warning', {
        orderId,
        reason: 'menu_items_load_error',
        cause: itemsErr.message || String(itemsErr)
      });
    }
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
  if (!isResendConfigured()) {
    const cause = 'RESEND_API_KEY is not set on this server';
    console.error('[ZURI] Receipt email skipped', {
      orderId,
      reason: 'missing_resend_key',
      cause
    });
    // Persist so sweep keeps surfacing this until the key is configured.
    try {
      await getSupabase()
        .from('orders')
        .update({ receipt_email_error: formatReceiptErrorMessage('missing_resend_key', cause) })
        .eq('id', orderId)
        .is('receipt_sent_at', null);
    } catch {
      /* ignore */
    }
    return skipped('missing_resend_key', true, cause);
  }

  const lock = await claimReceiptSendLock(orderId);
  if (!lock.claimed) {
    const result = lock.result;
    // already_sent is expected when verify/webhook re-queue after a successful send — not an error
    if (result.reason === 'already_sent') {
      return result;
    }
    console.warn('[ZURI] Receipt email skipped', {
      orderId,
      reason: result.reason,
      cause: result.cause || result.reason,
      retryable: Boolean(result.retryable)
    });
    return result;
  }

  const lockToken = lock.lockToken || null;
  const sendAttempts = Number(lock.order?.receipt_send_attempts) || 0;

  const loaded = await loadOrderReceiptData(orderId);
  if (loaded.error) {
    console.warn('[ZURI] Receipt email skipped', {
      orderId,
      reason: loaded.error,
      cause: loaded.cause || loaded.error,
      retryable: true
    });
    await releaseReceiptSendLock(orderId, {
      sent: false,
      errorMessage: loaded.cause || loaded.error,
      lockToken
    });
    // All load failures are retryable — transient Supabase blips must not strand tickets.
    return skipped(loaded.error, true, loaded.cause || loaded.error);
  }

  const { order, biz, receiptItems } = loaded;
  if (order.receipt_sent_at) {
    await releaseReceiptSendLock(orderId, { sent: true, lockToken });
    return skipped(
      'already_sent',
      false,
      `receipt_sent_at already set (${order.receipt_sent_at})`
    );
  }
  if (order.payment_status !== 'paid') {
    const cause = `payment_status is "${order.payment_status}" (expected paid)`;
    console.warn('[ZURI] Receipt email waiting: order not paid yet', {
      orderId,
      reason: 'not_paid',
      cause,
      payment_status: order.payment_status
    });
    await releaseReceiptSendLock(orderId, {
      sent: false,
      errorMessage: 'not_paid',
      lockToken
    });
    return skipped('not_paid', true, cause);
  }

  const ticketQrResult = biz?.business_mode === 'ticketing'
    ? await ensureTicketReceiptQrsForOrder(orderId)
    : null;

  if (biz?.business_mode === 'ticketing' && ticketQrResult?.error) {
    const cause = ticketQrResult.cause || ticketQrResult.error;
    const permanent = isPermanentReceiptReason(ticketQrResult.error, {
      attempts: sendAttempts
    });
    console.warn(
      permanent
        ? '[ZURI] Ticket QR generation failed — permanent, will not retry'
        : '[ZURI] Ticket QR generation failed — will retry',
      {
        orderId,
        reason: ticketQrResult.error,
        cause,
        permanent,
        attempts: sendAttempts
      }
    );
    await releaseReceiptSendLock(orderId, {
      sent: false,
      errorMessage: formatReceiptErrorMessage(ticketQrResult.error, cause, {
        attempts: sendAttempts
      }),
      lockToken
    });
    return skipped(ticketQrResult.error, !permanent, cause, { attempts: sendAttempts });
  }

  if (biz?.business_mode === 'ticketing' && ticketQrResult?.skipped) {
    console.warn('[ZURI] Ticket QR ensure skipped', {
      orderId,
      reason: ticketQrResult.reason,
      cause: ticketQrResult.cause || ticketQrResult.reason
    });
  }

  const ticketQrs =
    ticketQrResult && !ticketQrResult.error && !ticketQrResult.skipped
      ? ticketQrResult.tickets || []
      : [];
  const ticketCount = ticketQrs.length;

  // Never mark a ticketing order "sent" without QR tokens — guest cannot check in.
  if (biz?.business_mode === 'ticketing' && ticketCount < 1) {
    const underlying = ticketQrResult?.error || ticketQrResult?.reason || 'missing_ticket_qrs';
    // Empty order_items often race payment — only permanize after enough attempts.
    const reason = underlying === 'no_tickets' ? 'no_tickets' : 'missing_ticket_qrs';
    const cause =
      ticketQrResult?.cause ||
      ticketQrResult?.reason ||
      'ticketing order produced 0 QR tokens — refusing to send empty ticket email';
    const permanent = isPermanentReceiptReason(reason, { attempts: sendAttempts });
    console.error('[ZURI] Ticket receipt blocked — missing QR tokens', {
      orderId,
      reason,
      cause,
      permanent,
      attempts: sendAttempts,
      severity: permanent ? 'permanent' : 'critical'
    });
    await releaseReceiptSendLock(orderId, {
      sent: false,
      errorMessage: formatReceiptErrorMessage(reason, cause, { attempts: sendAttempts }),
      lockToken
    });
    return skipped(reason, !permanent, cause, { attempts: sendAttempts });
  }

  // Stable identity fields — must not change between webhook vs sweep retries
  // or Resend returns 409 invalid_idempotent_request for the same key.
  const stableRef =
    order.paystack_payment_reference || reference || orderId;
  const stablePaidAt = order.created_at || paidAt || '';

  // Generate PNGs in parallel so multi-ticket orders stay fast under load.
  const ticketQrAttachments = (
    await Promise.all(
      ticketQrs.map(async (ticket) => {
        const png = await generateTicketReceiptQrImagePng(ticket.token);
        if (!png.error && png.pngBuffer) {
          return {
            filename: ticketQrAttachmentFilename(stableRef, orderId, ticket.ticketNumber, ticketCount),
            content: png.pngBuffer.toString('base64'),
            content_type: 'image/png',
            content_id: `ticket-qr-${ticket.ticketNumber}`
          };
        }
        console.warn('[ZURI] Ticket QR PNG attachment failed', {
          orderId,
          ticketNumber: ticket.ticketNumber,
          reason: png.error || 'missing_png_buffer',
          cause: png.cause || png.error || 'generateTicketReceiptQrImagePng returned no PNG buffer'
        });
        return null;
      })
    )
  ).filter(Boolean);

  if (ticketCount > 0 && ticketQrAttachments.length === 0) {
    console.warn('[ZURI] Receipt email sending without QR PNG attachments', {
      orderId,
      reason: 'qr_png_all_failed',
      cause: `had ${ticketCount} ticket QR token(s) but 0 PNG attachments; email will use image URLs / verification links`,
      ticketCount
    });
  } else if (ticketCount > 0 && ticketQrAttachments.length < ticketCount) {
    console.warn('[ZURI] Receipt email partial QR PNG attachments', {
      orderId,
      reason: 'qr_png_partial_failed',
      cause: `attached ${ticketQrAttachments.length} of ${ticketCount} ticket QR PNGs`,
      ticketCount,
      attached: ticketQrAttachments.length
    });
  }

  const customerEmail = (order.customer_email && String(order.customer_email).trim().toLowerCase()) || '';
  const businessEmail = (biz?.email && String(biz.email).trim().toLowerCase()) || '';
  const isTicketing = biz?.business_mode === 'ticketing';
  // Ticketing: guest-only. A bad business inbox must never block the buyer's QR.
  // Venue still gets notifyTicketingSalePaid from finalizePaidOrder.
  const to = isTicketing
    ? [customerEmail].filter(Boolean)
    : [...new Set([customerEmail, businessEmail].filter(Boolean))];
  if (!to.length) {
    const cause =
      'order.customer_email and business.email are both empty — nowhere to deliver the receipt';
    console.warn('[ZURI] Receipt email skipped', {
      orderId,
      reason: 'no_recipients',
      cause,
      customerEmailPresent: Boolean(customerEmail),
      businessEmailPresent: Boolean(businessEmail)
    });
    await releaseReceiptSendLock(orderId, {
      sent: false,
      errorMessage: formatReceiptErrorMessage('no_recipients', cause),
      lockToken
    });
    return skipped('no_recipients', false, cause);
  }

  // Ticketing guests need the QR in their inbox — do not "succeed" with business-only delivery.
  if (isTicketing && !customerEmail) {
    const cause =
      'ticketing order has no customer_email — guest cannot receive ticket QR';
    console.error('[ZURI] Ticket receipt blocked — no customer email', {
      orderId,
      reason: 'no_customer_email',
      cause,
      businessEmailPresent: Boolean(businessEmail),
      severity: 'permanent'
    });
    await releaseReceiptSendLock(orderId, {
      sent: false,
      errorMessage: formatReceiptErrorMessage('no_customer_email', cause),
      lockToken
    });
    return skipped('no_customer_email', false, cause);
  }

  const businessName = biz?.name || 'ZURI business';
  const subject = isTicketing
    ? `Your ZURI ticket — ${businessName}`
    : `ZURI receipt — Ref ${stableRef}`;
  const ticketQrTextBlock = ticketQrs.length
    ? [
        '',
        ticketCount > 1 ? `Ticket check-in QRs (${ticketCount} tickets):` : 'Ticket check-in QR:',
        ticketQrAttachments.length
          ? ticketCount > 1
            ? `${ticketQrAttachments.length} PNG files are attached — save each one and show them at the door (one QR per person).`
            : `A PNG file (${ticketQrAttachments[0].filename}) is attached — save it to your phone and show it at the door.`
          : ticketCount > 1
            ? 'Present each QR in this email for entry verification (one QR per person).'
            : 'Present the QR in this email for entry verification.',
        'If you cannot open the attachment or images, use these verification links instead:',
        ...ticketQrs.map(
          (ticket) =>
            ticketCount > 1
              ? `Ticket ${ticket.ticketNumber}: ${ticket.verificationUrl}`
              : `Verification link: ${ticket.verificationUrl}`
        ),
        'Once a business confirms a QR, that ticket cannot be reused.'
      ]
    : [];

  const text = [
    `Receipt (Ref: ${stableRef})`,
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
    `Paid at: ${stablePaidAt}`,
    ...ticketQrTextBlock
  ].join('\n');

  const ticketQrCardsHtml = ticketQrs
    .map((ticket) => {
      const attachment = ticketQrAttachments.find((att) => att.content_id === `ticket-qr-${ticket.ticketNumber}`);
      const label = ticketCount > 1 ? `Ticket ${ticket.ticketNumber} of ${ticketCount}` : 'Ticket check-in QR';
      return `
                <div style="border:1px solid #f0e6d8;border-radius:16px;padding:18px;background:#fffaf2;${ticketCount > 1 ? 'margin-bottom:14px;' : ''}">
                  <p style="margin:0 0 8px 0;color:#1a1a1a;font-weight:700;">${escapeHtml(label)}</p>
                  <p style="margin:0 0 14px 0;color:#555;font-size:13px;line-height:1.5;">
                    ${
                      attachment
                        ? `Attached as <strong>${escapeHtml(attachment.filename)}</strong>. Save it to your phone and show it at the door.`
                        : 'Show this QR at the door.'
                    }
                    When your host scans and confirms it, this ticket cannot be used again.
                  </p>
                  <div style="text-align:center;">
                    <img
                      src="${attachment ? `cid:ticket-qr-${ticket.ticketNumber}` : escapeHtml(ticket.qrImageUrl)}"
                      alt="${escapeHtml(label)}"
                      width="220"
                      height="220"
                      style="display:inline-block;width:220px;height:220px;border-radius:18px;border:1px solid #f0e6d8;background:#ffffff;padding:10px;"
                    />
                  </div>
                  <p style="margin:14px 0 0 0;color:#666;font-size:12px;line-height:1.5;">
                    Verification link:<br/>
                    <a href="${escapeHtml(ticket.verificationUrl)}" style="color:#b96f00;text-decoration:none;">${escapeHtml(ticket.verificationUrl)}</a>
                  </p>
                </div>`;
    })
    .join('');

  const ticketQrHtml = ticketQrs.length
    ? `
            <tr>
              <td style="padding:0 22px 18px 22px;">
                ${ticketQrCardsHtml}
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
                <h1 style="margin:0 0 6px 0;font-size:18px;line-height:1.3;color:#1a1a1a;">${isTicketing ? 'Your ticket' : 'Payment receipt'}</h1>
                <p style="margin:0;color:#555;font-size:13px;">Ref: <strong>${escapeHtml(stableRef)}</strong></p>
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
                <p style="margin:6px 0 0 0;color:#666;font-size:12px;">Paid at: ${escapeHtml(stablePaidAt)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

  try {
    const resendResult = await sendResendEmail(
      {
        to,
        subject,
        text,
        html,
        attachments: ticketQrAttachments.length ? ticketQrAttachments : undefined
      },
      {
        timeoutMs: ticketQrAttachments.length ? 45_000 : 15_000,
        // One logical ticket email per order — safe across retries / deploy overlaps.
        idempotencyKey: `zuri-receipt-${orderId}`
      }
    );

    const marked = await releaseReceiptSendLock(orderId, { sent: true, lockToken });
    if (!marked.ok) {
      // Email already left Resend — keep retrying the DB mark without treating as a full resend miss.
      const cause =
        marked.error?.message ||
        'receipt delivered via Resend but receipt_sent_at could not be persisted';
      console.error('[ZURI] Receipt email delivered but mark-sent failed', {
        orderId,
        reason: 'mark_sent_failed',
        cause,
        to,
        resendMessageId: resendResult?.messageId || resendResult?.id || null,
        severity: 'critical'
      });
      try {
        await getSupabase()
          .from('orders')
          .update({
            receipt_email_error: `mark_sent_failed|${String(cause).slice(0, 460)}`.slice(0, 500)
          })
          .eq('id', orderId);
      } catch {
        /* ignore */
      }
      return skipped('mark_sent_failed', true, cause);
    }

    console.log('[ZURI] Receipt email sent', {
      orderId,
      to,
      ticketing: isTicketing,
      ticketQrCount: ticketQrAttachments.length,
      ticketTokenCount: ticketCount,
      resendMessageId: resendResult?.messageId || resendResult?.id || null,
      reason: 'sent'
    });
    return { ok: true, to, resendMessageId: resendResult?.messageId || resendResult?.id || null };
  } catch (err) {
    // Same key already accepted with a different body (or prior success) —
    // treat as delivered and persist receipt_sent_at so we never loop forever.
    if (isInvalidIdempotentConflict(err)) {
      console.warn('[ZURI] Receipt Resend idempotent conflict — marking sent', {
        orderId,
        reason: 'idempotent_replay',
        cause: err.message || String(err),
        to
      });
      const marked = await forceMarkReceiptSent(orderId);
      if (marked.ok) {
        console.log('[ZURI] Receipt email sent', {
          orderId,
          to,
          ticketing: isTicketing,
          ticketQrCount: ticketQrAttachments.length,
          ticketTokenCount: ticketCount,
          reason: 'idempotent_replay'
        });
        return { ok: true, to, reason: 'idempotent_replay' };
      }
      return skipped(
        'mark_sent_failed',
        true,
        marked.error?.message || 'idempotent replay but could not persist receipt_sent_at'
      );
    }

    const msg = err && err.message ? err.message : String(err);
    const code = err && err.code ? err.code : undefined;
    console.error('[ZURI] Receipt email failed', {
      orderId,
      reason: 'resend_send_error',
      cause: msg,
      code,
      to
    });
    await releaseReceiptSendLock(orderId, {
      sent: false,
      errorMessage: msg,
      lockToken
    });
    throw err;
  }
}

function queueOrderReceiptOnce(args) {
  const { queueOrderReceiptOnce: enqueue } = require('./orderReceiptQueue');
  return enqueue(args);
}

/**
 * Queue a receipt only when the order is paid and has not already been emailed.
 * Use on verify/webhook "already paid" recovery paths to avoid already_sent noise.
 */
function queueOrderReceiptIfNeeded(order, args = {}) {
  const orderId = order?.id || args.orderId;
  if (!orderId) {
    return { queued: false, reason: 'missing_order_id' };
  }
  if (order?.receipt_sent_at) {
    return { queued: false, reason: 'already_sent', orderId };
  }
  return queueOrderReceiptOnce({
    orderId,
    paidAt: args.paidAt ?? null,
    reference: args.reference || orderId
  });
}

module.exports = {
  isPermanentReceiptReason,
  formatReceiptErrorMessage,
  sendOrderReceiptOnce,
  queueOrderReceiptOnce,
  queueOrderReceiptIfNeeded,
  forceMarkReceiptSent
};
