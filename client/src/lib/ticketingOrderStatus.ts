/** Ticketing-specific order status labels and actions (maps to shared DB statuses). */

export type OrderFulfillmentStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'

export type TicketingOrderFilter = 'all' | 'new' | 'confirmed' | 'checked_in' | 'fulfilled'

const TICKETING_LABELS: Record<OrderFulfillmentStatus, string> = {
  pending: 'New sale',
  preparing: 'Confirmed',
  ready: 'Checked in',
  completed: 'Fulfilled',
  cancelled: 'Cancelled'
}

const TICKETING_COLORS: Record<OrderFulfillmentStatus, string> = {
  pending: 'bg-amber-100 text-amber-900',
  preparing: 'bg-sky-100 text-sky-900',
  ready: 'bg-violet-100 text-violet-900',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800'
}

const MENU_COLORS: Record<OrderFulfillmentStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  preparing: 'bg-blue-100 text-blue-800',
  ready: 'bg-green-100 text-green-800',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800'
}

export function formatOrderStatusLabel(
  status: OrderFulfillmentStatus,
  isTicketing: boolean
): string {
  if (isTicketing) return TICKETING_LABELS[status] || status
  return status
}

export function getOrderStatusColor(
  status: OrderFulfillmentStatus,
  isTicketing: boolean
): string {
  const map = isTicketing ? TICKETING_COLORS : MENU_COLORS
  return map[status] || map.pending
}

export type OrderStatusAction = {
  label: string
  nextStatus: OrderFulfillmentStatus
  variant?: 'primary' | 'secondary' | 'success' | 'danger'
}

export function getOrderStatusActions(
  status: OrderFulfillmentStatus,
  isTicketing: boolean
): OrderStatusAction[] {
  if (isTicketing) {
    if (status === 'pending') {
      return [
        { label: 'Confirm sale', nextStatus: 'preparing', variant: 'primary' },
        { label: 'Cancel', nextStatus: 'cancelled', variant: 'danger' }
      ]
    }
    if (status === 'preparing') {
      return [{ label: 'Check in', nextStatus: 'ready', variant: 'primary' }]
    }
    if (status === 'ready') {
      return [{ label: 'Mark fulfilled', nextStatus: 'completed', variant: 'success' }]
    }
    return []
  }

  if (status === 'pending') {
    return [
      { label: 'Start preparing', nextStatus: 'preparing', variant: 'primary' },
      { label: 'Cancel', nextStatus: 'cancelled', variant: 'danger' }
    ]
  }
  if (status === 'preparing') {
    return [{ label: 'Mark ready', nextStatus: 'ready', variant: 'primary' }]
  }
  if (status === 'ready') {
    return [{ label: 'Mark completed', nextStatus: 'completed', variant: 'success' }]
  }
  return []
}

export function matchesTicketingOrderFilter(
  status: OrderFulfillmentStatus,
  filter: TicketingOrderFilter
): boolean {
  if (filter === 'all') return true
  if (filter === 'new') return status === 'pending'
  if (filter === 'confirmed') return status === 'preparing'
  if (filter === 'checked_in') return status === 'ready'
  if (filter === 'fulfilled') return status === 'completed'
  return true
}

export function ticketingOrdersSectionTitle(isTicketing: boolean): string {
  return isTicketing ? 'Ticket sales' : 'Recent orders'
}
