const { parseNairaAmount, cleanName, extractTimestamp } = require('./helpers');

/**
 * OPay alert formats.
 * Examples:
 *   "Payment of NGN 3,200.00 received from FATIMA BELLO. Ref: OPAY123. 30/07/2026 13:10"
 *   "You received NGN 1,500.00 via OPay from JOHN DOE to your account."
 */
function tryParseOpay(rawText, receivedAt) {
  if (!rawText || typeof rawText !== 'string') return null;
  const text = rawText.trim();
  if (!/opay/i.test(text) && !/\bOPAY/i.test(text)) return null;

  let amount = null;
  let sender = null;
  let channel = 'transfer';

  let m = text.match(
    /Payment\s+of\s+(?:NGN|₦)\s*([\d,]+(?:\.\d{1,2})?)\s+received\s+from\s+(.+?)(?:\.|,|\s+Ref|\s+on\s+|$)/i
  );
  if (m) {
    amount = parseNairaAmount(m[1]);
    sender = cleanName(m[2]);
  }

  if (amount == null) {
    m = text.match(
      /(?:You\s+)?received\s+(?:NGN|₦)\s*([\d,]+(?:\.\d{1,2})?)\s+(?:via\s+OPay\s+)?from\s+(.+?)(?:\s+to\s+|\.|$)/i
    );
    if (m) {
      amount = parseNairaAmount(m[1]);
      sender = cleanName(m[2]);
    }
  }

  if (amount == null) {
    m = text.match(/(?:NGN|₦)\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (m) amount = parseNairaAmount(m[1]);
    const from = text.match(/\bfrom\s+([A-Z][A-Z\s.'-]{2,60}?)(?:\.|,|\s+Ref|\s+to\s+|$)/i);
    if (from) sender = cleanName(from[1]);
  }

  if (/POS/i.test(text)) channel = 'pos';

  if (amount == null) {
    return {
      amount: null,
      sender_name: sender,
      channel,
      bank_or_provider: 'opay',
      timestamp: extractTimestamp(text, receivedAt),
      parse_errors: 'opay: could not extract amount'
    };
  }

  return {
    amount,
    sender_name: sender,
    channel,
    bank_or_provider: 'opay',
    timestamp: extractTimestamp(text, receivedAt),
    parse_errors: null
  };
}

module.exports = { tryParseOpay };
