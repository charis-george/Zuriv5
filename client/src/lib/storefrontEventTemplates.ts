import type { StorefrontEventPage, StorefrontEventTemplateId } from '../types'

export type EventLandingLayout = {
  heroStyle: 'cinematic' | 'compact' | 'centered' | 'split'
  ticketLayout: 'stacked' | 'grid' | 'rows'
  countdownStyle: 'blocks' | 'inline' | 'banner'
  lineupStyle: 'list' | 'grid' | 'chips'
  heroTextAlign: 'left' | 'center'
  /** When true, tickets appear before lineup and refund policy */
  ticketsFirst: boolean
  heroMinHeight: string
}

export type StorefrontEventTemplate = {
  id: StorefrontEventTemplateId
  name: string
  description: string
  tags: string[]
  preview: { hero: string; accent: string; panel: string }
  layout: EventLandingLayout
}

const DEFAULT_LAYOUT: EventLandingLayout = {
  heroStyle: 'cinematic',
  ticketLayout: 'stacked',
  countdownStyle: 'blocks',
  lineupStyle: 'list',
  heroTextAlign: 'left',
  ticketsFirst: false,
  heroMinHeight: 'min(72vh, 520px)',
}

export const STOREFRONT_EVENT_TEMPLATES: StorefrontEventTemplate[] = [
  {
    id: 'classic',
    name: 'Classic',
    description: 'Full cinematic hero, countdown blocks, and stacked ticket cards.',
    tags: ['Hero', 'Countdown'],
    preview: { hero: '#1e293b', accent: '#a855f7', panel: '#ffffff' },
    layout: { ...DEFAULT_LAYOUT },
  },
  {
    id: 'spotlight',
    name: 'Spotlight',
    description: 'Centered hero with inline countdown and a two-column ticket grid.',
    tags: ['Centered', 'Grid'],
    preview: { hero: '#312e81', accent: '#818cf8', panel: '#f8fafc' },
    layout: {
      heroStyle: 'centered',
      ticketLayout: 'grid',
      countdownStyle: 'inline',
      lineupStyle: 'grid',
      heroTextAlign: 'center',
      ticketsFirst: false,
      heroMinHeight: 'min(58vh, 440px)',
    },
  },
  {
    id: 'festival',
    name: 'Festival',
    description: 'Bold full-bleed hero, chip-style lineup, and ticket grid.',
    tags: ['Bold', 'Chips'],
    preview: { hero: '#0f172a', accent: '#f97316', panel: '#fff7ed' },
    layout: {
      heroStyle: 'cinematic',
      ticketLayout: 'grid',
      countdownStyle: 'banner',
      lineupStyle: 'chips',
      heroTextAlign: 'left',
      ticketsFirst: false,
      heroMinHeight: 'min(68vh, 480px)',
    },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    description: 'Compact hero with tickets up front and clean row-style tiers.',
    tags: ['Compact', 'Tickets first'],
    preview: { hero: '#f1f5f9', accent: '#0f766e', panel: '#ffffff' },
    layout: {
      heroStyle: 'compact',
      ticketLayout: 'rows',
      countdownStyle: 'inline',
      lineupStyle: 'list',
      heroTextAlign: 'left',
      ticketsFirst: true,
      heroMinHeight: 'min(42vh, 320px)',
    },
  },
  {
    id: 'split-stage',
    name: 'Split Stage',
    description: 'Side-by-side hero on desktop with banner countdown.',
    tags: ['Split', 'Desktop'],
    preview: { hero: '#1c1917', accent: '#eab308', panel: '#fafaf9' },
    layout: {
      heroStyle: 'split',
      ticketLayout: 'stacked',
      countdownStyle: 'banner',
      lineupStyle: 'grid',
      heroTextAlign: 'left',
      ticketsFirst: false,
      heroMinHeight: 'min(64vh, 460px)',
    },
  },
  {
    id: 'nightclub',
    name: 'Nightclub',
    description: 'Dark centered vibe with dramatic countdown and stacked tiers.',
    tags: ['Dark', 'Centered'],
    preview: { hero: '#020617', accent: '#e11d48', panel: '#0f172a' },
    layout: {
      heroStyle: 'centered',
      ticketLayout: 'stacked',
      countdownStyle: 'blocks',
      lineupStyle: 'chips',
      heroTextAlign: 'center',
      ticketsFirst: false,
      heroMinHeight: 'min(70vh, 500px)',
    },
  },
]

const TEMPLATE_BY_ID = Object.fromEntries(
  STOREFRONT_EVENT_TEMPLATES.map((t) => [t.id, t]),
) as Record<StorefrontEventTemplateId, StorefrontEventTemplate>

export function getEventTemplate(id: StorefrontEventTemplateId): StorefrontEventTemplate {
  return TEMPLATE_BY_ID[id] ?? TEMPLATE_BY_ID.classic
}

export function getEventLandingLayout(event: StorefrontEventPage): EventLandingLayout {
  const templateId = event.eventTemplate
  if (templateId && templateId !== 'custom' && templateId in TEMPLATE_BY_ID) {
    const base = getEventTemplate(templateId).layout
    return { ...base, ...event.eventLayout }
  }
  return { ...DEFAULT_LAYOUT, ...event.eventLayout }
}

export function applyEventTemplate(
  event: StorefrontEventPage,
  templateId: StorefrontEventTemplateId,
): StorefrontEventPage {
  const template = getEventTemplate(templateId)
  return {
    ...event,
    eventTemplate: templateId,
    eventLayout: { ...template.layout },
  }
}

export function resolveActiveEventTemplateId(event: StorefrontEventPage): StorefrontEventTemplateId | 'custom' {
  if (event.eventTemplate && event.eventTemplate in TEMPLATE_BY_ID) {
    return event.eventTemplate
  }
  for (const t of STOREFRONT_EVENT_TEMPLATES) {
    if (t.id === 'classic') continue
    const probe = applyEventTemplate({ ...event, eventTemplate: undefined, eventLayout: undefined }, t.id)
    if (eventLayoutMatches(probe.eventLayout ?? t.layout, event.eventLayout ?? DEFAULT_LAYOUT)) {
      return t.id
    }
  }
  if (!event.eventLayout || Object.keys(event.eventLayout).length === 0) return 'classic'
  return 'custom'
}

function eventLayoutMatches(a: Partial<EventLandingLayout>, b: Partial<EventLandingLayout>): boolean {
  const keys: (keyof EventLandingLayout)[] = [
    'heroStyle',
    'ticketLayout',
    'countdownStyle',
    'lineupStyle',
    'heroTextAlign',
    'ticketsFirst',
  ]
  return keys.every((k) => (a[k] ?? DEFAULT_LAYOUT[k]) === (b[k] ?? DEFAULT_LAYOUT[k]))
}
