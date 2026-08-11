import type { ReactNode } from 'react'
import type { StorefrontConfig, StorefrontDetails } from '../../types'
import {
  getStorefrontTheme,
  getHeroBackground,
  getHeroBannerScrim,
  storefrontFontStyles
} from '../../lib/storefrontTheme'

type Props = {
  config: StorefrontConfig
  details: StorefrontDetails
  businessNameFallback: string
  logoUrl?: string | null
  phone?: string | null
  headerRight: ReactNode
  /** Shown only in the customizer live preview */
  showPreviewBadge?: boolean
  /** Dashboard preview column — avoids forcing full viewport height */
  embedded?: boolean
  children: ReactNode
}

function cuisineTagStyle(config: StorefrontConfig): { className: string; style: React.CSSProperties } {
  const base = 'text-[11px] font-medium'
  if (config.pillShape === 'rectangle') {
    return { className: `${base} px-2 py-1 rounded-md`, style: { background: 'rgba(255,255,255,0.22)', color: '#fff' } }
  }
  if (config.pillShape === 'underline') {
    return { className: `${base} pb-0.5 border-b border-white/70`, style: { color: '#fff' } }
  }
  return { className: `${base} px-2 py-1 rounded-full`, style: { background: 'rgba(255,255,255,0.22)', color: '#fff' } }
}

export function StorefrontCustomerLayout({
  config,
  details,
  businessNameFallback,
  logoUrl,
  phone,
  headerRight,
  showPreviewBadge,
  embedded = false,
  children
}: Props): JSX.Element {
  const theme = getStorefrontTheme(config)
  const fonts = storefrontFontStyles(config)
  const title = details.name || businessNameFallback
  const displayPhone = details.contactPhone?.trim() || phone?.trim() || ''
  const ig = details.instagramHandle?.trim().replace(/^@/, '')
  const wa = details.whatsappNumber?.trim()
  const tag = cuisineTagStyle(config)
  const bannerUrl = typeof config.heroBannerUrl === 'string' ? config.heroBannerUrl.trim() : ''
  const hasBanner = bannerUrl.length > 0
  const isShopWindow = config.menuTemplate === 'shop-window'

  if (isShopWindow) {
    return (
      <div
        className={embedded ? 'min-h-0 h-full flex flex-col' : 'min-h-screen flex flex-col'}
        style={{ background: '#ffffff', color: theme.text, fontFamily: fonts.body }}
      >
        <header
          className={`${embedded ? '' : 'sticky top-0 z-30'} border-b bg-white/95 backdrop-blur-sm`}
          style={{ borderColor: '#ececec' }}
        >
          <div className="max-w-6xl mx-auto px-3 sm:px-5 py-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className="h-10 w-10 shrink-0 object-cover rounded-lg border"
                  style={{ borderColor: '#ececec' }}
                />
              ) : (
                <div
                  className="h-10 w-10 shrink-0 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                  style={{ background: config.brandColor || '#111' }}
                >
                  {title.slice(0, 1).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <h1
                  className="font-semibold truncate text-[15px] sm:text-base"
                  style={{ fontFamily: fonts.heading, color: '#111' }}
                >
                  {title}
                </h1>
                {details.tagline ? (
                  <p className="text-xs truncate text-neutral-500">{details.tagline}</p>
                ) : null}
              </div>
            </div>
            <div className="shrink-0">{headerRight}</div>
          </div>
        </header>

        {(hasBanner || details.cuisineTags?.length) && (
          <div className="relative w-full overflow-hidden" style={{ maxHeight: hasBanner ? 180 : undefined }}>
            {hasBanner ? (
              <>
                <img src={bannerUrl} alt="" className="h-[140px] sm:h-[180px] w-full object-cover" decoding="async" />
                <div className="absolute inset-0 bg-black/25" aria-hidden />
              </>
            ) : null}
            {details.cuisineTags?.length ? (
              <div className={`px-4 py-3 flex flex-wrap gap-2 ${hasBanner ? 'absolute bottom-0 left-0 right-0' : ''}`}>
                {details.cuisineTags.slice(0, 8).map((t) => (
                  <span
                    key={t}
                    className="text-[11px] font-medium px-2.5 py-1 rounded-md bg-white/90 text-neutral-800 border border-black/5"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        )}

        {showPreviewBadge ? (
          <p className="px-4 pt-3 text-xs uppercase tracking-wider text-neutral-400">Live preview</p>
        ) : null}

        <main className="flex-1 max-w-6xl w-full mx-auto px-3 sm:px-5 py-5">{children}</main>

        <footer className="border-t mt-auto" style={{ borderColor: '#ececec' }}>
          <div className="max-w-6xl mx-auto px-3 sm:px-5 py-4 text-xs text-neutral-500 flex flex-wrap gap-x-4 gap-y-1">
            {displayPhone ? <span>{displayPhone}</span> : null}
            {ig ? <span>@{ig}</span> : null}
            {wa ? <span>WhatsApp {wa}</span> : null}
            <span className="ml-auto">Powered by ZURI</span>
          </div>
        </footer>
      </div>
    )
  }

  return (
    <div
      className={embedded ? 'min-h-0 h-full flex flex-col' : 'min-h-screen flex flex-col'}
      style={{ background: theme.page, color: theme.text, fontFamily: fonts.body }}
    >
      <div
        className="relative w-full box-border flex flex-col justify-end flex-shrink-0 overflow-hidden max-md:max-h-[min(52svh,420px)]"
        style={{
          minHeight: `clamp(200px, min(48dvh, ${config.heroHeight}px), ${config.heroHeight}px)`,
          color: '#fff'
        }}
      >
        {hasBanner ? (
          <>
            <img src={bannerUrl} alt="" className="absolute inset-0 h-full w-full object-cover pointer-events-none" decoding="async" />
            <div className="absolute inset-0 pointer-events-none" style={{ background: getHeroBannerScrim(config) }} aria-hidden />
          </>
        ) : (
          <div className="absolute inset-0" style={{ background: getHeroBackground(config) }} aria-hidden />
        )}
        {showPreviewBadge ? (
          <p className="absolute top-5 left-6 z-20 text-xs uppercase tracking-wider text-white/80">Live preview</p>
        ) : null}
        <div className="relative z-10 px-4 pt-6 pb-8 sm:px-6 sm:pt-7 sm:pb-9">
          <h1
            className="font-semibold leading-tight max-w-full break-words"
            style={{ fontSize: config.titleSize, fontFamily: fonts.heading }}
          >
            {title}
          </h1>
          {details.tagline ? <p className="text-sm text-white/85 mt-2 max-w-xl">{details.tagline}</p> : null}
          {details.cuisineTags?.length ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {details.cuisineTags.slice(0, 8).map((t) => (
                <span key={t} className={tag.className} style={tag.style}>
                  {t}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <header className={`${embedded ? '' : 'sticky top-0 z-20'} border-b`} style={{ background: theme.panel, borderColor: theme.border }}>
        <div className="max-w-6xl mx-auto px-3 sm:px-4 py-3">
          <div className="flex flex-col gap-3 min-w-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt=""
                  className="h-11 w-11 shrink-0 object-cover border"
                  style={{ borderRadius: Math.max(8, config.cardRadius - 4), borderColor: theme.border }}
                />
              ) : null}
              <div className="min-w-0">
                <h2
                  className="font-medium truncate"
                  style={{
                    fontSize: Math.min(Math.round(config.titleSize * 0.55), 22),
                    color: theme.text,
                    fontFamily: fonts.heading
                  }}
                >
                  {title}
                </h2>
                {details.tagline ? (
                  <p className="text-xs truncate" style={{ color: theme.sub }}>
                    {details.tagline}
                  </p>
                ) : null}
                {displayPhone ? (
                  <p className="text-xs truncate" style={{ color: theme.sub }}>
                    {displayPhone}
                  </p>
                ) : null}
                {ig || wa ? (
                  <p className="text-[10px] truncate mt-0.5 flex gap-2" style={{ color: theme.sub }}>
                    {ig ? <span>@{ig}</span> : null}
                    {wa ? <span>WhatsApp</span> : null}
                  </p>
                ) : null}
              </div>
            </div>
            <div className="shrink-0 self-end sm:self-auto min-w-0 flex justify-end w-full sm:w-auto">{headerRight}</div>
          </div>
        </div>
      </header>

      <div className={embedded ? 'max-w-6xl mx-auto px-3 py-5 sm:px-4 sm:py-6 flex-1 w-full min-w-0' : 'max-w-6xl mx-auto px-3 py-6 sm:px-4 sm:py-8 flex-1 w-full min-w-0'}>
        {children}
      </div>
    </div>
  )
}
