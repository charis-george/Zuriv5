const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { qrToBrandedDataUrl } = require('../lib/brandedQr');
const { requireBusinessAuth } = require('../middleware/auth');
const {
  generateTicketReceiptQrImagePng,
  verifyTicketReceiptQrOnce
} = require('../lib/ticketReceiptQr');
const {
  canAccessGuestAiStorefront,
  GUEST_AI_STOREFRONT_DISABLED,
  canUseStorefrontHeroBanner
} = require('../lib/plans');

const supabase = getDb();

// Generate QR code for business (universal: full URL so phone camera opens menu)
router.get('/generate/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    if (!businessId || typeof businessId !== 'string') {
      return res.status(400).json({ error: 'businessId is required' });
    }
    let baseUrl = req.query.baseUrl || process.env.FRONTEND_URL || 'http://localhost:5173';

    if (typeof baseUrl !== 'string') baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    baseUrl = baseUrl.replace(/\/$/, ''); // no trailing slash
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const businessIdEncoded = encodeURIComponent(businessId);
    // Keep businessId in both path and query so each business has a clearly distinct payload.
    const qrUrl = `${baseUrl}/order/${businessIdEncoded}?biz=${businessIdEncoded}`;

    const qrCodeDataUrl = await qrToBrandedDataUrl(qrUrl, { width: 500, margin: 1, timeoutMs: 12000 });

    // Avoid proxies/CDNs serving a stale QR between different businesses.
    res.set('Cache-Control', 'no-store, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    res.json({
      qrUrl,
      qrCodeDataUrl,
      businessId
    });
  } catch (err) {
    console.error('QR generation error:', err);
    res.status(500).json({ error: 'Failed to generate QR code' });
  }
});

router.get('/ticket-receipt/image/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const qr = await generateTicketReceiptQrImagePng(token);
    if (qr.error) {
      return res.status(404).send('Not found');
    }

    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'private, no-store, max-age=0');
    res.send(qr.pngBuffer);
  } catch (error) {
    console.error('Ticket receipt QR image error:', error);
    res.status(500).send('Failed to generate QR image');
  }
});

router.post('/ticket-receipt/verify', requireBusinessAuth, async (req, res) => {
  try {
    const token = req.body?.token;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'token is required' });
    }

    const result = await verifyTicketReceiptQrOnce(token, req.businessId);
    if (result.ok) {
      return res.json({
        success: true,
        status: 'confirmed',
        order: {
          id: result.order.id,
          customerName: result.order.customer_name || null,
          customerEmail: result.order.customer_email || null,
          totalAmount: Number(result.order.total_amount) || 0,
          createdAt: result.order.created_at || null,
          scannedAt: result.order.ticket_receipt_qr_used_at || null
        },
        business: {
          id: result.business.id,
          name: result.business.name || 'Business'
        }
      });
    }

    if (result.status === 'used') {
      return res.status(409).json({
        success: false,
        status: 'used',
        error: 'This ticket receipt QR has already been used.',
        order: result.order
          ? {
              id: result.order.id,
              customerName: result.order.customer_name || null,
              customerEmail: result.order.customer_email || null,
              totalAmount: Number(result.order.total_amount) || 0,
              createdAt: result.order.created_at || null,
              scannedAt: result.order.ticket_receipt_qr_used_at || null
            }
          : null
      });
    }

    if (result.status === 'wrong_business') {
      return res.status(403).json({
        success: false,
        status: 'wrong_business',
        error: 'This ticket receipt belongs to another business.'
      });
    }

    if (result.status === 'unpaid') {
      return res.status(400).json({
        success: false,
        status: 'unpaid',
        error: 'This order has not been paid yet.'
      });
    }

    return res.status(result.code || 404).json({
      success: false,
      status: result.status || 'invalid',
      error: 'This ticket receipt QR is invalid.'
    });
  } catch (error) {
    console.error('Ticket receipt QR verify error:', error);
    res.status(500).json({ success: false, status: 'error', error: 'Could not verify this ticket receipt right now.' });
  }
});

// Get business public info (for customer ordering page)
router.get('/business/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;

    let business;
    let error;
    ({ data: business, error } = await supabase
      .from('businesses')
      .select('id, name, phone, address, logo_url, plan, storefront_config, storefront_details, business_mode')
      .eq('id', businessId)
      .single());

    if (error && /business_mode/i.test(error.message || '')) {
      ({ data: business, error } = await supabase
        .from('businesses')
        .select('id, name, phone, address, logo_url, plan, storefront_config, storefront_details')
        .eq('id', businessId)
        .single());
    }

    if (error || !business) {
      console.error('Get business public info:', error?.message || error);
      return res.status(404).json({ error: 'Business not found' });
    }

    const plan = business.plan || 'free';
    const guestAi = canAccessGuestAiStorefront(plan);
    const scaleGuestMenuTags =
      guestAi &&
      (plan === 'scale' || plan === 'enterprise' || plan === 'pro' || plan === 'zuri_plus');
    const rawCfg =
      business.storefront_config && typeof business.storefront_config === 'object'
        ? business.storefront_config
        : {};
    const rawDet =
      business.storefront_details && typeof business.storefront_details === 'object'
        ? { ...business.storefront_details }
        : {};

    let storefrontConfig = rawCfg;
    let storefrontDetails = rawDet;
    if (!guestAi) {
      storefrontConfig = { ...rawCfg, aiGuest: { ...GUEST_AI_STOREFRONT_DISABLED } };
      if (storefrontDetails.menuTranslations) {
        const { menuTranslations: _omit, ...rest } = storefrontDetails;
        storefrontDetails = rest;
      }
    }

    if (!canUseStorefrontHeroBanner(plan)) {
      storefrontConfig = { ...storefrontConfig };
      delete storefrontConfig.heroBannerUrl;
    }

    res.json({
      id: business.id,
      name: business.name,
      phone: business.phone,
      address: business.address,
      logoUrl: business.logo_url || null,
      storefrontConfig,
      storefrontDetails,
      businessMode: business.business_mode || 'menu',
      scaleGuestMenuTags
    });
  } catch (error) {
    console.error('Get business info error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
