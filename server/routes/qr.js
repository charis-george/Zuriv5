const express = require('express');
const router = express.Router();
const { getDb } = require('../database');
const { summarizeUpstreamError } = require('../lib/supabaseResilience');
const {
  PUBLIC_TTL_MS,
  getCachedPublicBusiness,
  setCachedPublicBusiness
} = require('../lib/publicReadCache');
const { qrToBrandedDataUrl } = require('../lib/brandedQr');
const { requireBusinessAuth, requireBusinessOrScannerAuth, signScannerToken } = require('../middleware/auth');
const {
  generateTicketReceiptQrImagePng,
  verifyTicketReceiptQrOnce,
  resolveTicketTypeLabel
} = require('../lib/ticketReceiptQr');
const {
  canAccessGuestAiStorefront,
  GUEST_AI_STOREFRONT_DISABLED,
  canUseStorefrontHeroBanner,
  canAccessAnalytics
} = require('../lib/plans');
const { canAcceptOrders, statusMessage, normalizeAccountStatus } = require('../lib/businessStatus');
const {
  normalizeStorefrontProfiles,
  findProfileBySlugOrId,
  findProfileForEvent,
  getDefaultProfile
} = require('../lib/storefrontProfiles');
const {
  createScannerAccessCode,
  listScannerAccessCodes,
  revokeScannerAccessCode,
  redeemScannerAccessCode,
  normalizeCodeInput,
  CODE_LENGTH,
  MAX_CODES_PER_BUSINESS
} = require('../lib/scannerAccessCodes');
const { normalizeUuid } = require('../lib/normalizeUuid');

function db() {
  return getDb();
}

// Generate QR code for business (universal: full URL so phone camera opens menu)
router.get('/generate/:businessId', async (req, res) => {
  try {
    const businessId = normalizeUuid(req.params.businessId) || req.params.businessId;
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

router.post('/ticket-receipt/verify', requireBusinessOrScannerAuth, async (req, res) => {
  try {
    if (req.isScannerSession && req.scannerCodeId) {
      const { data: activeCode, error: codeError } = await db()
        .from('scanner_access_codes')
        .select('id')
        .eq('id', req.scannerCodeId)
        .eq('business_id', req.businessId)
        .is('revoked_at', null)
        .maybeSingle();

      if (codeError || !activeCode) {
        return res.status(401).json({
          success: false,
          status: 'revoked',
          error: 'Scanner access was revoked. Ask your organizer for a new access code.'
        });
      }
    }

    const token = req.body?.token;
    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'token is required' });
    }

    const result = await verifyTicketReceiptQrOnce(token, req.businessId);
    const scannedAt =
      result.ticket?.usedAt || result.order?.ticket_receipt_qr_used_at || null;
    const ticketNumber = result.ticket?.ticketNumber ?? (result.order ? 1 : null);
    const ticketTypeName = result.order?.id && ticketNumber
      ? await resolveTicketTypeLabel(result.order.id, ticketNumber)
      : null;

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
          scannedAt
        },
        ticket: result.ticket
          ? {
              number: result.ticket.ticketNumber,
              typeName: ticketTypeName,
              scannedAt: result.ticket.usedAt || scannedAt
            }
          : ticketTypeName
            ? { number: null, typeName: ticketTypeName, scannedAt }
            : null,
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
              scannedAt
            }
          : null,
        ticket: result.ticket
          ? {
              number: result.ticket.ticketNumber,
              typeName: ticketTypeName,
              scannedAt: result.ticket.usedAt || scannedAt
            }
          : ticketTypeName
            ? { number: null, typeName: ticketTypeName, scannedAt }
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

router.get('/scanner-codes', requireBusinessAuth, async (req, res) => {
  try {
    const codes = await listScannerAccessCodes(req.businessId);
    const connectUrl = `${(process.env.FRONTEND_URL || 'https://zuriqo.com').replace(/\/$/, '')}/scan/connect`;
    res.json({ codes, connectUrl, codeLength: CODE_LENGTH, maxCodes: MAX_CODES_PER_BUSINESS });
  } catch (error) {
    console.error('List scanner codes error:', error);
    res.status(500).json({ error: 'Could not load scanner access codes.' });
  }
});

router.post('/scanner-codes', requireBusinessAuth, async (req, res) => {
  try {
    const { data: business, error: bizError } = await db()
      .from('businesses')
      .select('id, business_mode')
      .eq('id', req.businessId)
      .maybeSingle();

    if (bizError || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }
    if (business.business_mode !== 'ticketing') {
      return res.status(400).json({ error: 'Scanner access codes are for ticketing accounts only.' });
    }

    const created = await createScannerAccessCode(req.businessId, req.body?.label);
    const connectUrl = `${(process.env.FRONTEND_URL || 'https://zuriqo.com').replace(/\/$/, '')}/scan/connect`;
    res.status(201).json({
      ...created,
      connectUrl,
      message: 'Share this code with staff. It only allows ticket scanning — not dashboard access.'
    });
  } catch (error) {
    if (error.code === 'LIMIT_REACHED') {
      return res.status(400).json({ error: error.message });
    }
    console.error('Create scanner code error:', error);
    res.status(500).json({ error: 'Could not create scanner access code.' });
  }
});

router.delete('/scanner-codes/:codeId', requireBusinessAuth, async (req, res) => {
  try {
    const revoked = await revokeScannerAccessCode(req.businessId, req.params.codeId);
    if (!revoked) {
      return res.status(404).json({ error: 'Scanner code not found or already revoked.' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Revoke scanner code error:', error);
    res.status(500).json({ error: 'Could not revoke scanner access code.' });
  }
});

router.post('/scanner-codes/redeem', async (req, res) => {
  try {
    const raw = req.body?.code;
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'Access code is required.' });
    }
    const normalized = normalizeCodeInput(raw);
    if (normalized.length !== CODE_LENGTH) {
      return res.status(400).json({ error: `Enter a ${CODE_LENGTH}-character access code.` });
    }

    const redeemed = await redeemScannerAccessCode(normalized);
    if (!redeemed) {
      return res.status(404).json({ error: 'Invalid or revoked access code.' });
    }
    if (redeemed.businessMode !== 'ticketing') {
      return res.status(400).json({ error: 'This access code is not valid for ticket scanning.' });
    }

    const token = signScannerToken(redeemed.businessId, redeemed.codeId);
    res.json({
      success: true,
      token,
      businessId: redeemed.businessId,
      businessName: redeemed.businessName,
      scope: 'scanner',
      expiresInDays: 30
    });
  } catch (error) {
    console.error('Redeem scanner code error:', error);
    res.status(500).json({ error: 'Could not connect scanner. Try again.' });
  }
});

// Get business public info (for customer ordering page)
router.get('/business/:businessId', async (req, res) => {
  try {
    const businessId = normalizeUuid(req.params.businessId) || req.params.businessId;
    const storefrontSlug = String(req.query.storefront || req.query.storefrontSlug || '').trim();
    const eventSlug = String(req.query.event || req.query.eventSlug || '').trim();
    const cacheParts = { storefront: storefrontSlug, event: eventSlug };

    const cached = getCachedPublicBusiness(businessId, cacheParts);
    if (cached) {
      res.set('Cache-Control', `public, max-age=${Math.floor(PUBLIC_TTL_MS / 1000)}, stale-while-revalidate=60`);
      res.set('X-Zuri-Cache', 'HIT');
      return res.json(cached);
    }

    let business;
    let error;
    ({ data: business, error } = await db()
      .from('businesses')
      .select('id, name, phone, address, logo_url, plan, storefront_config, storefront_details, storefront_profiles, business_mode, account_status, payment_provider, public_slug')
      .eq('id', businessId)
      .maybeSingle());

    if (error && /storefront_profiles|business_mode|account_status|payment_provider|public_slug/i.test(error.message || '')) {
      ({ data: business, error } = await db()
        .from('businesses')
        .select('id, name, phone, address, logo_url, plan, storefront_config, storefront_details, business_mode')
        .eq('id', businessId)
        .maybeSingle());
    }

    if (error || !business) {
      console.error('Get business public info:', summarizeUpstreamError(error));
      return res.status(404).json({ error: 'Business not found' });
    }

    if (!canAcceptOrders(business.account_status)) {
      return res.status(403).json({
        error: statusMessage(business.account_status) || 'This venue is unavailable',
        accountStatus: normalizeAccountStatus(business.account_status)
      });
    }

    const plan = business.plan || 'free';
    const guestAi = canAccessGuestAiStorefront(plan);
    const scaleGuestMenuTags =
      guestAi &&
      (plan === 'scale' || plan === 'enterprise' || plan === 'pro' || plan === 'zuri_plus');

    const profiles = normalizeStorefrontProfiles(business);
    let activeProfile =
      (eventSlug ? findProfileForEvent(profiles, eventSlug)?.profile : null) ||
      findProfileBySlugOrId(profiles, storefrontSlug) ||
      getDefaultProfile(profiles);

    const rawCfg =
      activeProfile?.config && typeof activeProfile.config === 'object'
        ? activeProfile.config
        : business.storefront_config && typeof business.storefront_config === 'object'
          ? business.storefront_config
          : {};
    const rawDet =
      activeProfile?.details && typeof activeProfile.details === 'object'
        ? { ...activeProfile.details }
        : business.storefront_details && typeof business.storefront_details === 'object'
          ? { ...business.storefront_details }
          : {};

    let storefrontConfig = rawCfg;
    let storefrontDetails = rawDet;

    const placeholderTagline = /^fresh,?\s*fast,?\s*and\s*loved\s*by\s*locals\.?$/i;
    if (placeholderTagline.test(String(storefrontDetails.tagline || '').trim())) {
      storefrontDetails = { ...storefrontDetails, tagline: '' };
    }

    // Customization (taglines, hero, AI personalization) unlocks on Growth+
    if (!canAccessAnalytics(plan)) {
      storefrontDetails = { ...storefrontDetails, tagline: '' };
      storefrontConfig = { ...storefrontConfig, aiGuest: { ...GUEST_AI_STOREFRONT_DISABLED } };
      delete storefrontConfig.heroBannerUrl;
    } else if (!guestAi) {
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

    const payload = {
      id: business.id,
      name: business.name,
      phone: business.phone,
      address: business.address,
      logoUrl: business.logo_url || null,
      publicSlug: business.public_slug || null,
      storefrontConfig,
      storefrontDetails,
      storefrontProfiles: profiles,
      activeStorefrontId: activeProfile?.id || null,
      activeStorefrontSlug: activeProfile?.slug || null,
      businessMode: business.business_mode || 'menu',
      paymentProvider: 'paystack',
      accountStatus: normalizeAccountStatus(business.account_status),
      scaleGuestMenuTags
    };
    setCachedPublicBusiness(businessId, cacheParts, payload);
    res.set('Cache-Control', `public, max-age=${Math.floor(PUBLIC_TTL_MS / 1000)}, stale-while-revalidate=60`);
    res.set('X-Zuri-Cache', 'MISS');
    res.json(payload);
  } catch (error) {
    console.error('Get business info error:', error);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
