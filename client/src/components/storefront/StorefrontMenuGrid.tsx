import { useState, useMemo, type KeyboardEvent, type MouseEvent } from 'react'
import type { GuestMenuLang, StorefrontConfig, StorefrontDetails } from '../../types'
import { getStorefrontTheme, cardShadowClass } from '../../lib/storefrontTheme'
import { ticketPreviewQrImageUrl, ticketPreviewQrPayload } from '../../lib/ticketPreviewQr'
import { CrossVenuePill, ForYouPill, PairsWellPill, ReorderPill, RnrTastePill, TrendingPill } from '../landing/GlassAiPill'
import type { GuestItemSignal } from '../../types/guestPersonalization'

export type StorefrontMenuGridItem = {
  id: string
  name: string
  description?: string
  price: number
  estimatedPrepTime?: number
  imageUrl?: string
  available: boolean
  maxPerUser?: number | null
  groupSize?: number | null
  minPerOrder?: number | null
}

export type StorefrontMenuGridCategory = {
  id: string
  name: string
  items: StorefrontMenuGridItem[]
}

export type GuestDietaryPrefs = {
  vegetarian?: boolean
  meatLover?: boolean
  noDairy?: boolean
}

type Props = {
  config: StorefrontConfig
  categories: StorefrontMenuGridCategory[]
  onItemClick: (item: StorefrontMenuGridItem) => void
  emptyMessage?: string
  variant?: 'menu' | 'ticketing'
  businessId?: string
  showQuickPicks?: boolean
  trendingItemIds?: string[]
  upsellSeedIds?: string[]
  forYouItemIds?: string[]
  reorderItemIds?: string[]
  itemSignals?: Record<string, GuestItemSignal>
  personalisationActive?: boolean
  activeMenuLang?: GuestMenuLang
  menuTranslations?: StorefrontDetails['menuTranslations']
  guestDietaryPrefs?: GuestDietaryPrefs
  /** Scale-tier: image-overlay pills (For you / Reorder / Trending) */
  scaleGuestMenuTags?: boolean
  /** Item ids the guest has ordered or added before (session), for Reorder pill */
  reorderHintItemIds?: string[]
}

function textBlob(item: StorefrontMenuGridItem): string {
  return `${(item.name || '').toLowerCase()} ${(item.description || '').toLowerCase()}`
}

function tasteScore(item: StorefrontMenuGridItem, prefs: GuestDietaryPrefs | undefined): number {
  if (!prefs) return 0
  const t = textBlob(item)
  let s = 0
  if (prefs.vegetarian) {
    if (/\b(veg|vegetable|salad|vegan|beans|greens|grain|rice)\b/i.test(t)) s += 3
    if (/\b(beef|goat|lamb|fish|chicken|pork|meat|steak|burger)\b/i.test(t)) s -= 2
  }
  if (prefs.meatLover) {
    if (/\b(beef|goat|lamb|fish|chicken|pork|meat|steak|grill|burger)\b/i.test(t)) s += 3
  }
  if (prefs.noDairy) {
    if (/\b(cheese|cream|milk|dairy|yoghurt|yogurt|butter)\b/i.test(t)) s -= 4
  }
  return s
}

function sortByTasteAndTrending(
  items: StorefrontMenuGridItem[],
  prefs: GuestDietaryPrefs | undefined,
  trendingIds: string[],
  enabled: boolean
): StorefrontMenuGridItem[] {
  if (!enabled) return items
  const trendIdx = (id: string): number => {
    const i = trendingIds.indexOf(id)
    return i === -1 ? 999 : i
  }
  return [...items].sort((a, b) => {
    const td = trendIdx(a.id) - trendIdx(b.id)
    if (td !== 0) return td
    return tasteScore(b, prefs) - tasteScore(a, prefs)
  })
}

function resolveItemName(item: StorefrontMenuGridItem): string {
  return item.name
}

function findItemById(categories: StorefrontMenuGridCategory[], id: string): StorefrontMenuGridItem | null {
  for (const c of categories) {
    const it = c.items.find((i) => i.id === id)
    if (it) return it
  }
  return null
}

function CategoryHeading({
  name,
  config,
  theme
}: {
  name: string
  config: StorefrontConfig
  theme: ReturnType<typeof getStorefrontTheme>
}): JSX.Element {
  if (config.sectionTitleTreatment === 'uppercase') {
    return (
      <h2 className="text-xs tracking-[0.22em] font-bold uppercase mb-4" style={{ color: theme.sub }}>
        {name}
      </h2>
    )
  }
  if (config.sectionTitleTreatment === 'chip') {
    return (
      <h2 className="mb-4">
        <span
          className="inline-block px-3 py-1 rounded-full text-sm font-semibold"
          style={{ background: `${config.brandColor}20`, color: config.brandColor }}
        >
          {name}
        </span>
      </h2>
    )
  }
  return (
    <h2 className="text-lg font-bold mb-4 pb-2 border-b-2" style={{ color: theme.text, borderColor: config.brandColor }}>
      {name}
    </h2>
  )
}

function gridClass(config: StorefrontConfig): string {
  if (config.menuTemplate === 'shop-window') {
    return 'grid w-full grid-cols-2 sm:grid-cols-3'
  }
  if (config.gridStyle === 'row_list') return 'grid grid-cols-1 w-full'
  if (config.gridStyle === 'wide_cards') return 'grid grid-cols-1 md:grid-cols-2 w-full'
  /** Explicit `grid-cols-1` below `sm` — without it, mobile layout is undefined and columns look broken */
  return 'grid w-full grid-cols-1 sm:grid-cols-2'
}

function imageRadius(config: StorefrontConfig): number | string {
  const base = Math.max(6, config.cardRadius - 4)
  if (config.cardImageShape === 'square') return 4
  if (config.cardImageShape === 'circle') return 9999
  return base
}

function GuestMenuImagePills({
  showTrend,
  showForYou,
  showReorder,
  showCrossVenue,
  showRnr,
  crossVenueLabel,
  rnrTitle,
  layout = 'overlay'
}: {
  showTrend: boolean
  showForYou: boolean
  showReorder: boolean
  showCrossVenue?: boolean
  showRnr?: boolean
  crossVenueLabel?: string
  rnrTitle?: string
  layout?: 'overlay' | 'inline'
}): JSX.Element | null {
  if (!showTrend && !showForYou && !showReorder && !showCrossVenue && !showRnr) return null
  const onPhoto = layout === 'overlay'

  if (onPhoto) {
    return (
      <div
        className="absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end pointer-events-none rounded-b-[inherit] overflow-hidden"
        aria-hidden
      >
        <div className="bg-gradient-to-t from-black/70 via-black/35 to-transparent pt-10 pb-2.5 px-2.5">
          <div className="flex flex-col-reverse gap-1.5 items-start max-w-full">
            {showReorder ? <ReorderPill onPhoto /> : null}
            {showCrossVenue ? <CrossVenuePill onPhoto label={crossVenueLabel} /> : null}
            {showRnr ? <RnrTastePill onPhoto title={rnrTitle} /> : null}
            {showForYou ? <ForYouPill onPhoto /> : null}
            {showTrend ? <TrendingPill onPhoto /> : null}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {showReorder ? <ReorderPill /> : null}
      {showCrossVenue ? <CrossVenuePill label={crossVenueLabel} /> : null}
      {showRnr ? <RnrTastePill title={rnrTitle} /> : null}
      {showForYou ? <ForYouPill /> : null}
      {showTrend ? <TrendingPill /> : null}
    </div>
  )
}

export function StorefrontMenuGrid({
  config,
  categories,
  onItemClick,
  emptyMessage,
  variant = 'menu',
  businessId = '',
  showQuickPicks = false,
  trendingItemIds = [],
  upsellSeedIds = [],
  forYouItemIds = [],
  reorderItemIds = [],
  itemSignals = {},
  personalisationActive = false,
  activeMenuLang = 'en',
  menuTranslations,
  guestDietaryPrefs,
  scaleGuestMenuTags = false,
  reorderHintItemIds = []
}: Props): JSX.Element {
  const theme = getStorefrontTheme(config)
  const shadow = cardShadowClass(config.shadowDepth)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const isTicketing = variant === 'ticketing'
  const resolvedEmpty = emptyMessage ?? (isTicketing ? 'No ticket types available yet.' : 'No menu items available.')
  const ag = config.aiGuest ?? {}

  const sortedCategories = useMemo(() => {
    const enabled = ag.tasteSortEnabled === true && !isTicketing
    const trend = trendingItemIds || []
    return categories.map((cat) => ({
      ...cat,
      items: sortByTasteAndTrending(cat.items, guestDietaryPrefs, trend, enabled)
    }))
  }, [categories, ag.tasteSortEnabled, guestDietaryPrefs, trendingItemIds, isTicketing])

  const quickPickItems = useMemo(() => {
    if (!showQuickPicks || isTicketing || categories.length === 0) return []

    const trend = trendingItemIds || []
    const trendingOn = ag.trendingOnMenu !== false
    const personalOn = ag.personalisedRecs !== false
    const showQuickPickSection =
      personalOn || (trendingOn && trend.length > 0)
    if (!showQuickPickSection) return []

    const out: StorefrontMenuGridItem[] = []
    const seen = new Set<string>()
    const addById = (id: string): boolean => {
      const it = findItemById(categories, id)
      if (!it || !it.available || seen.has(it.id)) return false
      seen.add(it.id)
      out.push(it)
      return out.length >= 3
    }

    if (personalOn) {
      for (const id of reorderItemIds || []) {
        if (addById(id)) return out
      }
      for (const id of forYouItemIds || []) {
        if (addById(id)) return out
      }
    }

    if (trendingOn && trend.length > 0) {
      for (const id of trend) {
        if (addById(id)) return out
      }
    }

    if (!personalOn) return out

    for (const c of categories) {
      for (const it of c.items) {
        if (!it.available || seen.has(it.id)) continue
        seen.add(it.id)
        out.push(it)
        if (out.length >= 3) return out
      }
    }
    return out
  }, [
    showQuickPicks,
    isTicketing,
    categories,
    trendingItemIds,
    forYouItemIds,
    reorderItemIds,
    ag.personalisedRecs,
    ag.trendingOnMenu
  ])

  const forYouItemIdSet = useMemo(() => {
    if (!scaleGuestMenuTags || isTicketing || ag.personalisedRecs === false) return new Set<string>()
    if (personalisationActive && forYouItemIds.length > 0) return new Set(forYouItemIds)
    return new Set(quickPickItems.map((i) => i.id))
  }, [scaleGuestMenuTags, isTicketing, ag.personalisedRecs, personalisationActive, forYouItemIds, quickPickItems])

  const reorderIdSet = useMemo(() => {
    const ids = new Set(reorderHintItemIds || [])
    for (const id of reorderItemIds || []) ids.add(id)
    return ids
  }, [reorderHintItemIds, reorderItemIds])

  if (categories.length === 0) {
    return (
      <div className="rounded-2xl border p-8 text-center" style={{ background: theme.panel, borderColor: theme.border }}>
        <p className="text-sm" style={{ color: theme.sub }}>
          {resolvedEmpty}
        </p>
      </div>
    )
  }

  const trendSet = new Set(trendingItemIds || [])
  const upsellSet = new Set(upsellSeedIds || [])

  return (
    <div className="w-full min-w-0 max-w-full overflow-x-hidden">
      {quickPickItems.length > 0 ? (
        <div
          className="mb-8 w-full min-w-0 rounded-2xl border border-white/40 px-4 py-4 sm:px-5 sm:py-5 backdrop-blur-lg bg-white/55"
          style={{
            background: `linear-gradient(135deg, ${config.brandColor}14, rgba(255,255,255,0.72))`,
            borderColor: `${config.brandColor}33`
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: config.brandColor }}>
                Zuri picks
              </p>
              <p className="text-sm font-semibold" style={{ color: theme.text }}>
                {ag.personalisedRecs === false ? 'Quick picks for your table' : 'Personalised for your table'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {scaleGuestMenuTags && ag.personalisedRecs !== false ? (
                <ForYouPill className="uppercase tracking-wide" />
              ) : null}
              <span
                className="text-[10px] font-medium px-2 py-1 rounded-full"
                style={{ background: `${config.brandColor}18`, color: theme.sub }}
              >
                Tap to add
              </span>
            </div>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 scroll-smooth snap-x snap-mandatory">
            {quickPickItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onItemClick(item)}
                className="shrink-0 snap-start rounded-xl border px-3 py-2 text-left min-w-[7.5rem] max-w-[11rem] transition hover:brightness-[1.02]"
                style={{ background: theme.panel, borderColor: theme.border }}
              >
                <p className="text-xs font-bold truncate" style={{ color: theme.text }}>
                  {resolveItemName(item)}
                </p>
                <p className="text-[11px] tabular-nums font-semibold mt-0.5" style={{ color: config.brandColor }}>
                  ₦{Number(item.price).toFixed(2)}
                </p>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {sortedCategories.map((category, catIdx) => {
        const showBottomDivider = catIdx < sortedCategories.length - 1 && config.dividerStyle !== 'none'
        return (
          <section
            key={category.id}
            className={`w-full min-w-0 max-w-full ${showBottomDivider ? 'pb-8 mb-2' : 'mb-10 last:mb-0'}`}
            style={
              showBottomDivider
                ? {
                    borderBottomWidth: config.dividerStyle === 'bold' ? 2 : 1,
                    borderBottomStyle: config.dividerStyle === 'dotted' ? 'dotted' : 'solid',
                    borderBottomColor: theme.border
                  }
                : undefined
            }
          >
            <div
              className={config.categoryStripBorder ? 'border-b mb-4' : 'mb-4'}
              style={config.categoryStripBorder ? { borderColor: theme.border, paddingBottom: '0.65rem' } : undefined}
            >
              <CategoryHeading name={category.name} config={config} theme={theme} />
            </div>
            <div className={gridClass(config)} style={{ gap: config.cardGap }}>
              {category.items.map((item) => {
                const imgR = imageRadius(config)
                const isCircle = config.cardImageShape === 'circle'
                const expanded = expandedId === item.id
                const qrSrc = ticketPreviewQrImageUrl(ticketPreviewQrPayload(businessId || 'preview', item.id), 112)
                const displayName = resolveItemName(item)
                const showTrend = !isTicketing && ag.trendingOnMenu !== false && trendSet.has(item.id)
                const showUpsell = !isTicketing && ag.intelligentUpsell !== false && upsellSet.has(item.id)
                const signal = personalisationActive ? itemSignals[item.id] : undefined
                const showTrendOverlay =
                  scaleGuestMenuTags &&
                  !isTicketing &&
                  (signal?.kind === 'trending' ||
                    (!signal && ag.trendingOnMenu !== false && trendSet.has(item.id)))
                const showRnrOverlay =
                  scaleGuestMenuTags && !isTicketing && signal?.kind === 'rnr'
                const rnrTitle = signal?.kind === 'rnr' ? signal.label : undefined
                const showForYouOverlay =
                  scaleGuestMenuTags &&
                  !isTicketing &&
                  !showRnrOverlay &&
                  (signal?.kind === 'for_you' || (!signal && forYouItemIdSet.has(item.id)))
                const showReorderOverlay =
                  scaleGuestMenuTags &&
                  !isTicketing &&
                  (signal?.kind === 'reorder' || (!signal && reorderIdSet.has(item.id)))
                const showCrossVenueOverlay =
                  scaleGuestMenuTags && !isTicketing && signal?.kind === 'cross_venue'
                const crossVenueLabel = signal?.kind === 'cross_venue' ? signal.label : undefined
                const hasScaleOverlay =
                  showTrendOverlay || showForYouOverlay || showReorderOverlay || showCrossVenueOverlay || showRnrOverlay
                const isHorizontal = config.cardLayout === 'horizontal' && !isTicketing

                const handleCardClick = (e: MouseEvent): void => {
                  if (!item.available) return
                  if ((e.target as HTMLElement).closest('select,button,a,input,textarea,label')) return
                  if (isTicketing) {
                    setExpandedId((id) => (id === item.id ? null : item.id))
                    return
                  }
                  onItemClick(item)
                }

                const handleCardKeyDown = (ev: KeyboardEvent): void => {
                  if (ev.key !== 'Enter' && ev.key !== ' ') return
                  if (!item.available) return
                  ev.preventDefault()
                  if (isTicketing) {
                    setExpandedId((id) => (id === item.id ? null : item.id))
                    return
                  }
                  onItemClick(item)
                }

                return (
                  <div
                    key={item.id}
                    role={isTicketing ? undefined : 'button'}
                    tabIndex={isTicketing ? undefined : 0}
                    onClick={handleCardClick}
                    onKeyDown={isTicketing ? undefined : handleCardKeyDown}
                    className={`border w-full max-w-full min-w-0 box-border transition ${shadow} ${
                      isHorizontal ? 'p-3 flex gap-3 items-stretch' : 'p-4 sm:p-5'
                    } ${
                      !item.available ? 'opacity-50 cursor-not-allowed' : isTicketing ? 'cursor-default' : 'cursor-pointer'
                    }`}
                    style={{
                      background: theme.panel,
                      borderColor: theme.border,
                      borderRadius: config.cardRadius,
                      fontSize: `${Math.round(14 * config.menuItemFontScale)}px`,
                      outline: 'none'
                    }}
                  >
                    {config.showPhotos && item.imageUrl ? (
                      <div
                        className={`relative overflow-hidden shrink-0 ${
                          isHorizontal
                            ? 'w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20'
                            : isCircle
                              ? 'w-28 h-28 mx-auto rounded-full mb-3'
                              : 'w-full mb-3'
                        }`}
                      >
                        <img
                          src={item.imageUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          className={
                            isHorizontal
                              ? 'w-full h-full object-cover'
                              : isCircle
                                ? 'w-full h-full max-w-full object-cover'
                                : 'w-full max-w-full h-36 sm:h-40 object-cover'
                          }
                          style={isCircle && !isHorizontal ? undefined : { borderRadius: imgR as number }}
                        />
                        <GuestMenuImagePills
                          showTrend={showTrendOverlay}
                          showForYou={showForYouOverlay}
                          showReorder={showReorderOverlay}
                          showCrossVenue={showCrossVenueOverlay}
                          showRnr={showRnrOverlay}
                          crossVenueLabel={crossVenueLabel}
                          rnrTitle={rnrTitle}
                        />
                      </div>
                    ) : null}
                    {config.showPhotos && !item.imageUrl ? (
                      <div
                        className={`relative overflow-hidden shrink-0 ${
                          isHorizontal
                            ? 'w-[4.5rem] h-[4.5rem] sm:w-20 sm:h-20'
                            : isCircle
                              ? 'w-28 h-28 mx-auto rounded-full mb-3'
                              : 'w-full h-24 mb-3'
                        }`}
                        style={{ borderRadius: isCircle && !isHorizontal ? 9999 : (imgR as number), background: `${config.brandColor}22` }}
                      >
                        <GuestMenuImagePills
                          showTrend={showTrendOverlay}
                          showForYou={showForYouOverlay}
                          showReorder={showReorderOverlay}
                          showCrossVenue={showCrossVenueOverlay}
                          showRnr={showRnrOverlay}
                          crossVenueLabel={crossVenueLabel}
                          rnrTitle={rnrTitle}
                        />
                      </div>
                    ) : null}
                    {!config.showPhotos && hasScaleOverlay && !isTicketing ? (
                      <GuestMenuImagePills
                        layout="inline"
                        showTrend={showTrendOverlay}
                        showForYou={showForYouOverlay}
                        showReorder={showReorderOverlay}
                        showCrossVenue={showCrossVenueOverlay}
                        showRnr={showRnrOverlay}
                        crossVenueLabel={crossVenueLabel}
                        rnrTitle={rnrTitle}
                      />
                    ) : null}
                    <div className={`min-w-0 flex-1 ${isHorizontal ? 'flex flex-col justify-center' : ''}`}>
                    <div className={`flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start mb-1 min-w-0 ${isHorizontal ? '!flex-row !items-center !justify-between' : ''}`}>
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold break-words hyphens-auto" style={{ color: theme.text }}>
                          {displayName}
                        </h3>
                      </div>
                      <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 shrink-0 sm:pl-2">
                        <span className="font-bold text-sm tabular-nums whitespace-nowrap" style={{ color: config.priceTextColor || config.brandColor }}>
                          ₦{Number(item.price).toFixed(2)}
                        </span>
                        {isTicketing && item.available ? (
                          <button
                            type="button"
                            className="text-[10px] font-semibold uppercase tracking-wide hover:opacity-80"
                            style={{ color: config.brandColor }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedId((id) => (id === item.id ? null : item.id))
                            }}
                          >
                            {expanded ? 'Hide' : 'Receipt & QR'}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {!isTicketing && !scaleGuestMenuTags && (showTrend || showUpsell) ? (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {showTrend ? <TrendingPill className="text-[9px]" /> : null}
                        {showUpsell ? <PairsWellPill className="text-[9px]" /> : null}
                      </div>
                    ) : null}
                    {!isTicketing && scaleGuestMenuTags && showUpsell && !hasScaleOverlay ? (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        <PairsWellPill className="text-[9px]" />
                      </div>
                    ) : null}
                    {config.showDescriptions && item.description ? (
                      <p className="text-xs mb-2 line-clamp-2" style={{ color: theme.sub }}>
                        {item.description}
                      </p>
                    ) : null}
                    {isTicketing &&
                    (item.maxPerUser || (item.groupSize && item.groupSize > 1) || (item.minPerOrder && item.minPerOrder > 1)) ? (
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {item.maxPerUser ? (
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{ background: `${config.brandColor}15`, color: config.brandColor }}
                          >
                            Max {item.maxPerUser} per buyer
                          </span>
                        ) : null}
                        {item.groupSize && item.groupSize > 1 ? (
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{ background: `${config.brandColor}15`, color: config.brandColor }}
                          >
                            Sold in groups of {item.groupSize}
                          </span>
                        ) : null}
                        {item.minPerOrder && item.minPerOrder > 1 ? (
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                            style={{ background: `${config.brandColor}15`, color: config.brandColor }}
                          >
                            Min {item.minPerOrder} per order
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {!isTicketing ? (
                      <p className="text-xs mb-2" style={{ color: theme.sub }}>
                        Avg time: {item.estimatedPrepTime ?? 15} min
                      </p>
                    ) : null}
                    {isTicketing && expanded ? (
                      <div className="mt-3 pt-3 border-t flex flex-col sm:flex-row gap-4" style={{ borderColor: theme.border }}>
                        <div
                          className="flex-1 min-w-0 rounded-xl border px-3 py-2.5 text-left"
                          style={{ borderColor: theme.border, background: theme.page }}
                        >
                          <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: theme.sub }}>
                            Ticket receipt (preview)
                          </p>
                          <p className="text-xs font-semibold mb-0.5" style={{ color: theme.text }}>
                            {item.name}
                          </p>
                          <p className="text-[11px] tabular-nums" style={{ color: theme.sub }}>
                            Unit price ₦{Number(item.price).toFixed(2)}
                          </p>
                          <p className="text-[10px] mt-2 leading-snug" style={{ color: theme.sub }}>
                            After payment, the receipt email includes a unique QR your team can scan once to validate entry.
                          </p>
                        </div>
                        <div className="shrink-0 flex flex-col items-center gap-1.5">
                          <img src={qrSrc} alt="" className="w-28 h-28 rounded-lg border bg-white p-1" style={{ borderColor: theme.border }} />
                          <span className="text-[10px] text-center max-w-[7.5rem]" style={{ color: theme.sub }}>
                            Scan to confirm this ticket type (preview)
                          </span>
                        </div>
                      </div>
                    ) : null}
                    {!item.available ? (
                      <span className="text-red-500 text-xs font-semibold">{isTicketing ? 'Unavailable' : 'Out of stock'}</span>
                    ) : null}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

