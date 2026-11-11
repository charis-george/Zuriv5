const { isAcceptableOrderPaymentAmount } = require('./transactionFees');

/**
 * What a payment webhook should do for an order it has already found.
 * A second delivery for an order that is already paid must not settle again.
 */
function decideSettlement(order, amountPaid) {
  if (!order) return { action: 'ignore' };
  if (order.payment_status === 'paid') {
    return {
      action: order.receipt_sent_at ? 'already_complete' : 'retry_receipt'
    };
  }
  if (!isAcceptableOrderPaymentAmount(order.total_amount, amountPaid)) {
    return { action: 'amount_mismatch' };
  }
  return { action: 'finalize' };
}

module.exports = { decideSettlement };
