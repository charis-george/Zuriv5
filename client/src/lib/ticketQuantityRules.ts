/** Ticketing purchase rules shared by storefront checkout UI. */



export type TicketRuleItem = {

  groupSize?: number | null

  minPerOrder?: number | null

  maxPerUser?: number | null

  /** Total capacity for this ticket tier (null = unlimited) */

  stockOnHand?: number | null

  totalCapacity?: number | null

  /** Tickets already sold (paid + pending checkout) */

  ticketsSold?: number | null

}



export function getTicketStep(item: TicketRuleItem): number {

  const g = Number(item.groupSize)

  return Number.isFinite(g) && g > 1 ? Math.floor(g) : 1

}



export function getMinTicketQty(item: TicketRuleItem): number {

  const step = getTicketStep(item)

  const minOrder = Number(item.minPerOrder)

  const minFromOrder = Number.isFinite(minOrder) && minOrder > 1 ? Math.floor(minOrder) : 1

  return Math.max(minFromOrder, step)

}



export function getTicketCapacity(item: TicketRuleItem): number | null {

  const cap = item.stockOnHand ?? item.totalCapacity

  if (cap == null) return null

  const n = Number(cap)

  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null

}



export function getTicketsRemaining(item: TicketRuleItem): number | null {

  const cap = getTicketCapacity(item)

  if (cap == null) return null

  const sold = Number(item.ticketsSold)

  const soldCount = Number.isFinite(sold) && sold >= 0 ? Math.floor(sold) : 0

  return Math.max(0, cap - soldCount)

}



export function getMaxTicketQty(item: TicketRuleItem, fallback = 20): number {

  const perUserRaw = Number(item.maxPerUser)

  const perUser =

    Number.isFinite(perUserRaw) && perUserRaw >= 1 ? Math.floor(perUserRaw) : fallback

  const remaining = getTicketsRemaining(item)

  if (remaining == null) return perUser

  if (remaining <= 0) return 0

  return Math.min(perUser, remaining)

}



export function isTicketSoldOut(item: TicketRuleItem): boolean {

  const remaining = getTicketsRemaining(item)

  return remaining != null && remaining <= 0

}



export function isValidTicketQty(qty: number, item: TicketRuleItem): boolean {

  if (qty <= 0) return true

  if (isTicketSoldOut(item)) return false

  const step = getTicketStep(item)

  const min = getMinTicketQty(item)

  const max = getMaxTicketQty(item)

  if (max <= 0) return false

  if (qty < min || qty > max) return false

  if (step > 1 && qty % step !== 0) return false

  return true

}



/** Snap a requested quantity to the nearest allowed value (0 removes from cart). */

export function normalizeTicketQty(qty: number, item: TicketRuleItem): number {

  if (qty <= 0) return 0

  if (isTicketSoldOut(item)) return 0

  const step = getTicketStep(item)

  const min = getMinTicketQty(item)

  const max = getMaxTicketQty(item)

  if (max <= 0) return 0

  let n = Math.min(max, Math.max(min, qty))

  if (step > 1) {

    n = Math.ceil(n / step) * step

    if (n < min) n = min

    if (n > max) {

      n = Math.floor(max / step) * step

      if (n < min) return 0

    }

  }

  return n

}



export function nextTicketQty(current: number, direction: 'up' | 'down', item: TicketRuleItem): number {

  const step = getTicketStep(item)

  const min = getMinTicketQty(item)

  const max = getMaxTicketQty(item)



  if (direction === 'up') {

    if (max <= 0) return current

    if (current <= 0) return Math.min(min, max)

    const next = current + step

    return next <= max ? next : current

  }



  if (current <= 0) return 0

  const next = current - step

  return next < min ? 0 : next

}



export function validateCartTicketQuantities(

  cart: Array<{ name: string; quantity: number } & TicketRuleItem>

): string | null {

  for (const item of cart) {

    if (item.quantity <= 0) continue

    if (isTicketSoldOut(item)) {

      return `${item.name} is sold out.`

    }

    if (isValidTicketQty(item.quantity, item)) continue



    const min = getMinTicketQty(item)

    const max = getMaxTicketQty(item)

    const step = getTicketStep(item)



    if (item.quantity < min) {

      return `${item.name} requires at least ${min} ticket${min === 1 ? '' : 's'} per order.`

    }

    if (item.quantity > max) {

      if (item.maxPerUser && max === Number(item.maxPerUser)) {

        return `${item.name} is limited to ${max} ticket${max === 1 ? '' : 's'} per buyer.`

      }

      const remaining = getTicketsRemaining(item)

      if (remaining != null && item.quantity > remaining) {

        return `Only ${remaining} ticket${remaining === 1 ? '' : 's'} left for ${item.name}.`

      }

      return `${item.name} is limited to ${max} ticket${max === 1 ? '' : 's'} per order.`

    }

    if (step > 1) {

      return `${item.name} must be purchased in groups of ${step}.`

    }

    return `${item.name} has an invalid ticket quantity.`

  }

  return null

}



export function ticketQtyOptions(

  item: TicketRuleItem,

  fallbackMax = 20

): { value: string; label: string }[] {

  const step = getTicketStep(item)

  const min = getMinTicketQty(item)

  const max = getMaxTicketQty(item, fallbackMax)

  const options: { value: string; label: string }[] = [{ value: '0', label: '0' }]

  if (max <= 0) return options

  for (let v = min; v <= max; v += step) {

    options.push({

      value: String(v),

      label: step > 1 ? `${v} (${v / step} group${v / step > 1 ? 's' : ''})` : String(v)

    })

  }

  return options

}

