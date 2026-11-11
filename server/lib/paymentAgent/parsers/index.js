const { tryParseMoniepoint } = require('./moniepoint');
const { tryParseOpay } = require('./opay');
const { tryParseGeneric } = require('./generic');

/**
 * Pluggable parser chain: Moniepoint → OPay → generic.
 * @returns {{ amount: number|null, sender_name: string|null, channel: string, bank_or_provider: string, timestamp: Date, parse_errors: string|null }}
 */
function parsePaymentSms(rawText, receivedAt = new Date()) {
  const strategies = [tryParseMoniepoint, tryParseOpay];
  for (const fn of strategies) {
    const result = fn(rawText, receivedAt);
    if (result) {
      if (!result.timestamp) {
        result.timestamp = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
      }
      return result;
    }
  }
  return tryParseGeneric(rawText, receivedAt);
}

module.exports = {
  parsePaymentSms,
  tryParseMoniepoint,
  tryParseOpay,
  tryParseGeneric
};
