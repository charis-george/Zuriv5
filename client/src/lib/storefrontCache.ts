import type { Business, MenuCategory } from '../types'

const CACHE_PREFIX = 'zuri_storefront_v1_'
const TTL_MS = 45 * 60 * 1000

export type StorefrontCachePayload = {
  business: Business
  menu: MenuCategory[]
  savedAt: number
}

export function readStorefrontCache(businessId: string): StorefrontCachePayload | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(`${CACHE_PREFIX}${businessId}`)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StorefrontCachePayload
    if (!parsed?.business || !Array.isArray(parsed.menu)) return null
    if (Date.now() - (parsed.savedAt || 0) > TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

export function clearStorefrontCache(businessId: string): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(`${CACHE_PREFIX}${businessId}`)
  } catch {
    /* ignore */
  }
}

export function writeStorefrontCache(businessId: string, business: Business, menu: MenuCategory[]): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const payload: StorefrontCachePayload = { business, menu, savedAt: Date.now() }
    sessionStorage.setItem(`${CACHE_PREFIX}${businessId}`, JSON.stringify(payload))
  } catch {
    /* quota or private mode */
  }
}
