import type { AiGuestStorefrontConfig, StorefrontConfig } from '../types'
import { ensureGoogleFontPairingLoaded, getFontPairing, normalizeFontPairingId } from './storefrontFontPairings'

export const DEFAULT_AI_GUEST: AiGuestStorefrontConfig = {
  trendingOnMenu: false,
  intelligentUpsell: false,
  personalisedRecs: false,
  tasteSortEnabled: false,
  translationsEnabled: false,
  dietaryPromptEnabled: false,
  localPaymentHints: false,
  sharedTableHints: false
}

/** Single source of truth for storefront defaults (customer menu + customizer). */
export const DEFAULT_STOREFRONT_CONFIG: StorefrontConfig = {
  brandColor: '#ffbd59',
  backgroundTone: 'light',
  heroOverlay: 'gradient',
  priceTextColor: '#ffbd59',
  fontFamily: 'modern',
  titleSize: 32,
  menuItemFontScale: 1,
  menuTemplate: 'classic',
  layout: 'grid',
  gridStyle: 'two_col',
  cardLayout: 'stacked',
  showPhotos: true,
  showDescriptions: true,
  showCalories: false,
  showRatings: false,
  cardSize: 1,
  cardImageShape: 'rounded',
  cardGap: 14,
  cardRadius: 16,
  dividerStyle: 'soft',
  pillShape: 'pill',
  sectionTitleTreatment: 'underlined',
  shadowDepth: 'soft',
  categoryStripBorder: true,
  heroHeight: 220
}

export type StorefrontThemeColors = {
  page: string
  panel: string
  text: string
  sub: string
  border: string
}

export function mergeStorefrontConfig(partial?: Partial<StorefrontConfig> | null): StorefrontConfig {
  const merged = { ...DEFAULT_STOREFRONT_CONFIG, ...(partial ?? {}) }
  merged.aiGuest = { ...DEFAULT_AI_GUEST, ...(partial?.aiGuest ?? {}) }
  if (!merged.cardLayout) merged.cardLayout = 'stacked'
  merged.fontFamily = normalizeFontPairingId(merged.fontFamily) as StorefrontConfig['fontFamily']
  return merged
}

export function getStorefrontTheme(config: StorefrontConfig): StorefrontThemeColors {
  if (config.backgroundTone === 'dark') {
    return { page: '#0B1220', panel: '#0F172A', text: '#F9FAFB', sub: '#9CA3AF', border: '#1F2937' }
  }
  if (config.backgroundTone === 'warm') {
    return { page: '#FFF7ED', panel: '#FFFFFF', text: '#111827', sub: '#6B7280', border: '#FED7AA' }
  }
  return { page: '#F5F5F5', panel: '#FFFFFF', text: '#111827', sub: '#6B7280', border: '#E5E7EB' }
}

export type StorefrontFontStyles = {
  body: string
  heading: string
  pairingId: ReturnType<typeof normalizeFontPairingId>
}

export function storefrontFontStyles(config: StorefrontConfig): StorefrontFontStyles {
  const pairingId = normalizeFontPairingId(config.fontFamily)
  ensureGoogleFontPairingLoaded(pairingId)
  const preset = getFontPairing(pairingId)
  return { body: preset.bodyFont, heading: preset.headingFont, pairingId }
}

/** Body font stack for layout chrome and menu items. */
export function storefrontFontFamily(config: StorefrontConfig): string {
  return storefrontFontStyles(config).body
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h
  if (full.length !== 6 || Number.isNaN(parseInt(full, 16))) {
    return `rgba(249, 115, 22, ${alpha})`
  }
  const n = parseInt(full, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}

export function getHeroBackground(config: StorefrontConfig): string {
  const c = config.brandColor
  switch (config.heroOverlay) {
    case 'solid':
      return c
    case 'dim':
      return `linear-gradient(180deg, rgba(0,0,0,0.35) 0%, rgba(0,0,0,0.78) 100%), linear-gradient(135deg, ${c}, #111827)`
    case 'split':
      return `linear-gradient(110deg, ${c} 0%, ${c} 44%, #111827 44%, #0f172a 100%)`
    case 'gradient':
    default:
      return `linear-gradient(135deg, ${c}, #111827)`
  }
}

/** Scrim over a hero photo so title/tagline stay readable; follows `heroOverlay`. */
export function getHeroBannerScrim(config: StorefrontConfig): string {
  const c = config.brandColor
  const tint = hexToRgba(c, 0.5)
  switch (config.heroOverlay) {
    case 'solid':
      return `linear-gradient(180deg, ${hexToRgba(c, 0.35)} 0%, ${hexToRgba(c, 0.72)} 100%)`
    case 'dim':
      return 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.78) 100%)'
    case 'split':
      return `linear-gradient(110deg, ${tint} 0%, ${tint} 44%, rgba(15,23,42,0.88) 44%, rgba(15,23,42,0.92) 100%)`
    case 'gradient':
    default:
      return `linear-gradient(135deg, ${tint} 0%, rgba(17,24,39,0.88) 100%)`
  }
}

export function cardShadowClass(depth: StorefrontConfig['shadowDepth']): string {
  if (depth === 'deep') return 'shadow-lg shadow-black/15'
  if (depth === 'soft') return 'shadow-sm shadow-black/5'
  return ''
}
