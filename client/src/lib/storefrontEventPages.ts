import type { StorefrontEventLineupItem, StorefrontEventPage } from '../types'

export function slugifyEventTitle(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return base || 'event'
}

export function createDefaultEventPage(title = 'Main event'): StorefrontEventPage {
  const slug = slugifyEventTitle(title)
  return {
    id: `evt_${Date.now().toString(36)}`,
    slug,
    title,
    subtitle: 'An evening you will not forget',
    coverImageUrl: null,
    eventStartsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    showCountdown: true,
    lineup: [
      { name: 'Headline act', role: 'Main stage' },
      { name: 'Supporting DJ', role: 'Warm-up' }
    ],
    enabled: true,
    refundPolicy: 'full_before_event',
    refundPolicyText: 'Full refund if the event is cancelled by the venue. No refunds within 24 hours of start time unless the venue agrees.',
    eventTemplate: 'classic',
  }
}

export function formatRefundPolicyLabel(policy: StorefrontEventPage['refundPolicy']): string {
  if (policy === 'no_refunds') return 'No refunds'
  if (policy === 'full_before_event') return 'Full refund if venue cancels event'
  return 'Custom policy'
}

export function findEventPage(pages: StorefrontEventPage[] | undefined, slug: string): StorefrontEventPage | null {
  if (!pages?.length || !slug) return null
  const norm = slug.trim().toLowerCase()
  return pages.find((p) => p.enabled !== false && p.slug.trim().toLowerCase() === norm) ?? null
}

export function eventShareUrl(businessId: string, slug: string): string {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/event/${encodeURIComponent(businessId)}/${encodeURIComponent(slug)}`
  }
  return `https://zuriqo.com/event/${encodeURIComponent(businessId)}/${encodeURIComponent(slug)}`
}

export function whatsappShareHref(url: string, text: string): string {
  const msg = `${text}\n${url}`
  return `https://wa.me/?text=${encodeURIComponent(msg)}`
}

export function formatEventCountdown(iso: string, now = Date.now()): { days: number; hours: number; mins: number; secs: number; past: boolean } {
  const target = new Date(iso).getTime()
  if (!Number.isFinite(target)) {
    return { days: 0, hours: 0, mins: 0, secs: 0, past: true }
  }
  const diff = Math.max(0, target - now)
  const past = target <= now
  const days = Math.floor(diff / 86400000)
  const hours = Math.floor((diff % 86400000) / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  const secs = Math.floor((diff % 60000) / 1000)
  return { days, hours, mins, secs, past }
}

export function normalizeLineup(raw: unknown): StorefrontEventLineupItem[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null
      const name = String((row as StorefrontEventLineupItem).name || '').trim()
      if (!name) return null
      const role = String((row as StorefrontEventLineupItem).role || '').trim()
      return role ? { name, role } : { name }
    })
    .filter((x): x is StorefrontEventLineupItem => !!x)
}
