const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const Paystack = require('@paystack/paystack-sdk');
const { getDb } = require('../database');
const { processOrderPayout, updatePayoutStatusFromWebhook } = require('../lib/paystack-transfer');
const { buildOrderPaymentMetadata, paystackCheckoutExtras } = require('../lib/paystackCheckout');
const { queueOrderReceiptOnce } = require('../lib/orderReceiptEmail');

const supabase = getDb();
const appPaystack = process.env.PAYSTACK_SECRET_KEY ? new Paystack(process.env.PAYSTACK_SECRET_KEY) : null;
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';

// Paystack webhook: verify signature, on charge.success update order and optionally save card.
// Mount this route with express.raw({ type: 'application/json' }) so req.body is the raw Buffer.
router.post('/webhook', (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  if (!signature || !PAYSTACK_SECRET) {
    return res.status(400).send('Missing signature or secret');
  }
  const rawBody = req.body;
  if (!rawBody || !Buffer.isBuffer(rawBody)) {
    return res.status(400).send('Invalid body');
  }
  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET).update(rawBody).digest('hex');
  if (hash !== signature) {
    console.error('Paystack webhook signature mismatch');
    return res.status(401).send('Invalid signature');
  }
  let event;
  try {
    event = JSON.parse(rawBody.toString());
  } catch (e) {
    return res.status(400).send('Invalid JSON');
  }
  if (event.event === 'charge.success' && event.data) {
    const reference = event.data.reference;
    const metadata = event.data.metadata || {};
    const businessId = metadata.businessId;
    const orderId = reference;
    supabase.from('orders').select('id, business_id, total_amount, payment_status').eq('id', orderId).single()
      .then(({ data: order }) => {
        if (!order || order.payment_status === 'paid') {
          res.status(200).json({ received: true });
          return;
        }
        const amountPaid = event.data.amount / 100;
        if (Math.abs(amountPaid - Number(order.total_amount)) > 0.01) {
          console.error('Webhook amount mismatch', { orderId, orderTotal: order.total_amount, paid: amountPaid });
          res.status(200).json({ received: true });
          return;
        }
        return supabase.from('orders').update({ payment_status: 'paid' }).eq('id', orderId)
          .then(() => {
            const auth = event.data.authorization;
            const saveCard = metadata.save_card === 'true';
            const bid = businessId || order.business_id;
            const customerEmail = event.data.customer?.email;
            if (saveCard && auth?.authorization_code && bid && customerEmail) {
              return supabase.from('saved_cards').upsert({
                email: customerEmail,
                business_id: bid,
                authorization_code: auth.authorization_code,
                last4: auth.last4,
                card_type: auth.card_type
              }, { onConflict: 'email,business_id' });
            }
          })
          .then(() => {
            const isTap = metadata.tap === 'true';
            const bid = businessId || order?.business_id;
            if (isTap && bid) {
              const io = req.app.get('io');
              if (io) io.to(`business-${bid}`).emit('tap-payment-success', { orderId });
            }
            res.status(200).json({ received: true });
            setImmediate(() => {
              processOrderPayout(orderId, amountPaid).catch((err) =>
                console.error('Paystack payout error', orderId, err)
              );
            });
            // Send receipt (best-effort) once order is paid.
            queueOrderReceiptOnce({
              orderId,
              paidAt: event.data.paid_at || null,
              reference: reference || orderId
            });
          });
      })
      .catch((err) => {
        console.error('Paystack webhook error:', err);
        res.status(500).json({ received: false });
      });
    return;
  }
  if (event.event === 'transfer.success' && event.data?.reference) {
    updatePayoutStatusFromWebhook(event.data.reference, 'success').catch((err) =>
      console.error('Transfer webhook update error', event.data.reference, err)
    );
    return res.status(200).json({ received: true });
  }
  if (event.event === 'transfer.failed' && event.data?.reference) {
    const message = event.data?.gateway_response || event.data?.reason || 'Transfer failed';
    updatePayoutStatusFromWebhook(event.data.reference, 'failed', message).catch((err) =>
      console.error('Transfer webhook update error', event.data.reference, err)
    );
    return res.status(200).json({ received: true });
  }
  res.status(200).json({ received: true });
});

// Initialize order payment (ZURI's key only)
router.post('/initialize', async (req, res) => {
  try {
    const { email, amount, orderId, businessId, callbackUrl, saveCard, tap } = req.body;
    if (!email || amount == null || !orderId || !businessId) {
      return res.status(400).json({ error: 'Email, amount, orderId, and businessId are required' });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, business_id, total_amount, payment_status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.business_id !== businessId) {
      return res.status(403).json({ error: 'Order does not belong to this business' });
    }
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Order is already paid' });
    }

    const orderTotal = Number(order.total_amount);
    const requestedAmount = Number(amount);
    if (requestedAmount !== orderTotal) {
      return res.status(400).json({ error: `Amount must equal order total (₦${orderTotal.toFixed(2)})` });
    }

    if (!appPaystack) return res.status(503).json({ error: 'Payment not configured' });

    const amountInKobo = Math.round(orderTotal * 100);
    const metadata = buildOrderPaymentMetadata({
      orderId,
      businessId,
      saveCard: !!saveCard,
      tap: !!tap
    });

    const response = await appPaystack.transaction.initialize({
      email,
      amount: amountInKobo,
      reference: orderId,
      callback_url: callbackUrl || null,
      currency: 'NGN',
      metadata,
      ...paystackCheckoutExtras()
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

    const { data: order } = await supabase.from('orders').select('id, business_id, total_amount, payment_status').eq('id', reference).single();
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    const paystackAmountNaira = response.data.amount / 100;
    if (Math.abs(paystackAmountNaira - Number(order.total_amount)) > 0.01) {
      console.error('Payment verify amount mismatch', { reference, orderTotal: order.total_amount, paystackAmount: paystackAmountNaira });
      return res.status(400).json({ success: false, message: 'Payment amount does not match order' });
    }

    if (order.payment_status !== 'paid') {
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
      const isTap = response.data.metadata?.tap === 'true';
      if (isTap && businessId) {
        const io = req.app.get('io');
        if (io) io.to(`business-${businessId}`).emit('tap-payment-success', { orderId: reference });
      }
      setImmediate(() => {
        processOrderPayout(reference, paystackAmountNaira).catch((err) =>
          console.error('Paystack payout error (verify)', reference, err)
        );
      });
      queueOrderReceiptOnce({
        orderId: reference,
        paidAt: response.data.paid_at || null,
        reference: response.data.reference || reference
      });
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
    if (!email || !businessId || !orderId || amount == null || !saved_card_id) {
      return res.status(400).json({ error: 'email, businessId, orderId, amount, and saved_card_id are required' });
    }

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, business_id, total_amount, payment_status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    if (order.business_id !== businessId) {
      return res.status(403).json({ error: 'Order does not belong to this business' });
    }
    if (order.payment_status === 'paid') {
      return res.status(400).json({ error: 'Order is already paid' });
    }

    const orderTotal = Number(order.total_amount);
    const requestedAmount = Number(amount);
    if (Math.abs(requestedAmount - orderTotal) > 0.01) {
      return res.status(400).json({ error: `Amount must equal order total (₦${orderTotal.toFixed(2)})` });
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

    const amountInKobo = Math.round(orderTotal * 100);
    const reference = orderId;

    const response = await appPaystack.transaction.chargeAuthorization({
      email,
      amount: amountInKobo,
      reference,
      authorization_code: savedCard.authorization_code
    });

    if (response.status && response.data.status === 'success') {
      await supabase.from('orders').update({ payment_status: 'paid' }).eq('id', orderId).eq('business_id', businessId);
      queueOrderReceiptOnce({
        orderId,
        paidAt: new Date().toISOString(),
        reference: response.data.reference || orderId
      });
      setImmediate(() => {
        processOrderPayout(orderId, orderTotal).catch((err) =>
          console.error('Paystack payout error (charge-saved)', orderId, err)
        );
      });
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
