/**
 * Shared Paystack checkout hints (metadata + ZURI brand).
 * Inline checkout uses access_code; iframe colours also need Paystack Dashboard → Settings → Branding:
 *   Primary #ffbd59, accent #ffcd1c, logo https://zuriqo.com/ZURI.png
 */

const ZURI_PAYSTACK_BRAND = {
  primary: process.env.PAYSTACK_BRAND_PRIMARY || '#ffbd59',
  accent: process.env.PAYSTACK_BRAND_ACCENT || '#ffcd1c',
  label: process.env.PAYSTACK_BRAND_LABEL || 'ZURI',
  logoUrl: process.env.PAYSTACK_BRAND_LOGO_URL || 'https://zuriqo.com/ZURI.png'
};

function primaryFrontendOrigin() {
  const raw = process.env.FRONTEND_URL || '';
  const first = raw.split(',')[0].trim();
  if (first && /^https?:\/\//i.test(first)) return first.replace(/\/$/, '');
  return null;
}

function originFromCallbackUrl(callbackUrl) {
  if (!callbackUrl || typeof callbackUrl !== 'string') return null;
  try {
    return new URL(callbackUrl).origin.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/**
 * @param {{ orderId: string, businessId: string, saveCard?: boolean, tap?: boolean, paymentMethod?: string }} p
 */
function buildOrderPaymentMetadata(p) {
  const { orderId, businessId, saveCard, tap, paymentMethod } = p;
  const origin = primaryFrontendOrigin();
  const customFields = [
    { display_name: 'Service', variable_name: 'zuri_service', value: 'ZURI' },
    { display_name: 'Order ref', variable_name: 'zuri_order', value: String(orderId).slice(0, 12) }
  ];
  if (paymentMethod === 'split') {
    customFields.push({ display_name: 'Payment type', variable_name: 'payment_method', value: 'split' });
  }
  const meta = {
    orderId,
    businessId,
    custom_fields: customFields
  };
  if (saveCard) meta.save_card = 'true';
  if (tap) meta.tap = 'true';
  if (paymentMethod === 'split') meta.paymentMethod = 'split';
  if (origin) {
    meta.cancel_action = `${origin}/order/${encodeURIComponent(businessId)}?payment=cancelled`;
  }
  return meta;
}

/** Read split vs transfer from Paystack transaction metadata (webhook / verify). */
function parsePaymentMethodFromPaystackMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') return undefined;
  if (metadata.paymentMethod === 'split') return 'split';
  const fields = metadata.custom_fields;
  if (Array.isArray(fields)) {
    const hit = fields.find((f) => f?.variable_name === 'payment_method' && String(f?.value).toLowerCase() === 'split');
    if (hit) return 'split';
  }
  return undefined;
}

/**
 * @param {{ businessId: string, plan: string, billing: string, callbackUrl?: string | null }} p
 */
function buildSubscriptionPaymentMetadata(p) {
  const { businessId, plan, billing, callbackUrl } = p;
  const origin = primaryFrontendOrigin() || originFromCallbackUrl(callbackUrl);
  const meta = {
    businessId,
    plan,
    interval: billing,
    type: 'subscription',
    custom_fields: [
      { display_name: 'Service', variable_name: 'zuri_service', value: 'ZURI' },
      { display_name: 'Plan', variable_name: 'zuri_plan', value: String(plan) },
      { display_name: 'Billing', variable_name: 'zuri_billing', value: billing === 'yearly' ? 'Yearly' : 'Monthly' }
    ]
  };
  if (origin && businessId) {
    meta.cancel_action = `${origin}/business/dashboard/${encodeURIComponent(businessId)}/payment?upgrade=cancelled`;
  }
  return meta;
}

function paystackCheckoutExtras() {
  return {
    label: ZURI_PAYSTACK_BRAND.label
  };
}

/** Unique per checkout attempt — Paystack rejects duplicate reference. */
function buildPaystackPaymentReference(orderId) {
  const compact = String(orderId || '').replace(/-/g, '').slice(0, 16);
  const stamp = Date.now().toString(36);
  return `zuri_ps_${compact}_${stamp}`.slice(0, 64);
}

/** Build Monnify redirect from FRONTEND_URL (preferred) or client callback. */
function buildMonnifyRedirectUrl(_orderOrRefId, clientCallbackUrl, path = 'payment-done') {
  const origin = primaryFrontendOrigin() || originFromCallbackUrl(clientCallbackUrl);
  if (origin) {
    // No query string — Monnify appends ?paymentReference= and corrupts ?reference= values.
    return `${origin.replace(/\/$/, '')}/${path}`;
  }
  if (clientCallbackUrl) {
    try {
      const url = new URL(clientCallbackUrl);
      url.search = '';
      url.hash = '';
      return url.toString();
    } catch {
      return String(clientCallbackUrl).split('?')[0].split('#')[0];
    }
  }
  return null;
}

/** Ensure Paystack redirect back to our SPA always includes the transaction reference. */
function withReferenceOnCallback(callbackUrl, reference) {
  if (!callbackUrl || typeof callbackUrl !== 'string' || !reference) return callbackUrl || null;
  try {
    const url = new URL(callbackUrl);
    if (!url.searchParams.get('reference') && !url.searchParams.get('trxref')) {
      url.searchParams.set('reference', String(reference));
    }
    return url.toString();
  } catch {
    const sep = callbackUrl.includes('?') ? '&' : '?';
    return `${callbackUrl}${sep}reference=${encodeURIComponent(String(reference))}`;
  }
}

module.exports = {
  primaryFrontendOrigin,
  buildMonnifyRedirectUrl,
  buildOrderPaymentMetadata,
  buildSubscriptionPaymentMetadata,
  buildPaystackPaymentReference,
  parsePaymentMethodFromPaystackMetadata,
  paystackCheckoutExtras,
  withReferenceOnCallback,
  ZURI_PAYSTACK_BRAND
};
