/**
 * Monnify API client: auth, init transaction, verify, webhook signature.
 * Docs: https://developers.monnify.com/docs/collections/one-time-payment
 */

const crypto = require('crypto');

const MONNIFY_API_KEY = process.env.MONNIFY_API_KEY || '';
const MONNIFY_SECRET_KEY = process.env.MONNIFY_SECRET_KEY || '';
const MONNIFY_CONTRACT_CODE = process.env.MONNIFY_CONTRACT_CODE || '';

function apiKeyLooksSandbox(key) {
  const k = String(key || '').toUpperCase();
  return k.includes('TEST') || k.startsWith('MK_TEST');
}

function apiKeyLooksLive(key) {
  const k = String(key || '').toUpperCase();
  return k.includes('PROD') || k.startsWith('MK_PROD');
}

/** Prefer explicit MONNIFY_BASE_URL; otherwise infer from API key prefix. */
function resolveMonnifyBaseUrl() {
  const explicit = String(process.env.MONNIFY_BASE_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  if (apiKeyLooksSandbox(MONNIFY_API_KEY)) return 'https://sandbox.monnify.com';
  return 'https://api.monnify.com';
}

const MONNIFY_BASE_URL = resolveMonnifyBaseUrl();

let cachedToken = null;
let tokenExpiresAt = 0;

function isMonnifyConfigured() {
  return Boolean(MONNIFY_API_KEY && MONNIFY_SECRET_KEY && MONNIFY_CONTRACT_CODE);
}

/** Warn when sandbox/live keys do not match the configured base URL. */
function monnifyEnvironmentMismatch() {
  if (!MONNIFY_API_KEY) return null;
  const sandboxUrl = MONNIFY_BASE_URL.includes('sandbox');
  if (sandboxUrl && apiKeyLooksLive(MONNIFY_API_KEY)) {
    return 'MONNIFY_API_KEY looks like live (MK_PROD) but MONNIFY_BASE_URL is sandbox. Use sandbox keys or set MONNIFY_BASE_URL=https://api.monnify.com';
  }
  if (!sandboxUrl && apiKeyLooksSandbox(MONNIFY_API_KEY)) {
    return 'MONNIFY_API_KEY looks like sandbox (MK_TEST) but MONNIFY_BASE_URL is live. Set MONNIFY_BASE_URL=https://sandbox.monnify.com or use live keys.';
  }
  return null;
}

function monnifyPublicConfig() {
  return {
    apiKey: MONNIFY_API_KEY || null,
    contractCode: MONNIFY_CONTRACT_CODE || null,
    isTestMode: MONNIFY_BASE_URL.includes('sandbox'),
    baseUrl: MONNIFY_BASE_URL
  };
}

/** Public webhook URL businesses must paste into Monnify Dashboard → Transaction Completion. */
function monnifyWebhookUrl() {
  const explicit = String(process.env.MONNIFY_WEBHOOK_URL || process.env.PUBLIC_API_URL || '').trim();
  if (explicit) {
    return `${explicit.replace(/\/$/, '')}/api/payment/monnify-webhook`;
  }
  const railway = String(process.env.RAILWAY_PUBLIC_DOMAIN || '').trim();
  if (railway) {
    return `https://${railway.replace(/^https?:\/\//, '')}/api/payment/monnify-webhook`;
  }
  return null;
}

function enrichMonnifyError(message) {
  const mismatch = monnifyEnvironmentMismatch();
  const base = String(message || 'Monnify request failed');
  if (!mismatch) return base;
  if (base.toLowerCase().includes('authentication') || base.toLowerCase().includes('credential')) {
    return `${base} — ${mismatch}`;
  }
  return base;
}

function clearAccessTokenCache() {
  cachedToken = null;
  tokenExpiresAt = 0;
}

/** Unique per checkout attempt — Monnify rejects duplicate paymentReference. */
function buildMonnifyPaymentReference(orderId) {
  const compact = String(orderId || '').replace(/-/g, '').slice(0, 16);
  const stamp = Date.now().toString(36);
  return `zuri_${compact}_${stamp}`.slice(0, 64);
}

function orderIdFromMonnifyMeta(tx) {
  const meta = normalizeMetaData(tx?.metaData || tx?.metadata);
  return meta.orderId ? String(meta.orderId).trim() : null;
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ZURI_PAYMENT_REF_RE = /zuri_[a-z0-9_]+/i;

/**
 * Parse Monnify redirect return values. Monnify sometimes sets
 * reference=orderId?paymentReference=zuri_... as a single corrupted param.
 */
function parseMonnifyReturnRefs(raw) {
  let s = String(raw || '').trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep */
  }

  let orderId = null;
  let monnifyPaymentReference = null;

  const embedded = s.match(/^([^?]+)\?paymentReference=(.+)$/i);
  if (embedded) {
    orderId = embedded[1].trim();
    monnifyPaymentReference = embedded[2].trim();
  } else {
    const uuid = s.match(UUID_RE);
    if (uuid) orderId = uuid[0];
    const zuri = s.match(ZURI_PAYMENT_REF_RE);
    if (zuri) monnifyPaymentReference = zuri[0];
    if (!orderId && s.startsWith('sub_')) orderId = s;
  }

  if (orderId && UUID_RE.test(orderId) === false && !orderId.startsWith('sub_')) {
    const uuid = orderId.match(UUID_RE);
    if (uuid) orderId = uuid[0];
  }

  return { orderId, monnifyPaymentReference, raw: s };
}

async function getAccessToken() {
  if (!isMonnifyConfigured()) {
    throw new Error('Monnify not configured');
  }
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }
  const basic = Buffer.from(`${MONNIFY_API_KEY}:${MONNIFY_SECRET_KEY}`).toString('base64');
  const res = await fetch(`${MONNIFY_BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/json'
    }
  });
  const data = await res.json();
  if (!data?.requestSuccessful || !data?.responseBody?.accessToken) {
    clearAccessTokenCache();
    const msg = enrichMonnifyError(data?.responseMessage || 'Monnify auth failed');
    const err = new Error(msg);
    err.code = 'MONNIFY_AUTH_FAILED';
    throw err;
  }
  cachedToken = data.responseBody.accessToken;
  const expiresIn = Number(data.responseBody.expiresIn || 3600);
  tokenExpiresAt = Date.now() + expiresIn * 1000;
  return cachedToken;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function monnifyRequest(method, path, body) {
  const token = await getAccessToken();
  const headers = { Authorization: `Bearer ${token}` };
  if (body != null) headers['Content-Type'] = 'application/json';
  const opts = { method, headers };
  if (body != null) opts.body = JSON.stringify(body);
  const res = await fetch(`${MONNIFY_BASE_URL}${path}`, opts);
  let data;
  try {
    data = await res.json();
  } catch {
    const err = new Error('Monnify returned an invalid response. Please try again.');
    err.status = 502;
    err.retryable = true;
    throw err;
  }
  return { ok: res.ok && data?.requestSuccessful === true, status: res.status, data };
}

function isMonnifySandbox() {
  return MONNIFY_BASE_URL.includes('sandbox');
}

const MONNIFY_SANDBOX_VALIDATE_HINT =
  'Monnify sandbox test accounts: Access bank 0035785417 (code 044), Sterling 0068687503 (code 232).';

function mapMonnifyValidateError(responseMessage, responseCode) {
  const msg = String(responseMessage || 'Could not resolve account').trim();
  const lower = msg.toLowerCase();
  if (lower.includes('invalid account')) {
    return {
      message: 'That account number was not found at this bank. Confirm the bank and NUBAN, then try again.',
      retryable: false
    };
  }
  if (lower.includes('invalid bank')) {
    return {
      message: 'That bank is not recognized. Pick your bank from the dropdown list.',
      retryable: false
    };
  }
  if (
    /unable to process|could not be validated|temporarily unavailable|service unavailable|name inquiry failed/i.test(
      lower
    )
  ) {
    return {
      message:
        'Bank name enquiry is temporarily unavailable (NIBSS or your bank). Wait a minute and tap Verify again.',
      retryable: true
    };
  }
  if (responseCode && responseCode !== '0') {
    return { message: msg, retryable: /try again|moment|unavailable/i.test(lower) };
  }
  return { message: msg, retryable: false };
}

function buildMonnifyValidateError(responseMessage, responseCode, httpStatus) {
  const mapped = mapMonnifyValidateError(responseMessage, responseCode);
  const err = new Error(mapped.message);
  err.status = httpStatus >= 400 ? httpStatus : 400;
  err.retryable = mapped.retryable;
  err.monnifyCode = responseCode || null;
  if (isMonnifySandbox()) err.sandboxHint = MONNIFY_SANDBOX_VALIDATE_HINT;
  return err;
}

/**
 * @param {{
 *   amount: number,
 *   customerName: string,
 *   customerEmail: string,
 *   paymentReference: string,
 *   paymentDescription?: string,
 *   redirectUrl?: string | null,
 *   metaData?: object
 * }} params
 */
async function initTransaction(params) {
  const {
    amount,
    customerName,
    customerEmail,
    paymentReference,
    paymentDescription,
    redirectUrl,
    metaData
  } = params;

  const safeAmount = Math.round(Number(amount) * 100) / 100;
  const payload = {
    amount: safeAmount,
    customerName: String(customerName || 'Customer').slice(0, 100),
    customerEmail: String(customerEmail).trim(),
    paymentReference: String(paymentReference),
    paymentDescription: (paymentDescription || 'ZURI payment').slice(0, 100),
    currencyCode: 'NGN',
    contractCode: MONNIFY_CONTRACT_CODE
  };
  if (redirectUrl) payload.redirectUrl = String(redirectUrl);
  if (metaData && typeof metaData === 'object') {
    const flat = {};
    for (const [k, v] of Object.entries(metaData)) {
      if (v == null) continue;
      flat[k] = typeof v === 'string' ? v : String(v);
    }
    if (Object.keys(flat).length) payload.metaData = flat;
  }

  const { ok, data } = await monnifyRequest('POST', '/api/v1/merchant/transactions/init-transaction', payload);
  if (!ok || !data?.responseBody) {
    const raw = data?.responseMessage || 'Failed to initialize Monnify transaction';
    const msg = enrichMonnifyError(raw);
    const err = new Error(msg);
    err.code = /credential|authentication/i.test(raw) ? 'MONNIFY_AUTH_FAILED' : 'MONNIFY_INIT_FAILED';
    throw err;
  }
  return data.responseBody;
}

async function getTransactionByPaymentReference(paymentReference) {
  const ref = encodeURIComponent(String(paymentReference));
  const { ok, data } = await monnifyRequest(
    'GET',
    `/api/v2/merchant/transactions/query?paymentReference=${ref}`
  );
  if (!ok || !data?.responseBody) {
    return null;
  }
  return data.responseBody;
}

function isPaidTransaction(tx) {
  return tx && String(tx.paymentStatus || '').toUpperCase() === 'PAID';
}

function amountPaidNaira(tx) {
  const raw = tx?.amountPaid ?? tx?.totalPayable ?? 0;
  return Number(raw);
}

function verifyWebhookSignature(rawBody, signatureHeader) {
  if (!MONNIFY_SECRET_KEY || !signatureHeader || !rawBody) return false;
  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  const expected = String(signatureHeader).trim().toLowerCase();

  // Monnify docs: HMAC-SHA512(secret, raw JSON body string)
  const hmacHash = crypto
    .createHmac('sha512', MONNIFY_SECRET_KEY)
    .update(bodyStr)
    .digest('hex')
    .toLowerCase();
  if (hmacHash === expected) return true;

  // Legacy docs variant: SHA-512(secret + body) — keep as fallback
  const legacyHash = crypto
    .createHash('sha512')
    .update(`${MONNIFY_SECRET_KEY}${bodyStr}`)
    .digest('hex')
    .toLowerCase();
  return legacyHash === expected;
}

function parseWebhookEvent(rawBody) {
  const bodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
  return JSON.parse(bodyStr);
}

/** Raw body for webhook signature verification (Buffer preferred). */
function webhookRawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') return Buffer.from(req.body, 'utf8');
  if (req.body && typeof req.body === 'object') {
    return Buffer.from(JSON.stringify(req.body), 'utf8');
  }
  return Buffer.alloc(0);
}

function parseWebhookPayload(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  const raw = webhookRawBody(req);
  if (!raw.length) return null;
  return parseWebhookEvent(raw);
}

function normalizeMetaData(meta) {
  if (!meta || typeof meta !== 'object') return {};
  const out = {};
  for (const [k, v] of Object.entries(meta)) {
    if (v == null) out[k] = '';
    else if (typeof v === 'object') out[k] = v;
    else out[k] = String(v);
  }
  return out;
}

let cachedMonnifyBanks = null;
let cachedMonnifyBanksAt = 0;
const BANKS_CACHE_TTL_MS = 60 * 60 * 1000;

/** Nigerian banks supported for Monnify disbursements. */
async function getBanks() {
  if (cachedMonnifyBanks && Date.now() - cachedMonnifyBanksAt < BANKS_CACHE_TTL_MS) {
    return cachedMonnifyBanks;
  }
  const { ok, data } = await monnifyRequest('GET', '/api/v1/banks');
  if (!ok || !Array.isArray(data?.responseBody)) {
    const msg = data?.responseMessage || 'Could not fetch Monnify bank list';
    throw new Error(msg);
  }
  cachedMonnifyBanks = data.responseBody
    .map((b) => ({ code: String(b.code || '').trim(), name: String(b.name || '').trim() }))
    .filter((b) => b.code && b.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  cachedMonnifyBanksAt = Date.now();
  return cachedMonnifyBanks;
}

/**
 * Name enquiry for payout account setup.
 * @returns {{ account_name: string, account_number: string, bank_code: string }}
 */
async function validateBankAccountOnce(accountNumber, bankCode) {
  const acct = String(accountNumber || '').replace(/\D/g, '');
  const code = String(bankCode || '').trim();
  if (!acct || !code) {
    throw new Error('account_number and bank_code are required');
  }
  const qs = new URLSearchParams({ accountNumber: acct, bankCode: code });
  const { ok, data, status } = await monnifyRequest(
    'GET',
    `/api/v1/disbursements/account/validate?${qs.toString()}`
  );
  const body = data?.responseBody;
  const accountName = body?.accountName || body?.account_name;
  if (!ok || !accountName) {
    throw buildMonnifyValidateError(data?.responseMessage, data?.responseCode, status);
  }
  return {
    account_name: String(accountName).trim(),
    account_number: String(body.accountNumber || acct),
    bank_code: String(body.bankCode || code)
  };
}

async function validateBankAccount(accountNumber, bankCode) {
  const maxAttempts = 3;
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await validateBankAccountOnce(accountNumber, bankCode);
    } catch (err) {
      lastErr = err;
      if (!err.retryable || attempt === maxAttempts) throw err;
      await sleep(700 * attempt);
    }
  }
  throw lastErr;
}

if (isMonnifyConfigured()) {
  const mismatch = monnifyEnvironmentMismatch();
  if (mismatch) console.warn('[ZURI] Monnify env warning:', mismatch);
  else console.log('[ZURI] Monnify configured for', MONNIFY_BASE_URL);
}

module.exports = {
  isMonnifyConfigured,
  monnifyEnvironmentMismatch,
  buildMonnifyPaymentReference,
  orderIdFromMonnifyMeta,
  parseMonnifyReturnRefs,
  monnifyPublicConfig,
  monnifyWebhookUrl,
  initTransaction,
  getTransactionByPaymentReference,
  isPaidTransaction,
  amountPaidNaira,
  verifyWebhookSignature,
  parseWebhookEvent,
  webhookRawBody,
  parseWebhookPayload,
  normalizeMetaData,
  getBanks,
  validateBankAccount,
  isMonnifySandbox,
  MONNIFY_BASE_URL
};
