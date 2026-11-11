import type { PlanId } from '../types'

/** Human-readable plan groups for marketing / onboarding (excludes deprecated basic/advanced unless present). */
export type PublicTierKey = 'free' | 'starter' | 'growth' | 'scale' | 'enterprise'

export type TierFeatureBlock = {
  tier: PublicTierKey
  title: string
  subtitle: string
  bullets: string[]
}

/**
 * Current Zuri capability map by paid tier.
 * Guest AI personalization + ZuriQO are on every plan (daily/lifetime caps).
 * Analytics, Tap, Assist insights, live ops, CSV remain tier-gated.
 */
export const ZURI_FEATURES_BY_TIER: TierFeatureBlock[] = [
  {
    tier: 'free',
    title: 'Free',
    subtitle: 'Try the flow end-to-end',
    bullets: [
      'QR link & customer order page',
      'Menu categories & items (text-only; no item photos)',
      'Guest AI personalization on your menu (limited)',
      'ZuriQO AI — 8 credits / day',
      'Free AI menu upload from photo or PDF (limited uses)',
      'Orders, statuses, reservations inbox, post-payment reviews',
      'Online payments when you connect Paystack',
      'No Analytics tab, no Zuri Tap (upgrade to unlock)'
    ]
  },
  {
    tier: 'starter',
    title: 'Starter',
    subtitle: 'Look professional from day one',
    bullets: [
      'Everything in Free',
      'Item photos & business logo',
      'ZuriQO AI — 25 credits / day',
      'More AI menu uploads & storefront AI generations',
      'Still no Analytics tab or Zuri Tap (upgrade to Growth)'
    ]
  },
  {
    tier: 'growth',
    title: 'Growth',
    subtitle: 'Data + higher AI allowance',
    bullets: [
      'Everything in Starter',
      'Analytics: sales, trends, popular items, peak hours, profit table (with costs)',
      'Zuri Tap in-venue ordering',
      'ZuriQO AI — 60 credits / day',
      'Switchable catalog presets (separate menus for different times or locations)',
      'AI description polish & storefront AI generation (fair-use limits)',
      'No Zuri Assist insights tab, live ops cards, or CSV spreadsheet import (Scale+)'
    ]
  },
  {
    tier: 'scale',
    title: 'Scale',
    subtitle: 'Flagship ops + unlimited AI',
    bullets: [
      'Everything in Growth',
      'Unlimited ZuriQO + storefront AI regenerations',
      'Guest menu image pills (For you / Reorder / Trending)',
      'Zuri Assist — insights, forecasts, promo ideas',
      'Live operations on Orders (rush, anomalies, today’s tops, low-stock flags)',
      'Menu: stock & low-stock fields, threshold alerts',
      'Market intelligence (anonymous Zuri Network benchmarks)',
      'Customer intelligence & premium analytics blocks',
      'CSV import for menu or ticket types'
    ]
  },
  {
    tier: 'enterprise',
    title: 'Enterprise',
    subtitle: 'Volume & custom terms',
    bullets: [
      'Everything in Scale',
      'Custom pricing, invoicing, and rollout support',
      'Priority onboarding — speak with the Zuri team'
    ]
  }
]

const GROWTH_PLUS: PlanId[] = ['growth', 'scale', 'pro', 'zuri_plus', 'enterprise', 'basic', 'advanced']
const SCALE_INSIGHTS: PlanId[] = ['scale', 'pro', 'zuri_plus', 'enterprise']

/** Short list for “your plan includes” callouts in onboarding. */
export function planHighlights(plan: PlanId | string | undefined): string[] {
  if (!plan || plan === 'free') {
    return ['ZuriQO (daily limits)', 'Upgrade to Starter for photos & logo']
  }
  if (plan === 'starter') {
    return ['Photos & logo', 'Higher ZuriQO daily credits', 'Upgrade to Growth for analytics, Tap & guest AI']
  }
  if (GROWTH_PLUS.includes(plan as PlanId) && !SCALE_INSIGHTS.includes(plan as PlanId)) {
    return ['Full Analytics & Zuri Tap', '60 ZuriQO credits / day', 'Upgrade to Scale for unlimited AI & Assist insights']
  }
  if (plan === 'enterprise') {
    return ['Everything in Scale', 'Custom contract & priority support']
  }
  if (SCALE_INSIGHTS.includes(plan as PlanId)) {
    return ['Unlimited ZuriQO', 'Assist insights + live ops', 'CSV import & stock alerts']
  }
  return ['See zuriqo.com/pricing for details']
}

