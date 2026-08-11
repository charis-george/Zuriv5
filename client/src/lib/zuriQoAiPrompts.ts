export type ZuriQoTier = 1 | 2 | 3 | 4

export type ZuriQoChip = {
  id: string
  label: string
  prompt: string
  tier: ZuriQoTier
  icon: 'orders' | 'chart' | 'stock' | 'draft' | 'action' | 'agent'
}

export const ZURIQO_CHIPS: ZuriQoChip[] = [
  { id: 'orders-today', label: 'Orders today', prompt: 'How many orders came in today?', tier: 1, icon: 'orders' },
  { id: 'top-seller', label: 'Top seller', prompt: "What's my top-selling item this month?", tier: 1, icon: 'chart' },
  { id: 'low-stock', label: 'Low stock', prompt: "What's my current low-stock list?", tier: 1, icon: 'stock' },
  { id: 'revenue', label: 'Revenue today', prompt: "Show me today's revenue vs this week", tier: 1, icon: 'chart' },
  { id: 'draft-promo', label: 'Draft promo', prompt: 'Draft a promo message for our Friday special to past guests', tier: 2, icon: 'draft' },
  { id: 'draft-item', label: 'Draft item', prompt: 'Draft a new menu item from a short description with name, style, and price', tier: 2, icon: 'draft' },
  { id: 'mark-done', label: 'Mark fulfilled', prompt: 'Mark the oldest open order as fulfilled', tier: 3, icon: 'action' },
  { id: 'mark-unavailable', label: 'Mark unavailable', prompt: 'Mark my first low-stock item unavailable', tier: 3, icon: 'action' },
  { id: 'restock', label: 'Restock item', prompt: 'Add my first low-stock item back in stock', tier: 3, icon: 'action' },
  { id: 'reconcile', label: 'Reconcile Assist', prompt: "Go through today's unmatched Zuri Assist transactions and try to resolve them", tier: 4, icon: 'agent' },
  { id: 'anomaly', label: 'Anomaly watch', prompt: 'Run anomaly watch on today’s order volume', tier: 4, icon: 'agent' },
  { id: 'inventory-agent', label: 'Inventory agent', prompt: 'Run the inventory-to-menu agent on current stock', tier: 4, icon: 'agent' }
]

export const ZURIQO_TIER_META: Record<
  ZuriQoTier,
  { label: string; hint: string }
> = {
  1: { label: 'Ask', hint: 'Instant answers — nothing changes' },
  2: { label: 'Draft', hint: 'You review before anything goes live' },
  3: { label: 'Action', hint: 'Confirm before ZuriQO changes orders or stock' },
  4: { label: 'Agent', hint: 'Multi-step work across Assist, catalog, and sales' }
}
