const { parseNairaAmount, cleanName, extractTimestamp } = require('./helpers');

/**
 * Moniepoint POS / transfer alert formats (samples used by pilot venues).
 * Examples:
 *   "You have received NGN 4,500.00 from ADEOLA BAKARE on your POS Terminal. 30/07/2026 14:22"
 *   "Txn: NGN 2,000.00 credited to your Moniepoint account from CHINEDU OKAFOR via transfer."
 */
function tryParseMoniepoint(rawText, receivedAt) {
  if (!rawText || typeof rawText !== 'string') return null;
  const text = rawText.trim();
  const looksLike =
    /moniepoint/i.test(text) ||
    (/POS\s*Terminal/i.test(text) && /received/i.test(text)) ||
    (/you have received/i.test(text) && /POS/i.test(text));

  if (!looksLike && !/moniepoint/i.test(text)) {
    // Still try dedicated amount+from patterns if "Moniepoint" appears in sender context elsewhere
    return null;
  }

  let amount = null;
  let sender = null;
  let channel = 'unknown';

  let m = text.match(
    /received\s+(?:NGN|₦)\s*([\d,]+(?:\.\d{1,2})?)\s+from\s+(.+?)\s+on\s+your\s+POS/i
  );
  if (m) {
    amount = parseNairaAmount(m[1]);
    sender = cleanName(m[2]);
    channel = 'pos';
  }

  if (amount == null) {
    m = text.match(
      /(?:NGN|₦)\s*([\d,]+(?:\.\d{1,2})?)\s+credited\s+to\s+your\s+Moniepoint\s+account\s+from\s+(.+?)(?:\s+via|\s+on|\.|$)/i
    );
    if (m) {
      amount = parseNairaAmount(m[1]);
      sender = cleanName(m[2]);
      channel = /transfer/i.test(text) ? 'transfer' : 'transfer';
    }
  }

  if (amount == null) {
    m = text.match(/(?:NGN|₦)\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (m) amount = parseNairaAmount(m[1]);
    const from = text.match(/\bfrom\s+([A-Z][A-Z\s.'-]{2,60}?)(?:\s+on\s+|\s+via\s+|\.|$)/i);
    if (from) sender = cleanName(from[1]);
    if (/POS/i.test(text)) channel = 'pos';
    else if (/transfer/i.test(text)) channel = 'transfer';
  }

  if (amount == null) {
    return {
      amount: null,
      sender_name: sender,
      channel,
      bank_or_provider: 'moniepoint',
      timestamp: extractTimestamp(text, receivedAt),
      parse_errors: 'moniepoint: could not extract amount'
    };
  }

  return {
    amount,
    sender_name: sender,
    channel,
    bank_or_provider: 'moniepoint',
    timestamp: extractTimestamp(text, receivedAt),
    parse_errors: null
  };
}

module.exports = { tryParseMoniepoint };
