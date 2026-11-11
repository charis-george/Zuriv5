import { useEffect, useState, type ReactNode } from 'react'
import type { Business, MenuItem, StorefrontConfig, StorefrontDetails, StorefrontEventPage } from '../../types'
import { getStorefrontTheme, storefrontFontStyles } from '../../lib/storefrontTheme'
import { getEventLandingLayout, type EventLandingLayout } from '../../lib/storefrontEventTemplates'
import { eventShareUrl, formatEventCountdown, formatRefundPolicyLabel, whatsappShareHref } from '../../lib/storefrontEventPages'
import { formatZuriEventTitle } from '../../lib/storefrontSeoTitles'
import {
  getMinTicketQty,
  getMaxTicketQty,
  getTicketStep,
  nextTicketQty,
  isTicketSoldOut,
  getTicketsRemaining
} from '../../lib/ticketQuantityRules'

type TicketLine = MenuItem & { categoryName?: string }

type Props = {
  event: StorefrontEventPage
  config: StorefrontConfig
  details: StorefrontDetails
  business: Pick<Business, 'id' | 'name' | 'logoUrl' | 'phone'>
  ticketItems: TicketLine[]
  cartQtyById: Record<string, number>
  onQtyChange: (item: TicketLine, qty: number) => void
  brandColor: string
  children?: ReactNode
  showShare?: boolean
  previewMode?: boolean
  onGetTickets?: () => void
}

function CountdownBlocks({ iso, brand, style }: { iso: string; brand: string; style: EventLandingLayout['countdownStyle'] }): JSX.Element {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 1000)
    return () => window.clearInterval(id)
  }, [])
  const parts = formatEventCountdown(iso)
  void tick

  if (parts.past) {
    return (
      <p className="text-sm font-semibold text-white/90">Event is live — grab your tickets below</p>
    )
  }

  const cells = [
    { label: 'Days', value: parts.days },
    { label: 'Hrs', value: parts.hours },
    { label: 'Min', value: parts.mins },
    { label: 'Sec', value: parts.secs }
  ]

  if (style === 'inline') {
    return (
      <p className="text-sm sm:text-base font-semibold text-white/90 tabular-nums">
        {cells.map((c, i) => (
          <span key={c.label}>
            {i > 0 ? <span className="text-white/50 mx-1">·</span> : null}
            <span style={{ color: brand }}>{String(c.value).padStart(2, '0')}</span>
            <span className="text-white/60 text-xs ml-0.5">{c.label}</span>
          </span>
        ))}
      </p>
    )
  }

  if (style === 'banner') {
    return (
      <div
        className="inline-flex flex-wrap items-center gap-3 rounded-2xl border border-white/20 px-4 py-2.5 backdrop-blur-sm"
        style={{ background: `${brand}22` }}
      >
        {cells.map((c) => (
          <span key={c.label} className="text-sm font-bold tabular-nums text-white">
            <span style={{ color: brand }}>{String(c.value).padStart(2, '0')}</span>
            <span className="text-[10px] font-medium text-white/70 ml-1 uppercase">{c.label}</span>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-2 sm:gap-3">
      {cells.map((c) => (
        <div
          key={c.label}
          className="min-w-[3.5rem] rounded-xl border border-white/25 bg-black/25 px-3 py-2 text-center backdrop-blur-sm"
        >
          <p className="text-xl sm:text-2xl font-bold tabular-nums leading-none" style={{ color: brand }}>
            {String(c.value).padStart(2, '0')}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-white/70 mt-1">{c.label}</p>
        </div>
      ))}
    </div>
  )
}


export function EventLandingView({
  event,
  config,
  details,
  business,
  ticketItems,
  cartQtyById,
  onQtyChange,
  brandColor,
  children,
  showShare = true,
  previewMode = false,
  onGetTickets
}: Props): JSX.Element {
  const theme = getStorefrontTheme(config)
  const fonts = storefrontFontStyles(config)
  const layout = getEventLandingLayout(event)
  const cover =
    (event.coverImageUrl && event.coverImageUrl.trim()) ||
    (config.heroBannerUrl && String(config.heroBannerUrl).trim()) ||
    ''
  const venueName = details.name?.trim() || business.name || 'Venue'
  const shareUrl = eventShareUrl(business.id, event.slug)
  const shareText = formatZuriEventTitle(event.title, venueName)

  const contactPhone = details.contactPhone?.trim() || business.phone?.trim() || ''
  const ig = details.instagramHandle?.trim().replace(/^@/, '')
  const wa = details.whatsappNumber?.trim()

  const textAlignClass = layout.heroTextAlign === 'center' ? 'text-center items-center mx-auto' : 'text-left'
  const contentMax = layout.heroTextAlign === 'center' ? 'max-w-xl mx-auto' : 'max-w-2xl'

  const heroBackground = cover ? (
    <>
      <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" decoding="async" />
      <div
        className={`absolute inset-0 ${
          layout.heroStyle === 'compact'
            ? 'bg-gradient-to-t from-black/85 via-black/45 to-black/25'
            : 'bg-gradient-to-t from-black/90 via-black/50 to-black/20'
        }`}
        aria-hidden
      />
    </>
  ) : (
    <div
      className="absolute inset-0"
      style={{
        background:
          layout.heroStyle === 'compact'
            ? `linear-gradient(135deg, ${brandColor} 0%, ${theme.page} 70%)`
            : `linear-gradient(145deg, ${brandColor} 0%, #0f172a 55%, #020617 100%)`
      }}
      aria-hidden
    />
  )

  const shareButtons = showShare && !previewMode ? (
    <div className={`flex flex-wrap gap-2 ${layout.heroTextAlign === 'center' ? 'justify-center' : ''}`}>
      <a
        href={whatsappShareHref(shareUrl, shareText)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 rounded-full bg-[#25D366] text-white text-xs font-bold px-4 py-2.5 hover:opacity-95 transition"
      >
        Share on WhatsApp
      </a>
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 text-white text-xs font-bold px-4 py-2.5 hover:bg-white/20 transition"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(shareUrl)
            alert('Link copied — paste into Instagram Stories or your bio.')
          } catch {
            prompt('Copy this link:', shareUrl)
          }
        }}
      >
        Copy for Stories
      </button>
    </div>
  ) : previewMode ? (
    <p className={`text-[11px] text-white/60 ${layout.heroTextAlign === 'center' ? 'text-center' : ''}`}>
      Share links appear on the live event page.
    </p>
  ) : null

  const countdown =
    event.showCountdown !== false && event.eventStartsAt ? (
      <div className={`mb-6 ${layout.heroTextAlign === 'center' ? 'flex flex-col items-center' : ''}`}>
        <p className="text-[11px] uppercase tracking-wider text-white/60 mb-2">Starts in</p>
        <CountdownBlocks iso={event.eventStartsAt} brand={brandColor} style={layout.countdownStyle} />
      </div>
    ) : null

  const heroContent = (
  <>
    {business.logoUrl ? (
      <img
        src={business.logoUrl}
        alt=""
        className={`h-12 w-12 rounded-xl border border-white/30 object-cover mb-4 shadow-lg ${layout.heroTextAlign === 'center' ? 'mx-auto' : ''}`}
      />
    ) : null}
    <p className="text-xs uppercase tracking-[0.2em] text-white/70 mb-2">{venueName}</p>
    <h1
      className={`text-3xl sm:text-4xl ${layout.heroStyle === 'compact' ? 'sm:text-3xl' : 'md:text-5xl'} font-semibold text-white leading-[1.08] mb-3`}
      style={{ fontFamily: fonts.heading }}
    >
      {event.title}
    </h1>
    {event.subtitle ? (
      <p className={`text-base sm:text-lg text-white/85 max-w-lg mb-6 ${layout.heroTextAlign === 'center' ? 'mx-auto' : ''}`}>
        {event.subtitle}
      </p>
    ) : null}
    {countdown}
    {shareButtons}
  </>
  )

  const heroSection =
    layout.heroStyle === 'split' ? (
      <section
        className="relative overflow-hidden"
        style={{ minHeight: layout.heroMinHeight }}
      >
        <div className="absolute inset-0 lg:grid lg:grid-cols-2">
          <div className="relative min-h-[40vh] lg:min-h-full">{heroBackground}</div>
          <div
            className="relative min-h-[32vh] lg:min-h-full flex flex-col justify-end"
            style={{ background: `linear-gradient(160deg, ${brandColor}33 0%, ${theme.page} 100%)` }}
          >
            <div className="absolute inset-0 lg:hidden">{heroBackground}</div>
            <div className={`relative z-10 px-4 sm:px-6 pt-8 pb-10 w-full ${contentMax} ${textAlignClass}`}>
              {heroContent}
            </div>
          </div>
        </div>
      </section>
    ) : (
      <section
        className={`relative flex flex-col justify-end overflow-hidden ${layout.heroStyle === 'centered' ? 'items-center' : ''}`}
        style={{ minHeight: layout.heroMinHeight }}
      >
        {heroBackground}
        <div className={`relative z-10 px-4 sm:px-6 pt-8 pb-10 w-full ${contentMax} ${textAlignClass}`}>
          {heroContent}
        </div>
      </section>
    )

  const lineupSection =
    (event.lineup?.length ?? 0) > 0 ? (
      <section className="max-w-2xl mx-auto px-4 sm:px-6 py-10 w-full">
        <h2 className="text-xl font-bold mb-4" style={{ fontFamily: fonts.heading, color: theme.text }}>
          Lineup
        </h2>
        {layout.lineupStyle === 'chips' ? (
          <div className="flex flex-wrap gap-2">
            {event.lineup!.map((act, i) => (
              <span
                key={`${act.name}-${i}`}
                className="inline-flex flex-col rounded-full border px-4 py-2 text-sm"
                style={{ borderColor: theme.border, background: theme.panel }}
              >
                <span className="font-semibold" style={{ color: theme.text }}>{act.name}</span>
                {act.role ? (
                  <span className="text-[10px] mt-0.5" style={{ color: theme.sub }}>{act.role}</span>
                ) : null}
              </span>
            ))}
          </div>
        ) : layout.lineupStyle === 'grid' ? (
          <ul className="grid grid-cols-2 gap-3">
            {event.lineup!.map((act, i) => (
              <li
                key={`${act.name}-${i}`}
                className="rounded-2xl border px-3 py-3 text-center"
                style={{ borderColor: theme.border, background: theme.panel }}
              >
                <span className="font-semibold block text-sm" style={{ color: theme.text }}>{act.name}</span>
                {act.role ? (
                  <span className="text-[10px] mt-1 block" style={{ color: theme.sub }}>{act.role}</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-3">
            {event.lineup!.map((act, i) => (
              <li
                key={`${act.name}-${i}`}
                className="flex items-center justify-between gap-3 rounded-2xl border px-4 py-3"
                style={{ borderColor: theme.border, background: theme.panel }}
              >
                <span className="font-semibold" style={{ color: theme.text }}>{act.name}</span>
                {act.role ? (
                  <span className="text-xs shrink-0" style={{ color: theme.sub }}>{act.role}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    ) : null

  const policySection =
    (event.refundPolicy || event.refundPolicyText) ? (
      <section className="max-w-2xl mx-auto px-4 sm:px-6 py-6 w-full">
        <div
          className="rounded-2xl border px-4 py-3 text-sm"
          style={{ borderColor: theme.border, background: theme.panel, color: theme.sub }}
        >
          <p className="font-semibold mb-1" style={{ color: theme.text }}>
            Refund policy — {formatRefundPolicyLabel(event.refundPolicy)}
          </p>
          <p className="leading-relaxed">
            {event.refundPolicyText?.trim() ||
              (event.refundPolicy === 'no_refunds'
                ? 'All ticket sales are final unless the venue cancels the event.'
                : 'If the venue cancels this event, buyers receive a full refund.')}
          </p>
        </div>
      </section>
    ) : null

  const ticketGridClass =
    layout.ticketLayout === 'grid'
      ? 'grid sm:grid-cols-2 gap-4'
      : layout.ticketLayout === 'rows'
        ? 'divide-y rounded-2xl border overflow-hidden'
        : 'space-y-4'

  const ticketsSection = (
    <section id="tickets" className="max-w-2xl mx-auto px-4 sm:px-6 pb-8 w-full scroll-mt-4">
      <h2 className="text-xl font-semibold mb-1" style={{ fontFamily: fonts.heading, color: theme.text }}>
        Tickets
      </h2>
      <p className="text-sm mb-5" style={{ color: theme.sub }}>
        Choose your tier — checkout is secure on ZURI.
      </p>
      <div className={ticketGridClass} style={layout.ticketLayout === 'rows' ? { borderColor: theme.border } : undefined}>
        {ticketItems.length === 0 ? (
          <p className="text-sm" style={{ color: theme.sub }}>Ticket tiers will appear when your catalog is published.</p>
        ) : (
          ticketItems.map((item) => {
            const qty = cartQtyById[item.id] ?? 0
            const isRow = layout.ticketLayout === 'rows'
            const soldOut = !item.available || isTicketSoldOut(item)
            const maxQty = getMaxTicketQty(item)
            const remaining = getTicketsRemaining(item)
            return (
              <article
                key={item.id}
                className={
                  isRow
                    ? 'flex items-center justify-between gap-3 px-4 py-3'
                    : 'rounded-2xl border p-4 sm:p-5'
                }
                style={
                  isRow
                    ? { background: theme.panel, borderColor: theme.border }
                    : { borderColor: theme.border, background: theme.panel }
                }
              >
                <div className={`min-w-0 flex-1 ${isRow ? 'flex items-center gap-3' : ''}`}>
                  <div className={isRow ? 'min-w-0 flex-1' : ''}>
                    <p
                      className={`font-medium ${isRow ? 'text-base' : 'text-lg'}`}
                      style={{ fontFamily: fonts.heading, color: theme.text }}
                    >
                      {item.name}
                      {soldOut ? (
                        <span className="ml-2 text-[10px] uppercase tracking-wide font-bold text-red-600">Sold out</span>
                      ) : null}
                    </p>
                    {item.categoryName && !isRow ? (
                      <p className="text-[11px] uppercase tracking-wide mt-0.5" style={{ color: theme.sub }}>
                        {item.categoryName}
                      </p>
                    ) : null}
                    {!isRow && item.description ? (
                      <p className="text-sm mt-2 leading-relaxed" style={{ color: theme.sub }}>{item.description}</p>
                    ) : null}
                  </div>
                  <p
                    className={`font-bold tabular-nums shrink-0 ${isRow ? 'text-lg' : 'text-xl mt-2'}`}
                    style={{ color: brandColor }}
                  >
                    ₦{Number(item.price).toLocaleString()}
                  </p>
                </div>
                <div className={`flex flex-col items-end gap-1 shrink-0 ${isRow ? '' : 'self-end sm:self-center mt-3 sm:mt-0'}`}>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      aria-label="Decrease"
                      disabled={soldOut || qty <= 0}
                      className={`${isRow ? 'w-9 h-9 text-base' : 'w-10 h-10 text-lg'} rounded-xl border font-bold disabled:opacity-40`}
                      style={{ borderColor: theme.border, color: theme.text }}
                      onClick={() => onQtyChange(item, nextTicketQty(qty, 'down', item))}
                    >
                      −
                    </button>
                    <span
                      className={`${isRow ? 'w-6' : 'w-8'} text-center font-bold tabular-nums`}
                      style={{ color: theme.text }}
                    >
                      {qty}
                    </span>
                    <button
                      type="button"
                      aria-label="Increase"
                      disabled={soldOut || maxQty <= 0 || (qty > 0 && nextTicketQty(qty, 'up', item) === qty)}
                      className={`${isRow ? 'w-9 h-9 text-base' : 'w-10 h-10 text-lg'} rounded-xl text-white font-bold disabled:opacity-40`}
                      style={{ backgroundColor: brandColor }}
                      onClick={() => onQtyChange(item, nextTicketQty(qty, 'up', item))}
                    >
                      +
                    </button>
                  </div>
                  {getMinTicketQty(item) > 1 ? (
                    <p className="text-[10px] text-center" style={{ color: theme.sub }}>Min {getMinTicketQty(item)} per order</p>
                  ) : null}
                  {getTicketStep(item) > 1 ? (
                    <p className="text-[10px] text-center" style={{ color: theme.sub }}>Sold in {getTicketStep(item)}s</p>
                  ) : null}
                  {item.maxPerUser != null && Number(item.maxPerUser) >= 1 ? (
                    <p className="text-[10px] text-center" style={{ color: theme.sub }}>Max {getMaxTicketQty(item)} per buyer</p>
                  ) : null}
                  {remaining != null && remaining > 0 && remaining <= 20 ? (
                    <p className="text-[10px] text-center font-semibold" style={{ color: brandColor }}>{remaining} left</p>
                  ) : null}
                </div>
              </article>
            )
          })
        )}
      </div>
      {onGetTickets ? (
        <button
          type="button"
          className="mt-6 w-full rounded-xl py-3.5 text-sm font-bold text-white shadow-md hover:opacity-95 transition"
          style={{ backgroundColor: brandColor }}
          onClick={onGetTickets}
        >
          Continue to checkout
        </button>
      ) : null}
    </section>
  )

  const mainSections = layout.ticketsFirst
    ? [ticketsSection, lineupSection, policySection]
    : [lineupSection, policySection, ticketsSection]

  return (
    <div style={{ background: theme.page, color: theme.text, fontFamily: fonts.body }}>
      {heroSection}
      {mainSections}
      {(contactPhone || ig || wa) ? (
        <footer
          className="max-w-2xl mx-auto px-4 sm:px-6 py-8 border-t w-full"
          style={{ borderColor: theme.border }}
        >
          <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: theme.sub }}>
            Contact & social
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            {contactPhone ? (
              <a href={`tel:${contactPhone.replace(/\s/g, '')}`} className="font-medium underline-offset-2 hover:underline" style={{ color: brandColor }}>
                {contactPhone}
              </a>
            ) : null}
            {ig ? (
              <a
                href={`https://instagram.com/${ig}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline-offset-2 hover:underline"
                style={{ color: brandColor }}
              >
                @{ig}
              </a>
            ) : null}
            {wa ? (
              <a
                href={`https://wa.me/${wa.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium underline-offset-2 hover:underline"
                style={{ color: brandColor }}
              >
                WhatsApp
              </a>
            ) : null}
          </div>
        </footer>
      ) : null}
      {children}
    </div>
  )
}
