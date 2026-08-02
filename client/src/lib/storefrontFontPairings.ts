import type { StorefrontFontPairingId } from '../types'

export type FontPairingPreset = {
  id: StorefrontFontPairingId
  label: string
  personality: string
  headingFont: string
  bodyFont: string
  googleFamilies: string
}

/** Minimal sans presets — one family per option, light weights only. */
export const STOREFRONT_FONT_PAIRINGS: FontPairingPreset[] = [
  {
    id: 'modern',
    label: 'Inter',
    personality: 'Default · clean UI',
    headingFont: '"Inter", system-ui, sans-serif',
    bodyFont: '"Inter", system-ui, sans-serif',
    googleFamilies: 'family=Inter:wght@400;500;600'
  },
  {
    id: 'artisanal',
    label: 'DM Sans',
    personality: 'Soft · easy to read',
    headingFont: '"DM Sans", system-ui, sans-serif',
    bodyFont: '"DM Sans", system-ui, sans-serif',
    googleFamilies: 'family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600'
  },
  {
    id: 'luxe',
    label: 'Outfit',
    personality: 'Light · modern sans',
    headingFont: '"Outfit", system-ui, sans-serif',
    bodyFont: '"Outfit", system-ui, sans-serif',
    googleFamilies: 'family=Outfit:wght@400;500;600'
  },
  {
    id: 'playful',
    label: 'Plus Jakarta',
    personality: 'Friendly · still minimal',
    headingFont: '"Plus Jakarta Sans", system-ui, sans-serif',
    bodyFont: '"Plus Jakarta Sans", system-ui, sans-serif',
    googleFamilies: 'family=Plus+Jakarta+Sans:wght@400;500;600'
  },
  {
    id: 'classic',
    label: 'Source Sans',
    personality: 'Neutral · hospitality',
    headingFont: '"Source Sans 3", system-ui, sans-serif',
    bodyFont: '"Source Sans 3", system-ui, sans-serif',
    googleFamilies: 'family=Source+Sans+3:wght@400;500;600'
  },
  {
    id: 'nightlife',
    label: 'Work Sans',
    personality: 'Simple · events & menus',
    headingFont: '"Work Sans", system-ui, sans-serif',
    bodyFont: '"Work Sans", system-ui, sans-serif',
    googleFamilies: 'family=Work+Sans:wght@400;500;600'
  }
]

const PAIRING_BY_ID = Object.fromEntries(STOREFRONT_FONT_PAIRINGS.map((p) => [p.id, p])) as Record<
  StorefrontFontPairingId,
  FontPairingPreset
>

/** Map legacy sans / serif / mono saves to curated presets. */
export function normalizeFontPairingId(raw?: string | null): StorefrontFontPairingId {
  if (raw === 'artisanal' || raw === 'luxe' || raw === 'playful' || raw === 'classic' || raw === 'nightlife') {
    return raw
  }
  if (raw === 'serif' || raw === 'mono') return 'modern'
  return 'modern'
}

export function getFontPairing(id?: string | null): FontPairingPreset {
  return PAIRING_BY_ID[normalizeFontPairingId(id)] ?? PAIRING_BY_ID.modern
}

const loadedPairingLinks = new Set<string>()

export function ensureGoogleFontPairingLoaded(id?: string | null): void {
  if (typeof document === 'undefined') return
  const preset = getFontPairing(id)
  const href = `https://fonts.googleapis.com/css2?${preset.googleFamilies}&display=swap`
  if (loadedPairingLinks.has(href)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  document.head.appendChild(link)
  loadedPairingLinks.add(href)
}
