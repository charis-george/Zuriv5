const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const { getDb } = require('../database');

const db = getDb();

// Generate QR code for business
router.get('/generate/:businessId', async (req, res) => {
  const { businessId } = req.params;
  const baseUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

  const qrUrl = `${baseUrl}/order/${businessId}`;

  try {
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
router.get('/business/:businessId', (req, res) => {
  const { businessId } = req.params;

  db.get(
    'SELECT id, name, phone, address FROM businesses WHERE id = ?',
    [businessId],
    (err, business) => {
      if (err) {
        return res.status(500).json({ error: 'Database error' });
      }
      if (!business) {
        return res.status(404).json({ error: 'Business not found' });
      }
      res.json(business);
    }
  );
});

module.exports = router;
