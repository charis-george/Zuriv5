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
 * @param {{ orderId: string, businessId: string, saveCard?: boolean, tap?: boolean }} p
 */
function buildOrderPaymentMetadata(p) {
  const { orderId, businessId, saveCard, tap } = p;
  const origin = primaryFrontendOrigin();
  const meta = {
    orderId,
    businessId,
    custom_fields: [
      { display_name: 'Service', variable_name: 'zuri_service', value: 'ZURI' },
      { display_name: 'Order ref', variable_name: 'zuri_order', value: String(orderId).slice(0, 12) }
    ]
  };
  if (saveCard) meta.save_card = 'true';
  if (tap) meta.tap = 'true';
  if (origin) {
    meta.cancel_action = `${origin}/order/${encodeURIComponent(businessId)}?payment=cancelled`;
  }
  return meta;
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

module.exports = {
  primaryFrontendOrigin,
  buildOrderPaymentMetadata,
  buildSubscriptionPaymentMetadata,
  paystackCheckoutExtras,
  ZURI_PAYSTACK_BRAND
};
