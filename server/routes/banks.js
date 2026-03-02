const express = require('express');
const router = express.Router();

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE = 'https://api.paystack.co';

async function paystackGet(path, options = {}) {
  const timeoutMs = options.timeout ?? 25000; // 25s for slow Paystack/network
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${PAYSTACK_BASE}${path}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` },
      signal: controller.signal
    });
    const data = await res.json();
    if (!data.status) throw new Error(data.message || 'Paystack request failed');
    return data;
  } catch (err) {
    if (err.name === 'AbortError') throw new Error('Request timed out');
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

// List Nigerian banks for dropdown
router.get('/', async (req, res) => {
  try {
    if (!PAYSTACK_SECRET) {
      return res.status(503).json({ error: 'Payment not configured' });
    }
    const data = await paystackGet('/bank?country=nigeria&perPage=100');
    const banks = (data.data || []).map((b) => ({
      code: b.code,
      name: b.name
    })).filter((b) => b.code && b.name);
    res.json(banks);
  } catch (err) {
    console.error('List banks error:', err);
    res.status(500).json({ error: err.message || 'Failed to load banks' });
  }
});

// Resolve account number to get account name (for display/verification).
// Uses Paystack GET /bank/resolve. Nigerian NUBAN is 10 digits; we allow 8–16 for flexibility.
// In test mode, resolve may only work for certain test accounts; use live keys for real accounts.
router.get('/resolve', async (req, res) => {
  try {
    let { bank_code: bankCode, account_number: accountNumber } = req.query;
    if (!bankCode || !accountNumber) {
      return res.status(400).json({ error: 'bank_code and account_number are required' });
    }
    if (!PAYSTACK_SECRET) {
      return res.status(503).json({ error: 'Payment not configured' });
    }
    // Normalize: digits only (NUBAN is 10 digits; some formats use up to 16)
    bankCode = String(bankCode).trim();
    accountNumber = String(accountNumber).replace(/\D/g, '');
    if (!accountNumber || accountNumber.length < 8 || accountNumber.length > 16) {
      return res.status(400).json({ error: 'Account number must be 8–16 digits' });
    }
    const data = await paystackGet(
      `/bank/resolve?account_number=${encodeURIComponent(accountNumber)}&bank_code=${encodeURIComponent(bankCode)}`
    );
    res.json({
      account_name: data.data?.account_name || null,
      account_number: data.data?.account_number || accountNumber
    });
  } catch (err) {
    console.error('Resolve account error:', err.message, '| bank_code:', req.query.bank_code, '| account_number length:', String(req.query.account_number || '').replace(/\D/g, '').length);
    res.status(400).json({ error: err.message || 'Could not verify account. Check bank and account number.' });
  }
});

module.exports = router;
