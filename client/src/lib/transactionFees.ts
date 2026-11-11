import type { BusinessMode } from '../types'
import { normalizeBusinessMode } from './businessMode'

export const MENU_TRANSACTION_FEE_PERCENT = 1.5
export const MENU_TRANSACTION_FEE_FLAT_NAIRA = 0

export const SHOP_TRANSACTION_FEE_PERCENT = 2.5
export const SHOP_TRANSACTION_FEE_FLAT_NAIRA = 25

export const TICKETING_TRANSACTION_FEE_PERCENT = 4
export const TICKETING_TRANSACTION_FEE_FLAT_NAIRA = 50

export function computeTransactionFeeNaira(amountNaira: number, mode: BusinessMode): number {
  const amount = Number(amountNaira)
  if (!Number.isFinite(amount) || amount <= 0) return 0
  const m = normalizeBusinessMode(mode)
  if (m === 'ticketing') {
    return amount * (TICKETING_TRANSACTION_FEE_PERCENT / 100) + TICKETING_TRANSACTION_FEE_FLAT_NAIRA
  }
  if (m === 'shop') {
    return amount * (SHOP_TRANSACTION_FEE_PERCENT / 100) + SHOP_TRANSACTION_FEE_FLAT_NAIRA
  }
  return amount * (MENU_TRANSACTION_FEE_PERCENT / 100) + MENU_TRANSACTION_FEE_FLAT_NAIRA
}

export function computeNetAfterFeeNaira(amountNaira: number, mode: BusinessMode): number {
  const amount = Number(amountNaira)
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.max(0, amount - computeTransactionFeeNaira(amount, mode))
}

export function formatModeTransactionFee(mode: BusinessMode): string {
  const m = normalizeBusinessMode(mode)
  if (m === 'ticketing') {
    return `4% + ₦${TICKETING_TRANSACTION_FEE_FLAT_NAIRA} per successful sale`
  }
  if (m === 'shop') {
    return `${SHOP_TRANSACTION_FEE_PERCENT}% + ₦${SHOP_TRANSACTION_FEE_FLAT_NAIRA} per successful sale`
  }
  return `${MENU_TRANSACTION_FEE_PERCENT}% per successful sale`
}

export const TRANSACTION_FEE_SUMMARY_COPY =
  `Ticketing: ${formatModeTransactionFee('ticketing')}. Shops: ${formatModeTransactionFee('shop')}. Menu orders: ${formatModeTransactionFee('menu')}.`
