/**
 * Server-side bank account resolution (Paystack / Monnify).
 */

const { isMonnifyConfigured, validateBankAccount } = require('./monnify');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_BASE = 'https://api.paystack.co';

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
 * Resolve and verify a Nigerian bank account.
 * @param {{ accountNumber: string, bankCode: string, provider?: string }} params
 * @returns {Promise<{ accountName: string }>}
 */
async function verifyBankAccount({ accountNumber, bankCode, provider = 'paystack' }) {
  const digits = String(accountNumber).replace(/\D/g, '');
  const code = String(bankCode).trim();
  if (digits.length < 8 || digits.length > 16) {
    const err = new Error('Account number must be 8–16 digits');
    err.status = 400;
    throw err;
  }
  if (!code) {
    const err = new Error('Bank code is required');
    err.status = 400;
    throw err;
  }

  const normalizedProvider = String(provider).toLowerCase() === 'monnify' ? 'monnify' : 'paystack';

  if (normalizedProvider === 'monnify') {
    if (!isMonnifyConfigured()) {
      const err = new Error('Monnify account validation is not configured');
      err.status = 503;
      throw err;
    }
    const result = await validateBankAccount(digits, code);
    return { accountName: result.account_name };
  }

  if (!PAYSTACK_SECRET) {
    const err = new Error('Paystack account validation is not configured');
    err.status = 503;
    throw err;
  }
  const result = await resolvePaystackAccount(digits, code);
  return { accountName: result.account_name };
}

module.exports = {
  verifyBankAccount
};
