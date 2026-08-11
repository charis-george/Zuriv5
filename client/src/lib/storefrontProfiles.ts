import type { Business, StorefrontConfig, StorefrontDetails, StorefrontEventPage, StorefrontProfile } from '../types'
import { DEFAULT_STOREFRONT_CONFIG } from './storefrontTheme'

export function slugifyStorefrontName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'storefront'
}

export function newStorefrontProfileId(): string {
  return `sf_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function defaultStorefrontDetails(name: string): StorefrontDetails {
  return {
    name: name.trim() || 'Your store',
    tagline: '',
    cuisineTags: []
  }
}

export function createDefaultStorefrontProfile(
  name = 'Main storefront',
  opts?: {
    id?: string
    slug?: string
    isDefault?: boolean
    catalogPresetId?: string | null
    config?: Partial<StorefrontConfig>
    details?: StorefrontDetails
  }
): StorefrontProfile {
  const label = name.trim() || 'Main storefront'
  const slug = opts?.slug || slugifyStorefrontName(label)
  return {
    id: opts?.id || newStorefrontProfileId(),
    slug,
    name: label,
    isDefault: opts?.isDefault !== false,
    catalogPresetId: opts?.catalogPresetId ?? null,
    config: { ...DEFAULT_STOREFRONT_CONFIG, ...(opts?.config ?? {}) },
    details: opts?.details ?? defaultStorefrontDetails(label)
  }
}

function normalizeProfile(raw: unknown, fallbackName: string): StorefrontProfile | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as StorefrontProfile
  const name = String(row.name || fallbackName || 'Storefront').trim() || 'Storefront'
  const slug = String(row.slug || slugifyStorefrontName(name)).trim() || slugifyStorefrontName(name)
  const details = row.details && typeof row.details === 'object' ? row.details : defaultStorefrontDetails(name)
  return {
    id: String(row.id || newStorefrontProfileId()),
    slug,
    name,
    isDefault: row.isDefault === true,
    catalogPresetId: row.catalogPresetId ?? null,
    config: { ...DEFAULT_STOREFRONT_CONFIG, ...(row.config && typeof row.config === 'object' ? row.config : {}) },
    details: {
      ...defaultStorefrontDetails(name),
      ...details,
      eventPages: Array.isArray(details.eventPages) ? details.eventPages : []
    }
  }
}

function dedupeProfileSlugs(profiles: StorefrontProfile[]): StorefrontProfile[] {
  const seen = new Set<string>()
  return profiles.map((profile, index) => {
    let slug = profile.slug
    let suffix = 2
    while (seen.has(slug)) {
      slug = `${profile.slug}-${suffix}`
      suffix += 1
    }
    seen.add(slug)
    return {
      ...profile,
      slug,
      isDefault: profile.isDefault || (index === 0 && !profiles.some((p) => p.isDefault))
    }
  })
}

export function normalizeStorefrontProfiles(business: Partial<Business> | null | undefined): StorefrontProfile[] {
  const businessName = business?.name || ''
  const rawProfiles = business?.storefrontProfiles
  if (Array.isArray(rawProfiles) && rawProfiles.length > 0) {
    const profiles = rawProfiles.map((p) => normalizeProfile(p, businessName)).filter((p): p is StorefrontProfile => !!p)
    if (profiles.length > 0) {
      if (!profiles.some((p) => p.isDefault)) profiles[0].isDefault = true
      return dedupeProfileSlugs(profiles)
    }
  }

  const legacyDetails: StorefrontDetails =
    business?.storefrontDetails && typeof business.storefrontDetails === 'object'
      ? business.storefrontDetails
      : defaultStorefrontDetails(businessName)
  const legacyConfig = business?.storefrontConfig && typeof business.storefrontConfig === 'object' ? business.storefrontConfig : {}

  return [
    createDefaultStorefrontProfile(legacyDetails.name?.trim() || businessName || 'Main storefront', {
      id: 'sf_default',
      slug: 'main',
      isDefault: true,
      config: legacyConfig,
      details: legacyDetails
    })
  ]
}

export function getDefaultStorefrontProfile(profiles: StorefrontProfile[]): StorefrontProfile | null {
  if (!profiles.length) return null
  return profiles.find((p) => p.isDefault) || profiles[0]
}

export function findStorefrontProfile(profiles: StorefrontProfile[], slugOrId?: string | null): StorefrontProfile | null {
  if (!slugOrId) return getDefaultStorefrontProfile(profiles)
  const norm = slugOrId.trim().toLowerCase()
  return (
    profiles.find((p) => p.id === slugOrId) ||
    profiles.find((p) => p.slug.trim().toLowerCase() === norm) ||
    getDefaultStorefrontProfile(profiles)
  )
}

export function findStorefrontForEvent(
  profiles: StorefrontProfile[],
  eventSlug: string
): { profile: StorefrontProfile; event: StorefrontEventPage } | null {
  const norm = eventSlug.trim().toLowerCase()
  if (!norm) return null
  for (const profile of profiles) {
    const pages = profile.details.eventPages ?? []
    const event = pages.find((p) => p.enabled !== false && p.slug.trim().toLowerCase() === norm)
    if (event) return { profile, event }
  }
  return null
}

export function findEventAcrossProfiles(
  profiles: StorefrontProfile[],
  eventSlug: string
): StorefrontEventPage | null {
  return findStorefrontForEvent(profiles, eventSlug)?.event ?? null
}

export function storefrontShareUrl(
  businessId: string,
  profile: StorefrontProfile,
  opts?: { publicSlug?: string | null }
): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://zuriqo.com'
  return `${origin}${storefrontSeoPath(businessId, profile, opts)}`
}

export function storefrontSeoPath(
  businessId: string,
  profile: StorefrontProfile,
  opts?: { publicSlug?: string | null }
): string {
  const publicSlug = String(opts?.publicSlug || '').trim()
  if (publicSlug && profile.isDefault) {
    return `/${encodeURIComponent(publicSlug)}`
  }
  if (profile.isDefault && profile.slug === 'main') {
    return `/order/${encodeURIComponent(businessId)}`
  }
  return `/order/${encodeURIComponent(businessId)}/${encodeURIComponent(profile.slug)}`
}

/** Canonical guest link for the default storefront. */
export function canonicalStorefrontPath(businessId: string, publicSlug?: string | null): string {
  const slug = String(publicSlug || '').trim()
  if (slug) return `/${encodeURIComponent(slug)}`
  return `/order/${encodeURIComponent(businessId)}`
}

export function canonicalStorefrontUrl(businessId: string, publicSlug?: string | null): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://zuriqo.com'
  return `${origin}${canonicalStorefrontPath(businessId, publicSlug)}`
}

export function applyStorefrontProfileToBusiness(business: Business, profile: StorefrontProfile): Business {
  return {
    ...business,
    storefrontConfig: profile.config,
    storefrontDetails: profile.details,
    activeStorefrontId: profile.id,
    activeStorefrontSlug: profile.slug
  }
}

export function updateProfileInList(
  profiles: StorefrontProfile[],
  profileId: string,
  patch: Partial<Pick<StorefrontProfile, 'name' | 'slug' | 'isDefault' | 'catalogPresetId' | 'config' | 'details'>>
): StorefrontProfile[] {
  return profiles.map((p) => (p.id === profileId ? { ...p, ...patch } : p))
}

export function resolveActiveStorefrontProfile(
  business: Business | null | undefined,
  opts?: { storefrontSlug?: string | null; eventSlug?: string | null }
): StorefrontProfile | null {
  if (!business) return null
  const profiles = normalizeStorefrontProfiles(business)
  if (opts?.eventSlug) {
    const hit = findStorefrontForEvent(profiles, opts.eventSlug)
    if (hit) return hit.profile
  }
  return findStorefrontProfile(profiles, opts?.storefrontSlug)
}
