const express = require('express');
const crypto = require('crypto');
const Paystack = require('@paystack/paystack-sdk');
const { getDb } = require('../database');
const { requireBusinessAuth } = require('../middleware/auth');

const router = express.Router();
const supabase = getDb();
const appPaystack = process.env.PAYSTACK_SECRET_KEY ? new Paystack(process.env.PAYSTACK_SECRET_KEY) : null;
const { buildSubscriptionPaymentMetadata, paystackCheckoutExtras } = require('../lib/paystackCheckout');

/** Naira amounts — must match client PLAN_PRICES / PLAN_PRICES_YEARLY */
const PLAN_AMOUNTS_MONTHLY = {
  starter: 9900,
  growth: 24900,
  scale: 59900,
  /** Legacy verification only */
  pro: 40000,
  zuri_plus: 60000
};

const PLAN_AMOUNTS_YEARLY = {
  starter: 95040,
  growth: 239040,
  scale: 575040,
  pro: 384000,
  zuri_plus: 576000
};

const INITIALIZE_PLANS = new Set(['starter', 'growth', 'scale']);
const VERIFY_PLANS = new Set(['starter', 'growth', 'scale', 'pro', 'zuri_plus']);

function amountNairaFor(plan, interval) {
  const table = interval === 'yearly' ? PLAN_AMOUNTS_YEARLY : PLAN_AMOUNTS_MONTHLY;
  return table[plan] || 0;
}

function normalizeMetadata(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) out[k] = '';
    else if (typeof v === 'object') out[k] = v;
    else out[k] = String(v);
  }
  return out;
}

router.post('/initialize', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId, plan, email, callbackUrl, interval } = req.body || {};
    if (!businessId || !plan) {
      return res.status(400).json({ error: 'businessId and plan are required' });
    }
    if (req.businessId !== businessId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (!INITIALIZE_PLANS.has(plan)) {
      return res.status(400).json({ error: 'Invalid plan' });
    }

    const billing = interval === 'yearly' ? 'yearly' : 'monthly';
    const amountNaira = amountNairaFor(plan, billing);
    if (!amountNaira) {
      return res.status(400).json({ error: 'Invalid billing amount' });
    }

    const { data: business, error } = await supabase
      .from('businesses')
      .select('id, email')
      .eq('id', businessId)
      .single();

    if (error || !business) {
      // 422 (not 404) so clients and DevTools don’t confuse this with a missing HTTP route
      return res.status(422).json({
        error: 'Business not found for this account. Log out and sign in again, or contact support.',
        code: 'BUSINESS_NOT_FOUND'
      });
    }

    const payEmail = String((business.email || email || '').trim());
    if (!payEmail) {
      return res.status(400).json({ error: 'Business email required for payment' });
    }

    if (!appPaystack) {
      return res.status(503).json({ error: 'Payment not configured' });
    }

    const reference = `sub_${businessId.replace(/-/g, '').slice(0, 12)}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const amountInKobo = Math.round(amountNaira * 100);

    const metadata = buildSubscriptionPaymentMetadata({
      businessId,
      plan,
      billing,
      callbackUrl: callbackUrl || null
    });

    const response = await appPaystack.transaction.initialize({
      email: payEmail,
      amount: amountInKobo,
      reference,
      callback_url: callbackUrl || null,
      currency: 'NGN',
      metadata,
      ...paystackCheckoutExtras()
    });

    if (response.status && response.data) {
      return res.json({
        authorizationUrl: response.data.authorization_url,
        accessCode: response.data.access_code,
        reference: response.data.reference,
        publicKey: process.env.PAYSTACK_PUBLIC_KEY || null
      });
    }
    return res.status(400).json({ error: 'Failed to initialize payment' });
  } catch (err) {
    console.error('Subscription initialize error:', err);
    return res.status(500).json({ error: 'Failed to initialize subscription payment' });
  }
});

router.get('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    if (!reference || !String(reference).startsWith('sub_')) {
      return res.status(400).json({ success: false, message: 'Invalid subscription reference' });
    }

    if (!appPaystack) {
      return res.status(503).json({ success: false, message: 'Payment not configured' });
    }

    const response = await appPaystack.transaction.verify({ reference });
    if (!response.status || !response.data || response.data.status !== 'success') {
      return res.json({ success: false, message: 'Payment not successful' });
    }

    const meta = normalizeMetadata(response.data.metadata);
    if (meta.type !== 'subscription') {
      return res.json({ success: false, message: 'Not a subscription payment' });
    }

    const businessId = meta.businessId;
    const plan = meta.plan;
    const billing = meta.interval === 'yearly' ? 'yearly' : 'monthly';

    if (!businessId || !plan || !VERIFY_PLANS.has(plan)) {
      return res.json({ success: false, message: 'Invalid subscription data' });
    }

    const expected = amountNairaFor(plan, billing);
    const paid = Number(response.data.amount) / 100;
    if (!expected || Math.abs(paid - expected) > 0.02) {
      console.error('Subscription verify amount mismatch', { reference, expected, paid, plan, billing });
      return res.json({ success: false, message: 'Payment amount does not match plan' });
    }

    const { error: upErr } = await supabase.from('businesses').update({ plan }).eq('id', businessId);
    if (upErr) {
      console.error('Subscription verify DB error:', upErr);
      return res.status(500).json({ success: false, message: 'Failed to update subscription' });
    }

    return res.json({ success: true, plan, message: 'Subscription activated' });
  } catch (err) {
    console.error('Subscription verify error:', err);
    return res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
});

router.post('/cancel', requireBusinessAuth, async (req, res) => {
  try {
    const { businessId } = req.body || {};
    if (!businessId || typeof businessId !== 'string') {
      return res.status(400).json({ error: 'businessId is required' });
    }
    if (req.businessId !== businessId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { data: business, error: fetchErr } = await supabase
      .from('businesses')
      .select('id, plan')
      .eq('id', businessId)
      .single();
    if (fetchErr || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    if (!business.plan || business.plan === 'free') {
      return res.json({ success: true, plan: 'free', message: 'Your plan is already Free.' });
    }

    const { error: upErr } = await supabase
      .from('businesses')
      .update({ plan: 'free' })
      .eq('id', businessId);
    if (upErr) {
      console.error('Subscription cancel DB error:', upErr);
      return res.status(500).json({ error: 'Failed to cancel subscription' });
    }

    return res.json({ success: true, plan: 'free', message: 'Subscription cancelled. Your account is now on the Free plan.' });
  } catch (err) {
    console.error('Subscription cancel error:', err);
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

module.exports = router;
