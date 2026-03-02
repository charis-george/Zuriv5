const express = require('express');
const router = express.Router();
const Paystack = require('@paystack/paystack-sdk');
const { getDb } = require('../database');
const { agentLog } = require('../debug-log');

const supabase = getDb();
const appPaystack = process.env.PAYSTACK_SECRET_KEY ? new Paystack(process.env.PAYSTACK_SECRET_KEY) : null;

// All order payments go to ZURI's Paystack account; businesses receive payouts via saved bank details.

// Initialize order payment (ZURI's key only)
router.post('/initialize', async (req, res) => {
  try {
    const { email, amount, orderId, businessId, callbackUrl, saveCard } = req.body;
    if (!email || amount == null || !orderId) {
      return res.status(400).json({ error: 'Email, amount, and orderId are required' });
    }

    if (!appPaystack) return res.status(503).json({ error: 'Payment not configured' });

    const amountInKobo = Math.round(Number(amount) * 100);
    const metadata = { orderId };
    if (businessId) metadata.businessId = businessId;
    if (saveCard) metadata.save_card = 'true';

    const response = await appPaystack.transaction.initialize({
      email,
      amount: amountInKobo,
      reference: orderId,
      callback_url: callbackUrl || null,
      metadata
    });

    if (response.status) {
      res.json({
        authorizationUrl: response.data.authorization_url,
        accessCode: response.data.access_code,
        reference: response.data.reference,
        publicKey: process.env.PAYSTACK_PUBLIC_KEY || null
      });
    } else {
      res.status(400).json({ error: 'Failed to initialize payment' });
    }
  } catch (error) {
    console.error('Payment initialization error:', error);
    res.status(500).json({ error: 'Failed to initialize payment' });
  }
});

// Verify order payment (ZURI's key only)
router.get('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    if (!appPaystack) return res.status(503).json({ success: false, message: 'Payment not configured' });

    const response = await appPaystack.transaction.verify({ reference });
    if (!response.status || response.data.status !== 'success') {
      return res.json({ success: false, message: 'Payment not successful' });
    }

    const { data: order } = await supabase.from('orders').select('id, business_id').eq('id', reference).single();
    if (order) {
      await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', reference);
      const auth = response.data.authorization;
      const saveCard = response.data.metadata?.save_card === 'true';
      const businessId = response.data.metadata?.businessId || order.business_id;
      if (saveCard && auth?.authorization_code && businessId && response.data.customer?.email) {
        await supabase.from('saved_cards').upsert({
          email: response.data.customer.email,
          business_id: businessId,
          authorization_code: auth.authorization_code,
          last4: auth.last4,
          card_type: auth.card_type
        }, { onConflict: 'email,business_id' });
      }
    }

    res.json({
      success: true,
      data: {
        reference: response.data.reference,
        amount: response.data.amount / 100,
        status: response.data.status,
        paidAt: response.data.paid_at,
        customer: response.data.customer
      }
    });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ success: false, message: 'Failed to verify payment' });
  }
});

// List saved cards for customer (email + businessId)
router.get('/saved-cards', async (req, res) => {
  try {
    const { email, businessId } = req.query;
    if (!email || !businessId) return res.status(400).json({ error: 'email and businessId required' });
    const { data, error } = await supabase
      .from('saved_cards')
      .select('id, last4, card_type, created_at')
      .eq('email', email)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false });
    if (error) return res.status(500).json({ error: 'Failed to fetch saved cards' });
    res.json(data || []);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch saved cards' });
  }
});

// Charge with saved card (order payment to ZURI's account)
router.post('/charge-saved', async (req, res) => {
  try {
    const { email, businessId, orderId, amount, saved_card_id } = req.body;
    if (!email || !businessId || !orderId || amount == null) {
      return res.status(400).json({ error: 'email, businessId, orderId, and amount are required' });
    }

    const { data: savedCard, error: cardError } = await supabase
      .from('saved_cards')
      .select('authorization_code')
      .eq('id', saved_card_id)
      .eq('email', email)
      .eq('business_id', businessId)
      .single();
    if (cardError || !savedCard?.authorization_code) {
      return res.status(400).json({ error: 'Saved card not found or invalid' });
    }

    if (!appPaystack) return res.status(503).json({ error: 'Payment not configured' });

    const amountInKobo = Math.round(Number(amount) * 100);
    const reference = orderId;

    const response = await appPaystack.transaction.chargeAuthorization({
      email,
      amount: amountInKobo,
      reference,
      authorization_code: savedCard.authorization_code
    });

    if (response.status && response.data.status === 'success') {
      await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', orderId).eq('business_id', businessId);
      res.json({
        success: true,
        data: {
          reference: response.data.reference,
          amount: response.data.amount / 100,
          status: response.data.status
        }
      });
    } else {
      res.status(400).json({ success: false, message: response.data?.message || 'Charge failed' });
    }
  } catch (error) {
    console.error('Charge saved card error:', error);
    res.status(500).json({ error: 'Charge failed' });
  }
});

module.exports = router;
