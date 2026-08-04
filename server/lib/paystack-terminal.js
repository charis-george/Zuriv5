/**
 * Paystack Terminal helpers for Zuri Assist.
 * Flow: create payment request for a pending order → push invoice event to terminal →
 * charge.success / paymentrequest.success webhook marks the order paid.
 */

const PAYSTACK_BASE = 'https://api.paystack.co';

function secretKey() {
  return (process.env.PAYSTACK_SECRET_KEY || '').trim();
}

function isTerminalConfigured() {
  return Boolean(secretKey());
}

async function paystackFetch(path, { method = 'GET', body } = {}) {
  const key = secretKey();
  if (!key) {
    return { ok: false, error: 'PAYSTACK_SECRET_KEY is not configured' };
  }
  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body != null ? JSON.stringify(body) : undefined
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok || data?.status === false) {
    return {
      ok: false,
      status: res.status,
      error: data?.message || `Paystack HTTP ${res.status}`,
      data
    };
  }
  return { ok: true, data: data?.data ?? data, message: data?.message };
}

async function listTerminals() {
  const result = await paystackFetch('/terminal');
  if (!result.ok) return result;
  const rows = Array.isArray(result.data) ? result.data : result.data?.data || [];
  return {
    ok: true,
    terminals: (rows || []).map((t) => ({
      id: t.id != null ? String(t.id) : null,
      serialNumber: t.serial_number || t.serialNumber || null,
      deviceId: t.device_id || t.deviceId || null,
      name: t.name || t.terminal_name || null,
      status: t.status || null
    })).filter((t) => t.id)
  };
}

async function ensurePaystackCustomer({ email, firstName, phone }) {
  const safeEmail =
    (email && String(email).trim().toLowerCase()) ||
    `terminal+${Date.now()}@zuriqo.com`;
  const created = await paystackFetch('/customer', {
    method: 'POST',
    body: {
      email: safeEmail,
      first_name: firstName || undefined,
      phone: phone || undefined
    }
  });
  if (created.ok && created.data?.customer_code) {
    return { ok: true, customerCode: created.data.customer_code, email: safeEmail };
  }
  // Already exists — fetch by email
  const existing = await paystackFetch(`/customer/${encodeURIComponent(safeEmail)}`);
  if (existing.ok && existing.data?.customer_code) {
    return { ok: true, customerCode: existing.data.customer_code, email: safeEmail };
  }
  return {
    ok: false,
    error: created.error || existing.error || 'Could not create Paystack customer'
  };
}

/**
 * Create a payment request for an order and push it to a Paystack Terminal.
 * @returns {{ ok: boolean, offlineReference?: string, paymentRequestId?: string, eventId?: string, error?: string }}
 */
async function pushOrderPaymentToTerminal({
  order,
  business,
  terminalId,
  lineItems
}) {
  if (!terminalId) {
    return { ok: false, error: 'No Paystack Terminal linked for this business' };
  }
  const amountNaira = Number(order.total_amount ?? order.totalAmount);
  if (!Number.isFinite(amountNaira) || amountNaira <= 0) {
    return { ok: false, error: 'Order total must be greater than zero' };
  }
  const amountKobo = Math.round(amountNaira * 100);

  const customer = await ensurePaystackCustomer({
    email: order.customer_email || order.customerEmail,
    firstName: order.customer_name || order.customerName,
    phone: order.customer_phone || order.customerPhone
  });
  if (!customer.ok) return customer;

  const items =
    Array.isArray(lineItems) && lineItems.length
      ? lineItems.map((it) => ({
          name: String(it.name || 'Item').slice(0, 80),
          amount: Math.round(Number(it.price || it.amount || 0) * 100),
          quantity: Math.max(1, Number(it.quantity) || 1)
        }))
      : [{ name: `Zuri order ${String(order.id).slice(0, 8).toUpperCase()}`, amount: amountKobo, quantity: 1 }];

  const description = `${business?.name || 'ZURI'} · #${String(order.id).slice(0, 8).toUpperCase()}`;

  const request = await paystackFetch('/paymentrequest', {
    method: 'POST',
    body: {
      customer: customer.customerCode,
      amount: amountKobo,
      description,
      line_items: items,
      currency: 'NGN',
      metadata: {
        orderId: order.id,
        businessId: business.id || order.business_id,
        zuri_terminal: true,
        custom_fields: [
          {
            display_name: 'Zuri Order',
            variable_name: 'zuri_order_id',
            value: order.id
          }
        ]
      }
    }
  });

  if (!request.ok) {
    return { ok: false, error: request.error || 'Failed to create payment request' };
  }

  const paymentRequestId = request.data?.id;
  const offlineReference = request.data?.offline_reference || request.data?.offlineReference;
  if (!paymentRequestId || !offlineReference) {
    return { ok: false, error: 'Paystack did not return offline_reference' };
  }

  // Optional presence check — non-fatal if it fails
  const presence = await paystackFetch(`/terminal/${encodeURIComponent(terminalId)}/presence`);
  if (presence.ok && presence.data && (presence.data.online === false || presence.data.available === false)) {
    return {
      ok: false,
      error: 'Terminal is offline or busy. Try again when it is free.',
      offlineReference,
      paymentRequestId
    };
  }

  const event = await paystackFetch(`/terminal/${encodeURIComponent(terminalId)}/event`, {
    method: 'POST',
    body: {
      type: 'invoice',
      action: 'process',
      data: {
        id: paymentRequestId,
        reference: offlineReference
      }
    }
  });

  if (!event.ok) {
    return {
      ok: false,
      error: event.error || 'Failed to push payment to Terminal',
      offlineReference,
      paymentRequestId
    };
  }

  return {
    ok: true,
    offlineReference: String(offlineReference),
    paymentRequestId,
    eventId: event.data?.id || null,
    amountKobo
  };
}

module.exports = {
  isTerminalConfigured,
  listTerminals,
  pushOrderPaymentToTerminal,
  ensurePaystackCustomer
};
