const express = require('express');
const router = express.Router();
const { isMonnifyConfigured, getBanks: getMonnifyBanks, validateBankAccount } = require('../lib/monnify');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_BASE = 'https://api.paystack.co';

let cachedPaystackBanks = null;
let cachedPaystackBanksAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000;

function normalizeProvider(value) {
  return String(value || 'paystack').toLowerCase() === 'monnify' ? 'monnify' : 'paystack';
}

async function listPaystackBanks() {
  if (cachedPaystackBanks && Date.now() - cachedPaystackBanksAt < CACHE_TTL_MS) {
    return cachedPaystackBanks;
  }
  const response = await fetch(`${PAYSTACK_BASE}/bank?country=nigeria&perPage=100`, {
    headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
  });
  const json = await response.json();
  if (!response.ok || !json.data) {
    const msg = json.message || 'Could not fetch bank list';
    const err = new Error(msg);
    err.status = 502;
    throw err;
  }
  cachedPaystackBanks = json.data.map((b) => ({ code: b.code, name: b.name }));
  cachedPaystackBanksAt = Date.now();
  return cachedPaystackBanks;
}

async function resolvePaystackAccount(accountNumber, bankCode) {
  const response = await fetch(
    `${PAYSTACK_BASE}/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`,
    { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
  );
  const json = await response.json();
  if (!response.ok || !json.data?.account_name) {
    const msg = json.message || 'Could not resolve account';
    const err = new Error(msg);
    err.status = response.status >= 400 ? response.status : 400;
    throw err;
  }
  return { account_name: json.data.account_name };
}

/**
 * GET / — List Nigerian banks.
 * Query: provider=paystack|monnify (default paystack)
 */
router.get('/', async (req, res) => {
  const provider = normalizeProvider(req.query.provider);
  try {
    if (provider === 'monnify') {
      if (!isMonnifyConfigured()) {
        return res.status(503).json({ error: 'Bank list isn’t available right now. Please try again later.' });
      }
      const banks = await getMonnifyBanks();
      return res.json(banks);
    }
    if (!PAYSTACK_SECRET) {
      return res.status(503).json({ error: 'Bank list isn’t available right now. Please try again later.' });
    }
    const banks = await listPaystackBanks();
    return res.json(banks);
  } catch (err) {
    console.error('GET /api/banks error', { provider, message: err.message });
    return res.status(err.status || 500).json({ error: err.message || 'Could not fetch bank list' });
  }
});

/**
 * GET /resolve — Resolve bank account name.
 * Query: account_number, bank_code, provider=paystack|monnify
 */
router.get('/resolve', async (req, res) => {
  const { account_number, bank_code, provider: providerParam } = req.query;
  const provider = normalizeProvider(providerParam);

  if (!account_number || !bank_code) {
    return res.status(400).json({ error: 'account_number and bank_code are required' });
  }

  const accountNumber = String(account_number).replace(/\D/g, '');
  const bankCode = String(bank_code).trim();
  if (accountNumber.length < 8 || accountNumber.length > 16) {
    return res.status(400).json({ error: 'Account number must be 8–16 digits' });
  }

  try {
    if (provider === 'monnify') {
      if (!isMonnifyConfigured()) {
        return res.status(503).json({ error: 'Account verification isn’t available right now. Please try again later.' });
      }
      const result = await validateBankAccount(accountNumber, bankCode);
      return res.json({ account_name: result.account_name });
    }
    if (!PAYSTACK_SECRET) {
      return res.status(503).json({ error: 'Account verification isn’t available right now. Please try again later.' });
    }
    const result = await resolvePaystackAccount(accountNumber, bankCode);
    return res.json(result);
  } catch (err) {
    console.error('GET /api/banks/resolve error', {
      provider,
      message: err.message,
      monnifyCode: err.monnifyCode || undefined,
      retryable: Boolean(err.retryable),
      bankCode,
      accountTail: accountNumber.length >= 4 ? `***${accountNumber.slice(-4)}` : '***'
    });
    const body = { error: err.message || 'Could not resolve account' };
    if (err.retryable) body.retryable = true;
    if (err.sandboxHint) body.sandboxHint = err.sandboxHint;
    if (err.monnifyCode) body.monnifyCode = err.monnifyCode;
    return res.status(err.status || 500).json(body);
  }
});

module.exports = router;
