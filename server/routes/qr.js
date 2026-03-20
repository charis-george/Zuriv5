const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { getDb } = require('../database');

const supabase = getDb();

// Generate QR code for business (universal: full URL so phone camera opens menu)
router.get('/generate/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;
    let baseUrl = req.query.baseUrl || process.env.FRONTEND_URL || 'http://localhost:5173';

    if (typeof baseUrl !== 'string') baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    baseUrl = baseUrl.replace(/\/$/, ''); // no trailing slash
    if (!/^https?:\/\//i.test(baseUrl)) baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

    const qrUrl = `${baseUrl}/order/${businessId}`;

    const qrCodeDataUrl = await QRCode.toDataURL(qrUrl, {
      errorCorrectionLevel: 'H',
      type: 'image/png',
      width: 500,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    });

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

// Get business public info (for customer ordering page)
router.get('/business/:businessId', async (req, res) => {
  try {
    const { businessId } = req.params;

    const { data: business, error } = await supabase
      .from('businesses')
      .select('id, name, phone, address, logo_url, storefront_config, storefront_details')
      .eq('id', businessId)
      .single();

    if (error || !business) {
      return res.status(404).json({ error: 'Business not found' });
    }

    res.json({
      id: business.id,
      name: business.name,
      phone: business.phone,
      address: business.address,
      logoUrl: business.logo_url || null,
      storefrontConfig: business.storefront_config || null,
      storefrontDetails: business.storefront_details || null
    });
  } catch (error) {
    console.error('Get business info error:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

module.exports = router;
