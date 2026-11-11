const { extractFirstAmount, cleanName, extractTimestamp } = require('./helpers');

/**
 * Generic fallback: first NGN/₦ amount, optional "from NAME", unknown provider.
 * Confidence should be capped by the match engine when bank_or_provider === 'unknown'.
 */
function tryParseGeneric(rawText, receivedAt) {
  if (!rawText || typeof rawText !== 'string') {
    return {
      amount: null,
      sender_name: null,
      channel: 'unknown',
      bank_or_provider: 'unknown',
      timestamp: receivedAt ? new Date(receivedAt) : new Date(),
      parse_errors: 'empty SMS body'
    };
  }

  const text = rawText.trim();
  const amount = extractFirstAmount(text);
  let sender = null;
  const from = text.match(/\bfrom\s+([A-Za-z][A-Za-z\s.'-]{2,60}?)(?:\s+on\s+|\s+via\s+|\s+to\s+|\.|,|$)/i);
  if (from) sender = cleanName(from[1]);

  let channel = 'unknown';
  if (/POS/i.test(text)) channel = 'pos';
  else if (/transfer|credited|received/i.test(text)) channel = 'transfer';

  return {
    amount,
    sender_name: sender,
    channel,
    bank_or_provider: 'unknown',
    timestamp: extractTimestamp(text, receivedAt) || (receivedAt ? new Date(receivedAt) : new Date()),
    parse_errors: amount == null ? 'generic: could not extract amount' : null
  };
}

module.exports = { tryParseGeneric };
