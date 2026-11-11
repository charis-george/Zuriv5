/**
 * Platform commission fees (mirrors client/src/lib/transactionFees.ts).
 */

const MENU_FEE_PERCENT = process.env.TRANSFER_MENU_FEE_PERCENT != null
  ? Math.max(0, Math.min(100, Number(process.env.TRANSFER_MENU_FEE_PERCENT)))
  : 1.5;
const MENU_FEE_FLAT_NAIRA = process.env.TRANSFER_MENU_FEE_NAIRA != null
  ? Math.max(0, Number(process.env.TRANSFER_MENU_FEE_NAIRA))
  : 0;

const SHOP_FEE_PERCENT = process.env.TRANSFER_SHOP_FEE_PERCENT != null
  ? Math.max(0, Math.min(100, Number(process.env.TRANSFER_SHOP_FEE_PERCENT)))
  : 2.5;
const SHOP_FEE_FLAT_NAIRA = process.env.TRANSFER_SHOP_FEE_NAIRA != null
  ? Math.max(0, Number(process.env.TRANSFER_SHOP_FEE_NAIRA))
  : 25;

const TICKETING_FEE_PERCENT = process.env.TRANSFER_TICKETING_FEE_PERCENT != null
  ? Math.max(0, Math.min(100, Number(process.env.TRANSFER_TICKETING_FEE_PERCENT)))
  : 4;
const TICKETING_FEE_FLAT_NAIRA = process.env.TRANSFER_TICKETING_FEE_NAIRA != null
  ? Math.max(0, Number(process.env.TRANSFER_TICKETING_FEE_NAIRA))
  : 50;

const { normalizeBusinessMode } = require('./businessMode');

function feeConfigForMode(businessMode = 'menu') {
  const mode = normalizeBusinessMode(businessMode);
  if (mode === 'ticketing') {
    return { percent: TICKETING_FEE_PERCENT, flatNaira: TICKETING_FEE_FLAT_NAIRA };
  }
  if (mode === 'shop') {
    return { percent: SHOP_FEE_PERCENT, flatNaira: SHOP_FEE_FLAT_NAIRA };
  }
  return { percent: MENU_FEE_PERCENT, flatNaira: MENU_FEE_FLAT_NAIRA };
}

function computePlatformFeeNaira(amountNaira, businessMode = 'menu') {
  const amount = Number(amountNaira);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const { percent, flatNaira } = feeConfigForMode(businessMode);
  return amount * (percent / 100) + flatNaira;
}

function computeVenueShareNaira(amountNaira, businessMode = 'menu') {
  const amount = Number(amountNaira);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.max(0, amount - computePlatformFeeNaira(amount, businessMode));
}

/** Upper bound when Paystack passes gateway fees to the customer (local cards ~1.5% + ₦100). */
function maxAcceptablePaymentNaira(orderTotalNaira) {
  const orderTotal = Number(orderTotalNaira);
  if (!Number.isFinite(orderTotal) || orderTotal <= 0) return 0;
  const passThroughPercent = process.env.PAYSTACK_PASS_THROUGH_PERCENT != null
    ? Math.max(0, Number(process.env.PAYSTACK_PASS_THROUGH_PERCENT))
    : 2.5;
  const passThroughFlat = process.env.PAYSTACK_PASS_THROUGH_FLAT_NAIRA != null
    ? Math.max(0, Number(process.env.PAYSTACK_PASS_THROUGH_FLAT_NAIRA))
    : 150;
  return orderTotal + orderTotal * (passThroughPercent / 100) + passThroughFlat;
}

/** True when paid amount matches order total or a reasonable fee pass-through from Paystack. */
function isAcceptableOrderPaymentAmount(orderTotalNaira, paidNaira) {
  const orderTotal = Number(orderTotalNaira);
  const paid = Number(paidNaira);
  if (!Number.isFinite(orderTotal) || !Number.isFinite(paid) || orderTotal <= 0) return false;
  if (Math.abs(paid - orderTotal) <= 0.01) return true;
  return paid >= orderTotal - 0.01 && paid <= maxAcceptablePaymentNaira(orderTotal) + 0.01;
}

module.exports = {
  feeConfigForMode,
  computePlatformFeeNaira,
  computeVenueShareNaira,
  maxAcceptablePaymentNaira,
  isAcceptableOrderPaymentAmount
};
