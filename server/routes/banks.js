const express = require('express');
const router = express.Router();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_BASE = 'https://api.paystack.co';

let cachedBanks = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * GET / — List Nigerian banks from Paystack (cached for 1 hour).
 */
router.get('/', async (_req, res) => {
  try {
    if (cachedBanks && Date.now() - cachedAt < CACHE_TTL_MS) {
      return res.json(cachedBanks);
    }

    const response = await fetch(`${PAYSTACK_BASE}/bank?country=nigeria&perPage=100`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
    });
    const json = await response.json();

    if (!response.ok || !json.data) {
      console.error('Paystack list banks failed', json.message || json);
      return res.status(502).json({ error: 'Could not fetch bank list' });
    }

    cachedBanks = json.data.map((b) => ({ code: b.code, name: b.name }));
    cachedAt = Date.now();
    return res.json(cachedBanks);
  } catch (err) {
    console.error('GET /api/banks error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /resolve — Resolve bank account name via Paystack.
 * Query params: account_number, bank_code
 */
router.get('/resolve', async (req, res) => {
  const { account_number, bank_code } = req.query;

  if (!account_number || !bank_code) {
    return res.status(400).json({ error: 'account_number and bank_code are required' });
  }

  try {
    const response = await fetch(
      `${PAYSTACK_BASE}/bank/resolve?account_number=${encodeURIComponent(account_number)}&bank_code=${encodeURIComponent(bank_code)}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    const json = await response.json();

    if (!response.ok || !json.data) {
      const msg = json.message || 'Could not resolve account';
      return res.status(response.status >= 400 ? response.status : 400).json({ error: msg });
    }

    return res.json({ account_name: json.data.account_name });
  } catch (err) {
    console.error('GET /api/banks/resolve error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
