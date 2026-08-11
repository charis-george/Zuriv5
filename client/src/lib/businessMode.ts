import type { BusinessMode } from '../types'

export function normalizeBusinessMode(raw: unknown): BusinessMode {
  const v = String(raw || '')
    .trim()
    .toLowerCase()
  if (v === 'ticketing' || v === 'ticket' || v === 'tickets' || v === 'event' || v === 'events') {
    return 'ticketing'
  }
  if (v === 'shop' || v === 'shops' || v === 'catalog' || v === 'retail' || v === 'store') {
    return 'shop'
  }
  return 'menu'
}

export function isTicketingMode(mode: unknown): boolean {
  return normalizeBusinessMode(mode) === 'ticketing'
}

export function isShopMode(mode: unknown): boolean {
  return normalizeBusinessMode(mode) === 'shop'
}

export function catalogNounForMode(mode: unknown): 'menu' | 'catalog' | 'tickets' {
  const m = normalizeBusinessMode(mode)
  if (m === 'ticketing') return 'tickets'
  if (m === 'shop') return 'catalog'
  return 'menu'
}

export function catalogLabelForMode(mode: unknown): string {
  const m = normalizeBusinessMode(mode)
  if (m === 'ticketing') return 'Tickets'
  if (m === 'shop') return 'Catalog'
  return 'Menu'
}

export function businessModeLabel(mode: unknown): string {
  const m = normalizeBusinessMode(mode)
  if (m === 'ticketing') return 'Tickets'
  if (m === 'shop') return 'Shops'
  return 'Menus'
}
