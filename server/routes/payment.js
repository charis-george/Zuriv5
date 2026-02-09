const express = require('express');
const router = express.Router();
const Paystack = require('@paystack/paystack-sdk');

const paystack = new Paystack(process.env.PAYSTACK_SECRET_KEY);

// Initialize payment
router.post('/initialize', async (req, res) => {
  try {
    const { email, amount, orderId, metadata } = req.body;

    if (!email || !amount || !orderId) {
      return res.status(400).json({ error: 'Email, amount, and orderId are required' });
    }

    // Convert amount to kobo (Paystack uses smallest currency unit)
    const amountInKobo = Math.round(amount * 100);

    const response = await paystack.transaction.initialize({
      email,
      amount: amountInKobo,
      reference: orderId,
      metadata: {
        orderId,
        ...metadata
      }
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
    console.error('Payment initialization error:', error);
    res.status(500).json({ error: 'Failed to initialize payment' });
  }
});

// Verify payment
router.get('/verify/:reference', async (req, res) => {
  try {
    const { reference } = req.params;

    const response = await paystack.transaction.verify(reference);

    if (response.status && response.data.status === 'success') {
      res.json({
        success: true,
        data: {
          reference: response.data.reference,
          amount: response.data.amount / 100, // Convert from kobo
          status: response.data.status,
          paidAt: response.data.paid_at,
          customer: response.data.customer
        }
      });
    } else {
      res.json({
        success: false,
        message: 'Payment not successful'
      });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Failed to verify payment' });
  }
});

module.exports = router;

