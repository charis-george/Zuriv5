import type { PlanId } from '../types'

/** Paid tiers that unlock Growth+ storefront + analytics (includes legacy aliases). */
export function isGrowthPlusPlan(plan: string | undefined | null): boolean {
  if (!plan) return false
  return ['growth', 'scale', 'pro', 'zuri_plus', 'enterprise', 'basic', 'advanced'].includes(plan)
}

/** AI Assist insights tab + premium analytics (Scale+; legacy pro / zuri_plus rows). */
export function isAiInsightsTier(plan: string | undefined | null): boolean {
  if (!plan) return false
  return ['scale', 'pro', 'zuri_plus', 'enterprise'].includes(plan)
}

/** Ops briefing, live AI signals, slow-hour detection (Scale+; legacy Zuri AI tier). */
export function isOpsAiTier(plan: string | undefined | null): boolean {
  if (!plan) return false
  return ['scale', 'zuri_plus', 'enterprise'].includes(plan)
}

/** Guest-facing AI menu personalization — all plans (tease with other paid gates elsewhere). */
export function isGuestAiMenuTier(_plan?: string | null): boolean {
  return true
}

/** ZuriQO chat — all plans; server enforces daily AI credits. */
export function canUseZuriQo(_plan?: string | null): boolean {
  return true
}

/** Guest menu image pills (For you / Reorder / Trending) — Scale, Enterprise, legacy Pro / Zuri Plus. */
export function isScaleGuestMenuTagPlan(plan: string | undefined | null): boolean {
  if (!plan) return false
  return ['scale', 'enterprise', 'pro', 'zuri_plus'].includes(plan)
}

/** Marketing copy for daily AI credit ceilings (keep in sync with server/lib/aiUsageLimits.js). */
export function aiDailyCreditLimitLabel(plan: string | undefined | null): string {
  const p = String(plan || 'free').toLowerCase()
  if (['scale', 'pro', 'zuri_plus', 'enterprise', 'advanced'].includes(p)) return 'Unlimited'
  if (p === 'growth' || p === 'basic') return '60 / day'
  if (p === 'starter') return '25 / day'
  return '8 / day'
}

export function planLabelForDisplay(plan: PlanId | string | undefined): string {
  if (plan === 'zuri_plus') return 'Zuri Plus'
  if (plan === 'pro') return 'Scale'
  return String(plan || '')
}
