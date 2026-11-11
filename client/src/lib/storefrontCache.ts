import type { Business, MenuCategory } from '../types'

const CACHE_PREFIX = 'zuri_storefront_v2_'
const TTL_MS = 45 * 60 * 1000

export type StorefrontCachePayload = {
  business: Business
  menu: MenuCategory[]
  savedAt: number
  storefrontKey: string
}

function cacheKey(businessId: string, storefrontSlug?: string | null): string {
  const slug = (storefrontSlug || 'default').trim().toLowerCase() || 'default'
  return `${CACHE_PREFIX}${businessId}_${slug}`
}

export function readStorefrontCache(businessId: string, storefrontSlug?: string | null): StorefrontCachePayload | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(cacheKey(businessId, storefrontSlug))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StorefrontCachePayload
    if (!parsed?.business || !Array.isArray(parsed.menu)) return null
    if (Date.now() - (parsed.savedAt || 0) > TTL_MS) return null
    return parsed
  } catch {
    return null
  }
}

export function clearStorefrontCache(businessId: string, storefrontSlug?: string | null): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(cacheKey(businessId, storefrontSlug))
    if (!storefrontSlug) {
      sessionStorage.removeItem(cacheKey(businessId, 'default'))
    }
  } catch {
    /* ignore */
  }
}

export function writeStorefrontCache(
  businessId: string,
  business: Business,
  menu: MenuCategory[],
  storefrontSlug?: string | null
): void {
  if (typeof sessionStorage === 'undefined') return
  try {
    const key = cacheKey(businessId, storefrontSlug || business.activeStorefrontSlug)
    const payload: StorefrontCachePayload = {
      business,
      menu,
      savedAt: Date.now(),
      storefrontKey: key
    }
    sessionStorage.setItem(key, JSON.stringify(payload))
  } catch {
    /* quota or private mode */
  }
}
