/**
 * Paystack SDK sometimes returns non-JSON error bodies (ex: "error code: 504").
 * The SDK then throws SyntaxError when it tries to JSON.parse().
 *
 * This utility normalizes those failures into status + message that our API can return.
 */

function normalizePaystackSdkError(err) {
  const message = typeof err?.message === 'string' ? err.message : '';
  const lower = message.toLowerCase();

  // Observed in logs:
  //   SyntaxError: Unexpected token 'e', "error code: 504 ... is not valid JSON
  if (/\berror code:\s*504\b/i.test(message) || /\b504\b/i.test(lower)) {
    return {
      status: 504,
      code: 'PAYSTACK_GATEWAY_TIMEOUT',
      message: 'Paystack gateway timeout (504). Please try again in a moment.'
    };
  }

  // Network timeouts sometimes show up as plain timeout codes.
  if (err?.code === 'ETIMEDOUT' || lower.includes('timeout')) {
    return {
      status: 504,
      code: 'PAYSTACK_GATEWAY_TIMEOUT',
      message: 'Paystack gateway timeout. Please try again in a moment.'
    };
  }

  return null;
}

module.exports = { normalizePaystackSdkError };

