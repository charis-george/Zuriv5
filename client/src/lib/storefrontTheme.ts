import type { StorefrontConfig } from '../types'

/** Single source of truth for storefront defaults (customer menu + customizer). */
export const DEFAULT_STOREFRONT_CONFIG: StorefrontConfig = {
  brandColor: '#ffbd59',
  backgroundTone: 'light',
  heroOverlay: 'gradient',
  priceTextColor: '#ffbd59',
  fontFamily: 'sans',
  titleSize: 32,
  menuItemFontScale: 1,
  layout: 'grid',
  gridStyle: 'two_col',
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
  return { ...DEFAULT_STOREFRONT_CONFIG, ...(partial ?? {}) }
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

export function storefrontFontFamily(config: StorefrontConfig): string {
  if (config.fontFamily === 'serif') return 'Georgia, "Times New Roman", serif'
  if (config.fontFamily === 'mono') return '"JetBrains Mono", ui-monospace, monospace'
  return 'Inter, system-ui, sans-serif'
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

export function cardShadowClass(depth: StorefrontConfig['shadowDepth']): string {
  if (depth === 'deep') return 'shadow-lg shadow-black/15'
  if (depth === 'soft') return 'shadow-sm shadow-black/5'
  return ''
}
