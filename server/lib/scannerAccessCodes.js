const crypto = require('crypto');
const { getDb } = require('../database');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const MAX_CODES_PER_BUSINESS = 12;

function hashCode(code) {
  return crypto.createHash('sha256').update(String(code).trim().toUpperCase()).digest('hex');
}

function normalizeCodeInput(code) {
  return String(code || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function generateRawCode() {
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

async function countActiveCodes(businessId) {
  const { count, error } = await getDb()
    .from('scanner_access_codes')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .is('revoked_at', null);

  if (error) throw error;
  return count || 0;
}

/**
 * @param {string} businessId
 * @param {string | null | undefined} label
 * @returns {Promise<{ id: string, code: string, label: string | null, createdAt: string }>}
 */
async function createScannerAccessCode(businessId, label) {
  const active = await countActiveCodes(businessId);
  if (active >= MAX_CODES_PER_BUSINESS) {
    const err = new Error(`You can have at most ${MAX_CODES_PER_BUSINESS} active scanner codes. Revoke one first.`);
    err.code = 'LIMIT_REACHED';
    throw err;
  }

  const safeLabel = label && typeof label === 'string' ? label.trim().slice(0, 80) || null : null;

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const rawCode = generateRawCode();
    const codeHash = hashCode(rawCode);
    const { data, error } = await getDb()
      .from('scanner_access_codes')
      .insert({
        business_id: businessId,
        code_hash: codeHash,
        label: safeLabel
      })
      .select('id, label, created_at')
      .single();

    if (!error && data) {
      return {
        id: data.id,
        code: rawCode,
        label: data.label || null,
        createdAt: data.created_at
      };
    }
    if (error && !/duplicate|unique/i.test(error.message || '')) {
      throw error;
    }
  }

  throw new Error('Could not generate a unique scanner code. Try again.');
}

async function listScannerAccessCodes(businessId) {
  const { data, error } = await getDb()
    .from('scanner_access_codes')
    .select('id, label, created_at, last_used_at, revoked_at')
    .eq('business_id', businessId)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return (data || []).map((row) => ({
    id: row.id,
    label: row.label || null,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at || null
  }));
}

async function revokeScannerAccessCode(businessId, codeId) {
  const { data, error } = await getDb()
    .from('scanner_access_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', codeId)
    .eq('business_id', businessId)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return Boolean(data?.id);
}

/**
 * @returns {Promise<{ businessId: string, codeId: string, businessName: string } | null>}
 */
async function redeemScannerAccessCode(rawCode) {
  const normalized = normalizeCodeInput(rawCode);
  if (normalized.length !== CODE_LENGTH) return null;

  const codeHash = hashCode(normalized);
  const { data: row, error } = await getDb()
    .from('scanner_access_codes')
    .select('id, business_id, revoked_at')
    .eq('code_hash', codeHash)
    .maybeSingle();

  if (error) {
    console.error('[ZURI] scanner code lookup failed:', error.message || error);
    return null;
  }
  if (!row || row.revoked_at) return null;

  const scannedAt = new Date().toISOString();
  await getDb()
    .from('scanner_access_codes')
    .update({ last_used_at: scannedAt })
    .eq('id', row.id)
    .is('revoked_at', null);

  const { data: business, error: bizError } = await getDb()
    .from('businesses')
    .select('id, name, business_mode')
    .eq('id', row.business_id)
    .maybeSingle();

  if (bizError || !business) return null;

  return {
    businessId: business.id,
    codeId: row.id,
    businessName: business.name || 'Business',
    businessMode: business.business_mode || 'menu'
  };
}

module.exports = {
  CODE_LENGTH,
  MAX_CODES_PER_BUSINESS,
  normalizeCodeInput,
  createScannerAccessCode,
  listScannerAccessCodes,
  revokeScannerAccessCode,
  redeemScannerAccessCode
};
