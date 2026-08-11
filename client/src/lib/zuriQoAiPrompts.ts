export type ZuriQoTier = 1 | 2 | 3 | 4

export type ZuriQoChip = {
  id: string
  label: string
  prompt: string
  tier: ZuriQoTier
  icon: 'orders' | 'chart' | 'stock' | 'draft' | 'action' | 'agent'
}

export type ZuriQoGuide = {
  destination: string
  title: string
  steps: string[]
  tip?: string | null
}

export const ZURIQO_CHIPS: ZuriQoChip[] = [
  { id: 'snapshot', label: 'Snapshot', prompt: 'Give me a live business snapshot and what I should do next', tier: 1, icon: 'chart' },
  { id: 'orders-today', label: 'Orders today', prompt: 'How many orders came in today?', tier: 1, icon: 'orders' },
  { id: 'tap-help', label: 'Zuri Tap', prompt: 'Help me with Zuri Tap — status and how to use it on the floor', tier: 1, icon: 'action' },
  { id: 'where-tap', label: 'Where is Tap?', prompt: 'Where do I turn on Zuri Tap?', tier: 1, icon: 'action' },
  { id: 'draft-item', label: 'Draft item', prompt: 'Draft a new menu item from a short description with name, style, and price', tier: 2, icon: 'draft' },
  { id: 'switch-shop', label: 'Switch to shop', prompt: 'Switch my storefront to shop mode', tier: 3, icon: 'action' },
  { id: 'switch-menu', label: 'Switch to menu', prompt: 'Switch my storefront to menu mode', tier: 3, icon: 'action' },
  { id: 'switch-tickets', label: 'Switch to tickets', prompt: 'Switch my storefront to ticketing mode', tier: 3, icon: 'action' },
  { id: 'tap-on', label: 'Turn Tap on', prompt: 'Turn Zuri Tap on', tier: 3, icon: 'action' },
  { id: 'mark-done', label: 'Mark fulfilled', prompt: 'Mark the oldest open order as fulfilled', tier: 3, icon: 'action' },
  { id: 'tap-coach', label: 'Tap coach', prompt: 'Run the Zuri Tap coach and tell me how to improve Tap on the floor', tier: 4, icon: 'agent' },
  { id: 'reconcile', label: 'Reconcile Assist', prompt: "Go through today's unmatched Zuri Assist transactions and try to resolve them", tier: 4, icon: 'agent' }
]

export const ZURIQO_TIER_META: Record<
  ZuriQoTier,
  { label: string; hint: string }
> = {
  1: { label: 'Ask', hint: 'Instant answers — nothing changes' },
  2: { label: 'Draft', hint: 'You review before anything goes live' },
  3: { label: 'Action', hint: 'Confirm before ZuriQO changes orders, mode, or Tap' },
  4: { label: 'Agent', hint: 'Multi-step work across Assist, Tap, and catalog' }
}
