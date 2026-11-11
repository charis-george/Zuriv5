/**
 * Shared helpers for payment-alert SMS parsers.
 * @typedef {{ amount: number|null, sender_name: string|null, channel: 'pos'|'transfer'|'unknown', bank_or_provider: string, timestamp: Date|null, parse_errors?: string|null }} ParsedAlert
 */

function parseNairaAmount(raw) {
  if (raw == null) return null;
  const cleaned = String(raw)
    .replace(/NGN|₦|N(?=\d)/gi, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '')
    .trim();
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Extract first NGN / ₦ amount from free text. */
function extractFirstAmount(text) {
  if (!text || typeof text !== 'string') return null;
  const m = text.match(/(?:NGN|₦)\s*([\d,]+(?:\.\d{1,2})?)/i)
    || text.match(/(?:received|payment of|credited|debit(?:ed)?)\s+(?:NGN|₦)?\s*([\d,]+(?:\.\d{1,2})?)/i)
    || text.match(/([\d,]+\.\d{2})\s*(?:NGN|naira)?/i);
  if (!m) return null;
  return parseNairaAmount(m[1]);
}

function cleanName(name) {
  if (!name || typeof name !== 'string') return null;
  const s = name.replace(/\s+/g, ' ').trim();
  return s.length ? s.slice(0, 120) : null;
}

/**
 * Try to parse a timestamp from SMS content; return null if none.
 * Supports common NG SMS date forms.
 */
function extractTimestamp(text, fallbackDate) {
  if (!text || typeof text !== 'string') {
    return fallbackDate ? new Date(fallbackDate) : null;
  }
  // 30/07/2026 12:45 or 30-07-2026 12:45:01
  let m = text.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day, Number(m[4]), Number(m[5]), Number(m[6] || 0));
    if (!Number.isNaN(d.getTime())) return d;
  }
  // ISO-ish
  m = text.match(/(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?)/);
  if (m) {
    const d = new Date(m[1]);
    if (!Number.isNaN(d.getTime())) return d;
  }
  if (fallbackDate) {
    const d = new Date(fallbackDate);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

module.exports = {
  parseNairaAmount,
  extractFirstAmount,
  cleanName,
  extractTimestamp
};
