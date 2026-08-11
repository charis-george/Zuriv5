import type { PlanId } from '../types'

/** Paid tiers that unlock Growth+ storefront + analytics (includes legacy aliases). */
export function isGrowthPlusPlan(plan: string | undefined | null): boolean {
  if (!plan) return false
  return ['growth', 'scale', 'pro', 'zuri_plus', 'enterprise', 'basic', 'advanced'].includes(plan)
}

/** AI assistant tab + premium analytics (Scale+; legacy pro / zuri_plus rows). */
export function isAiInsightsTier(plan: string | undefined | null): boolean {
  if (!plan) return false
  return ['scale', 'pro', 'zuri_plus', 'enterprise'].includes(plan)
}

/** Ops briefing, live AI signals, slow-hour detection (Scale+; legacy Zuri AI tier). */
export function isOpsAiTier(plan: string | undefined | null): boolean {
  if (!plan) return false
  return ['scale', 'zuri_plus', 'enterprise'].includes(plan)
}

/** Guest-facing AI menu controls (dashboard + storefront); Growth and above. */
export function isGuestAiMenuTier(plan: string | undefined | null): boolean {
  return isGrowthPlusPlan(plan)
}

/** Guest menu image pills (For you / Reorder / Trending) — Scale, Enterprise, legacy Pro / Zuri Plus. */
export function isScaleGuestMenuTagPlan(plan: string | undefined | null): boolean {
  if (!plan) return false
  return ['scale', 'enterprise', 'pro', 'zuri_plus'].includes(plan)
}

export function planLabelForDisplay(plan: PlanId | string | undefined): string {
  if (plan === 'zuri_plus') return 'Zuri Plus'
  if (plan === 'pro') return 'Scale'
  return String(plan || '')
}
