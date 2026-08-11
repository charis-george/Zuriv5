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
 * Current Zuri capability map by paid tier. Wording matches dashboard + server gates
 * (Growth+ = analytics & guest menu AI; Scale+ = Zuri Assist tab, live ops, market intel, CSV import).
 */
export const ZURI_FEATURES_BY_TIER: TierFeatureBlock[] = [
  {
    tier: 'free',
    title: 'Free',
    subtitle: 'Try the flow end-to-end',
    bullets: [
      'QR link & customer order page',
      'Menu categories & items (text-only; no item photos)',
      'Free AI menu upload from photo or PDF (limited uses)',
      'Orders, statuses, reservations inbox, post-payment reviews',
      'Online payments when you connect Paystack',
      'No Analytics tab, no Zuri Tap, no guest-side AI menu'
    ]
  },
  {
    tier: 'starter',
    title: 'Starter',
    subtitle: 'Look professional from day one',
    bullets: [
      'Everything in Free',
      'Item photos & business logo',
      'More AI menu uploads from photo or PDF',
      'Still no Analytics tab, Zuri Tap, or guest AI menu (upgrade to unlock)'
    ]
  },
  {
    tier: 'growth',
    title: 'Growth',
    subtitle: 'Data + African guest menu AI',
    bullets: [
      'Everything in Starter',
      'Analytics: sales, trends, popular items, peak hours, profit table (with costs)',
      'Zuri Tap in-venue ordering',
      'Guest menu Zuri Assist: trending, upsells, taste sort, Hausa / Yorùbá / Igbo names, dietary chips (owner-togglable)',
      'Switchable catalog presets (separate menus for different times or locations)',
      'AI description polish & storefront AI generation (fair-use limits)',
      'Per-item guest-language names in the menu editor',
      'No Zuri Assist dashboard tab, live ops cards, or CSV spreadsheet import (Scale+)'
    ]
  },
  {
    tier: 'scale',
    title: 'Scale',
    subtitle: 'Flagship ops + intelligence',
    bullets: [
      'Everything in Growth',
      'Zuri Assist tab: revenue insights, forecasts, promo ideas, chat',
      'Live operations on Orders (rush, anomalies, today’s tops, low-stock flags)',
      'Menu: stock & low-stock fields, threshold alerts',
      'Market intelligence (anonymous Zuri Network benchmarks)',
      'Customer intelligence & premium analytics blocks',
      'CSV import for menu or ticket types',
      'Higher/unlimited storefront AI regen vs Growth'
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
    return ['Orders & QR menu', 'Upgrade to Starter for photos & logo']
  }
  if (plan === 'starter') {
    return ['Photos & logo', 'Upgrade to Growth for analytics & guest AI menu']
  }
  if (GROWTH_PLUS.includes(plan as PlanId) && !SCALE_INSIGHTS.includes(plan as PlanId)) {
    return ['Full Analytics & Zuri Tap', 'Guest AI menu (trending, languages, taste)', 'Upgrade to Scale for Zuri Assist tab & CSV import']
  }
  if (plan === 'enterprise') {
    return ['Everything in Scale', 'Custom contract & priority support']
  }
  if (SCALE_INSIGHTS.includes(plan as PlanId)) {
    return ['Zuri Assist + live ops', 'Market intelligence', 'CSV import & stock alerts']
  }
  return ['See zuriqo.com/pricing for details']
}
