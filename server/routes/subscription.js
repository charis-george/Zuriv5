const express = require('express');
const crypto = require('crypto');
const Paystack = require('@paystack/paystack-sdk');
const { getDb } = require('../database');
const { requireBusinessAuth } = require('../middleware/auth');
const { normalizeProvider } = require('../lib/paymentProvider');
const { initializeSubscriptionPayment } = require('../lib/paymentInitialize');
const { normalizePaystackSdkError } = require('../lib/paystackErrorUtil');
const {
  isMonnifyConfigured,
  getTransactionByPaymentReference,
  isPaidTransaction,
  parseMonnifyReturnRefs
} = require('../lib/monnify');
const {
  activateSubscriptionFromCharge,
  activateSubscriptionFromMonnify,
  normalizeMetadata,
  subReferenceMatchesBusiness
} = require('../lib/subscriptionActivate');
const { amountNairaFor } = require('../lib/subscriptionPlans');
const {
  cancelBusinessSubscription,
  getSubscriptionStatus,
  getManagePaymentUrlForBusiness,
  recurringEnabled
} = require('../lib/paystack-subscription');

const router = express.Router();
const supabase = getDb();
const appPaystack = process.env.PAYSTACK_SECRET_KEY ? new Paystack(process.env.PAYSTACK_SECRET_KEY) : null;

const INITIALIZE_PLANS = new Set(['starter', 'growth', 'scale']);

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
      .select('id, email, name, payment_provider')
      .eq('id', businessId)
      .single();

    if (error || !business) {
      return res.status(422).json({
        error: 'Business not found for this account. Log out and sign in again, or contact support.',
        code: 'BUSINESS_NOT_FOUND'
      });
    }

    const payEmail = String((business.email || email || '').trim());
    if (!payEmail) {
      return res.status(400).json({ error: 'Business email required for payment' });
    }

    const reference = `sub_${businessId.replace(/-/g, '').slice(0, 12)}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const paymentProvider = normalizeProvider(business.payment_provider);

    await supabase
      .from('businesses')
      .update({ subscription_interval: billing })
      .eq('id', businessId);

    const payload = await initializeSubscriptionPayment({
      email: payEmail,
      reference,
      amountNaira,
      businessId,
      plan,
      billing,
      callbackUrl,
      paymentProvider,
      customerName: business.name || 'Business'
    });

    return res.json({
      ...payload,
      recurring: payload.recurring ?? (paymentProvider === 'paystack' && recurringEnabled())
    });
  } catch (err) {
    console.error('Subscription initialize error:', err);
    const normalized = normalizePaystackSdkError(err);
    const status = normalized ? normalized.status : (err.code === 'MONNIFY_AUTH_FAILED' ? 502 : (err.status || 500));
    return res.status(status).json({
      error: normalized?.message || err.message || 'Failed to initialize subscription payment',
      code: normalized?.code || err.code || undefined
    });
  }
});

function subscriptionVerifyCandidates(rawReference) {
  const parsed = parseMonnifyReturnRefs(rawReference);
  return [...new Set(
    [parsed.orderId, parsed.monnifyPaymentReference, parsed.raw, rawReference]
      .map((r) => (r ? String(r).trim() : ''))
      .filter(Boolean)
  )];
}

router.get('/verify/:reference', async (req, res) => {
  try {
    const rawReference = String(req.params.reference || '').trim();
    if (!rawReference) {
      return res.json({ success: false, message: 'Missing payment reference' });
    }

    const candidates = subscriptionVerifyCandidates(rawReference);
    const subReference = candidates.find((r) => r.startsWith('sub_'));

    if (isMonnifyConfigured() && subReference) {
      const tx = await getTransactionByPaymentReference(subReference);
      if (tx && isPaidTransaction(tx)) {
        const result = await activateSubscriptionFromMonnify(tx);
        if (result.ok) {
          return res.json({ success: true, plan: result.plan, message: result.message || 'Subscription activated' });
        }
      }
    }

    if (!appPaystack) {
      return res.status(503).json({ success: false, message: 'Payment not configured' });
    }

    let lastMessage = 'Payment not successful';
    for (const reference of candidates) {
      let response;
      try {
        response = await appPaystack.transaction.verify({ reference });
      } catch (verifyErr) {
        console.warn('Paystack verify attempt failed', reference, verifyErr?.message || verifyErr);
        continue;
      }

      if (!response?.status || !response?.data) continue;

      const charge = response.data;
      if (charge.status === 'pending' || charge.status === 'processing') {
        lastMessage = 'Payment is still processing. Please wait a moment and refresh.';
        continue;
      }
      if (charge.status !== 'success') continue;

      const result = await activateSubscriptionFromCharge(charge);
      if (result.ok) {
        return res.json({
          success: true,
          plan: result.plan,
          message: result.message || 'Subscription activated',
          reference: charge.reference || reference
        });
      }
      lastMessage = result.message || lastMessage;
      console.warn('Subscription activate failed', {
        reference: charge.reference || reference,
        message: result.message,
        metadata: charge.metadata
      });
    }

    return res.json({ success: false, message: lastMessage });
  } catch (err) {
    console.error('Subscription verify error:', err);
    return res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
});

/** When redirect drops ?reference=, recover the latest successful sub_* charge for this business. */
router.get('/recover', requireBusinessAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const { data: business, error } = await supabase
      .from('businesses')
      .select('id, email, plan, payment_provider')
      .eq('id', businessId)
      .single();

    if (error || !business) {
      return res.status(404).json({ success: false, message: 'Business not found' });
    }

    const provider = normalizeProvider(business.payment_provider);
    if (provider === 'monnify') {
      return res.json({
        success: false,
        message: 'Missing payment reference. If you were charged, open Payment & pricing from your dashboard — your plan may already be active.'
      });
    }

    if (!appPaystack) {
      return res.status(503).json({ success: false, message: 'Payment not configured' });
    }

    const queryRef = String(req.query?.reference || '').trim();
    if (queryRef) {
      const verifyRes = await appPaystack.transaction.verify({ reference: queryRef });
      if (verifyRes?.status && verifyRes?.data?.status === 'success') {
        const result = await activateSubscriptionFromCharge(verifyRes.data);
        if (result.ok) {
          return res.json({
            success: true,
            plan: result.plan,
            reference: queryRef,
            message: 'Subscription activated',
            recovered: true
          });
        }
      }
    }

    const listRes = await appPaystack.transaction.list({ perPage: 50, status: 'success' });
    const rows = Array.isArray(listRes?.data)
      ? listRes.data
      : (Array.isArray(listRes?.data?.data) ? listRes.data.data : []);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;

    const candidate = rows.find((tx) => {
      const ref = String(tx?.reference || '');
      if (!ref.startsWith('sub_') || tx?.status !== 'success') return false;
      if (!subReferenceMatchesBusiness(ref, businessId)) return false;
      const paidAt = tx?.paid_at || tx?.paidAt || tx?.transaction_date;
      if (paidAt) {
        const t = new Date(paidAt).getTime();
        if (!Number.isNaN(t) && t < cutoff) return false;
      }
      const meta = normalizeMetadata(tx?.metadata);
      return meta.type === 'subscription' || meta.plan || ref.startsWith('sub_');
    });

    if (!candidate?.reference) {
      return res.json({
        success: false,
        message: 'Missing payment reference. If you were charged, open Payment & pricing from your dashboard — your plan may already be active.'
      });
    }

    const verifyRes = await appPaystack.transaction.verify({ reference: candidate.reference });
    if (!verifyRes?.status || !verifyRes?.data) {
      return res.json({ success: false, message: 'Payment not successful' });
    }

    const result = await activateSubscriptionFromCharge(verifyRes.data);
    if (!result.ok) {
      return res.json({ success: false, message: result.message || 'Payment not successful' });
    }

    return res.json({
      success: true,
      plan: result.plan,
      reference: candidate.reference,
      message: 'Subscription activated',
      recovered: true
    });
  } catch (err) {
    console.error('Subscription recover error:', err);
    return res.status(500).json({ success: false, message: 'Failed to recover payment' });
  }
});

router.get('/status', requireBusinessAuth, async (req, res) => {
  try {
    const status = await getSubscriptionStatus(req.businessId);
    if (!status) return res.status(404).json({ error: 'Business not found' });
    return res.json(status);
  } catch (err) {
    console.error('Subscription status error:', err);
    return res.status(500).json({ error: 'Failed to load subscription status' });
  }
});

/** Paystack hosted page to update subscription card on file */
router.get('/manage-payment-link', requireBusinessAuth, async (req, res) => {
  try {
    const result = await getManagePaymentUrlForBusiness(req.businessId);
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({ link: result.link });
  } catch (err) {
    console.error('Manage payment link error:', err);
    return res.status(500).json({ error: 'Failed to get manage payment link' });
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

    const result = await cancelBusinessSubscription(businessId);
    if (!result.ok) {
      return res.status(400).json({ error: result.error || 'Failed to cancel subscription' });
    }

    return res.json({
      success: true,
      plan: result.plan || undefined,
      message: result.message
    });
  } catch (err) {
    console.error('Subscription cancel error:', err);
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

module.exports = router;
