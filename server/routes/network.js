const express = require('express');
const router = express.Router();
const { getStatsByEmail } = require('../lib/zuri-network');
const { getMarketInsights } = require('../lib/business-graph');
const { requireBusinessAuth } = require('../middleware/auth');
const { getBusinessPlan, canAccessProFeatures } = require('../lib/plans');

/**
 * GET /api/network/customer-stats?email=...
 * Returns Zuri Network stats for the given email (for storefront "Returning Zuri customer").
 * No auth required; only returns aggregate stats, no PII.
 */
router.get('/customer-stats', async (req, res) => {
  try {
    const email = req.query.email;
    if (!email || !String(email).trim()) {
      return res.status(400).json({ error: 'email is required' });
    }
    const stats = await getStatsByEmail(email);
    if (!stats) {
      return res.json({ returningZuriCustomer: false });
    }
    res.json(stats);
  } catch (err) {
    console.error('Network customer-stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * GET /api/network/market-insights?days=30
 * Business Graph: anonymous platform-wide market insights. Pro+ only.
 * Requires business auth; returns platform aggregates and optional comparison for the authenticated business.
 */
router.get('/market-insights', requireBusinessAuth, async (req, res) => {
  try {
    const businessId = req.businessId;
    const plan = await getBusinessPlan(businessId);
    if (!canAccessProFeatures(plan)) {
      return res.status(403).json({
        error: 'Market intelligence is available on Pro plan and above. Upgrade to unlock.',
        upgradeRequired: true
      });
    }
    const days = Math.min(90, Math.max(7, parseInt(req.query.days, 10) || 30));
    const data = await getMarketInsights(days, businessId);
    res.json(data);
  } catch (err) {
    console.error('Network market-insights error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
