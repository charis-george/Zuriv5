import type { BusinessMode } from '../types'

export const MENU_TRANSACTION_FEE_PERCENT = 1.5
export const MENU_TRANSACTION_FEE_FLAT_NAIRA = 0

export const TICKETING_TRANSACTION_FEE_PERCENT = 4
export const TICKETING_TRANSACTION_FEE_FLAT_NAIRA = 50

export function computeTransactionFeeNaira(amountNaira: number, mode: BusinessMode): number {
  const amount = Number(amountNaira)
  if (!Number.isFinite(amount) || amount <= 0) return 0
  if (mode === 'ticketing') {
    return (amount * (TICKETING_TRANSACTION_FEE_PERCENT / 100)) + TICKETING_TRANSACTION_FEE_FLAT_NAIRA
  }
  return amount * (MENU_TRANSACTION_FEE_PERCENT / 100)
}

export function computeNetAfterFeeNaira(amountNaira: number, mode: BusinessMode): number {
  const amount = Number(amountNaira)
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.max(0, amount - computeTransactionFeeNaira(amount, mode))
}

export function formatModeTransactionFee(mode: BusinessMode): string {
  return mode === 'ticketing'
    ? `4% + ₦${TICKETING_TRANSACTION_FEE_FLAT_NAIRA} per successful sale`
    : `${MENU_TRANSACTION_FEE_PERCENT}% per successful sale`
}

export const TRANSACTION_FEE_SUMMARY_COPY =
  `Ticketing: ${formatModeTransactionFee('ticketing')}. Menu orders: ${formatModeTransactionFee('menu')}.`
