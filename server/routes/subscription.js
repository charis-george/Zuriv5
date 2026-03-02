const express = require('express');
const router = express.Router();
const Paystack = require('@paystack/paystack-sdk');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database');
const { getPlanAmountNg } = require('../lib/plans');

const supabase = getDb();
const paystack = process.env.PAYSTACK_SECRET_KEY ? new Paystack(process.env.PAYSTACK_SECRET_KEY) : null;

// Initialize tier upgrade payment (money to ZURI)
router.post('/initialize', async (req, res) => {
  try {
    const { businessId, plan, email, callbackUrl, interval } = req.body;
    const billingInterval = interval === 'yearly' ? 'yearly' : 'monthly';
    const amount = getPlanAmountNg(plan, billingInterval);
    if (!businessId || !plan || !amount || !email) {
      return res.status(400).json({ error: 'businessId, plan, and email are required' });
    }
    if (!paystack) return res.status(503).json({ error: 'Payment not configured' });

    const reference = `upgrade_${uuidv4()}`;
    const amountInKobo = amount * 100;

    const { error: insertErr } = await supabase.from('subscription_payments').insert({
      reference,
      business_id: businessId,
      plan,
      amount_kobo: amountInKobo,
      status: 'pending'
    });
    if (insertErr) return res.status(500).json({ error: 'Failed to create payment' });

    const response = await paystack.transaction.initialize({
      email,
      amount: amountInKobo,
      reference,
      callback_url: callbackUrl || null,
      metadata: { type: 'plan_upgrade', businessId, plan, interval: billingInterval }
    });

    if (response.status) {
      res.json({
        authorizationUrl: response.data.authorization_url,
        accessCode: response.data.access_code,
        reference: response.data.reference
      });
    } else {
      res.status(400).json({ error: 'Failed to initialize payment' });
    }
  } catch (error) {
    console.error('Subscription initialize error:', error);
    res.status(500).json({ error: 'Failed to initialize payment' });
  }
});

// Verify tier upgrade and activate plan
router.get('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    if (!reference.startsWith('upgrade_') || !paystack) {
      return res.json({ success: false, message: 'Invalid or payment not configured' });
    }

    const response = await paystack.transaction.verify({ reference });
    if (!response.status || response.data.status !== 'success') {
      return res.json({ success: false, message: 'Payment not successful' });
    }

    const { data: sub } = await supabase
      .from('subscription_payments')
      .select('id, business_id, plan')
      .eq('reference', reference)
      .single();
    if (!sub) return res.json({ success: false, message: 'Payment record not found' });

    await supabase.from('subscription_payments').update({
      status: 'success',
      paystack_reference: response.data.reference
    }).eq('id', sub.id);

    await supabase.from('businesses').update({ plan: sub.plan }).eq('id', sub.business_id);

    res.json({
      success: true,
      plan: sub.plan,
      data: {
        reference: response.data.reference,
        amount: response.data.amount / 100
      }
    });
  } catch (error) {
    console.error('Subscription verify error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
});

module.exports = router;
