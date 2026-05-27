import type { StorefrontConfig, StorefrontMenuTemplateId } from '../types'
import { DEFAULT_STOREFRONT_CONFIG, mergeStorefrontConfig } from './storefrontTheme'

export type StorefrontMenuTemplate = {
  id: StorefrontMenuTemplateId
  name: string
  description: string
  /** Short labels for the picker (e.g. Light, List) */
  tags: string[]
  preview: { page: string; accent: string; panel: string }
  config: Partial<StorefrontConfig>
}

/** Preset menu layouts inspired by modern food-app references (marketplace, bistro, dark discovery, express list, etc.) */
export const STOREFRONT_MENU_TEMPLATES: StorefrontMenuTemplate[] = [
  {
    id: 'classic',
    name: 'Classic ZURI',
    description: 'Balanced two-column grid with photos — the default guest menu.',
    tags: ['Light', 'Grid'],
    preview: { page: '#f5f5f5', accent: '#ffbd59', panel: '#ffffff' },
    config: {
      menuTemplate: 'classic',
      brandColor: '#ffbd59',
      backgroundTone: 'light',
      heroOverlay: 'gradient',
      priceTextColor: '#ffbd59',
      fontFamily: 'sans',
      layout: 'grid',
      gridStyle: 'two_col',
      cardLayout: 'stacked',
      showPhotos: true,
      showDescriptions: true,
      cardRadius: 16,
      cardGap: 14,
      shadowDepth: 'soft',
      sectionTitleTreatment: 'underlined',
      cardImageShape: 'rounded',
      heroHeight: 220,
    },
  },
  {
    id: 'marketplace',
    name: 'Fresh Market',
    description: 'Bright discovery feel with category chips and a friendly card grid.',
    tags: ['Light', 'Chips'],
    preview: { page: '#fafafa', accent: '#16a34a', panel: '#ffffff' },
    config: {
      menuTemplate: 'marketplace',
      brandColor: '#16a34a',
      priceTextColor: '#16a34a',
      backgroundTone: 'light',
      heroOverlay: 'gradient',
      fontFamily: 'sans',
      layout: 'grid',
      gridStyle: 'two_col',
      cardLayout: 'stacked',
      showPhotos: true,
      showDescriptions: true,
      cardRadius: 20,
      cardGap: 12,
      shadowDepth: 'soft',
      sectionTitleTreatment: 'chip',
      pillShape: 'pill',
      categoryStripBorder: false,
      heroHeight: 200,
    },
  },
  {
    id: 'bistro',
    name: 'Warm Bistro',
    description: 'Cream tones, serif type, and wide hero cards — bakery & café style.',
    tags: ['Warm', 'Wide'],
    preview: { page: '#fff7ed', accent: '#c2410c', panel: '#ffffff' },
    config: {
      menuTemplate: 'bistro',
      brandColor: '#ea580c',
      priceTextColor: '#c2410c',
      backgroundTone: 'warm',
      heroOverlay: 'dim',
      fontFamily: 'serif',
      layout: 'cards',
      gridStyle: 'wide_cards',
      cardLayout: 'stacked',
      showPhotos: true,
      showDescriptions: true,
      cardRadius: 22,
      cardGap: 18,
      shadowDepth: 'soft',
      sectionTitleTreatment: 'underlined',
      cardImageShape: 'rounded',
      heroHeight: 260,
      titleSize: 36,
    },
  },
  {
    id: 'night-market',
    name: 'Night Market',
    description: 'Dark storefront for late-night bukas — high contrast and compact grid.',
    tags: ['Dark', 'Bold'],
    preview: { page: '#0b1220', accent: '#ffbd59', panel: '#0f172a' },
    config: {
      menuTemplate: 'night-market',
      brandColor: '#ffbd59',
      priceTextColor: '#ffcd1c',
      backgroundTone: 'dark',
      heroOverlay: 'dim',
      fontFamily: 'sans',
      layout: 'grid',
      gridStyle: 'two_col',
      cardLayout: 'stacked',
      showPhotos: true,
      showDescriptions: true,
      cardRadius: 14,
      cardGap: 10,
      shadowDepth: 'deep',
      sectionTitleTreatment: 'uppercase',
      categoryStripBorder: true,
      heroHeight: 200,
    },
  },
  {
    id: 'express',
    name: 'Express List',
    description: 'Fast-scan rows with thumbnail left — ideal on slow connections.',
    tags: ['List', 'Compact'],
    preview: { page: '#ffffff', accent: '#f97316', panel: '#fafafa' },
    config: {
      menuTemplate: 'express',
      brandColor: '#f97316',
      priceTextColor: '#f97316',
      backgroundTone: 'light',
      heroOverlay: 'solid',
      fontFamily: 'sans',
      layout: 'list',
      gridStyle: 'row_list',
      cardLayout: 'horizontal',
      showPhotos: true,
      showDescriptions: false,
      cardRadius: 12,
      cardGap: 8,
      shadowDepth: 'flat',
      sectionTitleTreatment: 'chip',
      cardImageShape: 'rounded',
      heroHeight: 180,
      menuItemFontScale: 0.95,
    },
  },
  {
    id: 'premium-dark',
    name: 'Premium Dark',
    description: 'Editorial dark menu with deep cards and dramatic hero.',
    tags: ['Dark', 'Premium'],
    preview: { page: '#09090b', accent: '#d4a574', panel: '#18181b' },
    config: {
      menuTemplate: 'premium-dark',
      brandColor: '#d4a574',
      priceTextColor: '#d4a574',
      backgroundTone: 'dark',
      heroOverlay: 'split',
      fontFamily: 'serif',
      layout: 'cards',
      gridStyle: 'wide_cards',
      cardLayout: 'stacked',
      showPhotos: true,
      showDescriptions: true,
      cardRadius: 18,
      cardGap: 16,
      shadowDepth: 'deep',
      sectionTitleTreatment: 'uppercase',
      heroHeight: 280,
      titleSize: 40,
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Text-first menu without photos — loads fastest on poor networks.',
    tags: ['Lite', 'No photos'],
    preview: { page: '#f8fafc', accent: '#171717', panel: '#ffffff' },
    config: {
      menuTemplate: 'minimal',
      brandColor: '#171717',
      priceTextColor: '#171717',
      backgroundTone: 'light',
      heroOverlay: 'solid',
      fontFamily: 'sans',
      layout: 'list',
      gridStyle: 'row_list',
      cardLayout: 'stacked',
      showPhotos: false,
      showDescriptions: true,
      cardRadius: 8,
      cardGap: 6,
      shadowDepth: 'flat',
      sectionTitleTreatment: 'underlined',
      dividerStyle: 'soft',
      heroHeight: 160,
    },
  },
  {
    id: 'editorial',
    name: 'Editorial',
    description: 'Serif headlines and horizontal rows — restaurant magazine feel.',
    tags: ['Serif', 'Rows'],
    preview: { page: '#fefbf5', accent: '#ffbd59', panel: '#ffffff' },
    config: {
      menuTemplate: 'editorial',
      brandColor: '#ffbd59',
      priceTextColor: '#b45309',
      backgroundTone: 'warm',
      heroOverlay: 'gradient',
      fontFamily: 'serif',
      layout: 'list',
      gridStyle: 'row_list',
      cardLayout: 'horizontal',
      showPhotos: true,
      showDescriptions: true,
      cardRadius: 14,
      cardGap: 12,
      shadowDepth: 'flat',
      sectionTitleTreatment: 'underlined',
      cardImageShape: 'square',
      heroHeight: 240,
    },
  },
]

const TEMPLATE_BY_ID = Object.fromEntries(
  STOREFRONT_MENU_TEMPLATES.map((t) => [t.id, t]),
) as Record<StorefrontMenuTemplateId, StorefrontMenuTemplate>

export function getStorefrontMenuTemplate(id: StorefrontMenuTemplateId): StorefrontMenuTemplate {
  return TEMPLATE_BY_ID[id] ?? TEMPLATE_BY_ID.classic
}

/** Apply a preset; keeps AI guest settings and hero banner unless the template replaces them. */
export function applyStorefrontMenuTemplate(
  current: StorefrontConfig,
  templateId: StorefrontMenuTemplateId,
  opts?: { keepBrandColor?: boolean; keepHeroBanner?: boolean },
): StorefrontConfig {
  const template = getStorefrontMenuTemplate(templateId)
  const keepBrand = opts?.keepBrandColor ?? false
  const keepBanner = opts?.keepHeroBanner ?? true
  const { aiGuest } = current
  const heroBannerUrl = keepBanner ? current.heroBannerUrl : template.config.heroBannerUrl
  const brandColor = keepBrand ? current.brandColor : (template.config.brandColor ?? current.brandColor)
  const priceTextColor = keepBrand ? current.priceTextColor : (template.config.priceTextColor ?? brandColor)

  return mergeStorefrontConfig({
    ...current,
    ...template.config,
    menuTemplate: templateId,
    brandColor,
    priceTextColor,
    aiGuest,
    ...(keepBanner && heroBannerUrl !== undefined ? { heroBannerUrl } : {}),
  })
}

export function resolveActiveMenuTemplateId(config: StorefrontConfig): StorefrontMenuTemplateId | 'custom' {
  if (config.menuTemplate && config.menuTemplate in TEMPLATE_BY_ID) {
    return config.menuTemplate
  }
  for (const t of STOREFRONT_MENU_TEMPLATES) {
    if (t.id === 'classic') continue
    const probe = applyStorefrontMenuTemplate(DEFAULT_STOREFRONT_CONFIG, t.id)
    if (templateConfigMatches(probe, config)) return t.id
  }
  return 'custom'
}

function templateConfigMatches(a: StorefrontConfig, b: StorefrontConfig): boolean {
  const keys: (keyof StorefrontConfig)[] = [
    'backgroundTone',
    'gridStyle',
    'cardLayout',
    'fontFamily',
    'sectionTitleTreatment',
    'shadowDepth',
    'showPhotos',
    'showDescriptions',
    'heroOverlay',
  ]
  return keys.every((k) => a[k] === b[k])
}
