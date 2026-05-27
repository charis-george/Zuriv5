import type { ReactNode } from 'react'
import type { StorefrontConfig, StorefrontDetails } from '../../types'
import {
  getStorefrontTheme,
  getHeroBackground,
  getHeroBannerScrim,
  storefrontFontFamily
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
  const font = storefrontFontFamily(config)
  const title = details.name || businessNameFallback
  const tag = cuisineTagStyle(config)
  const bannerUrl = typeof config.heroBannerUrl === 'string' ? config.heroBannerUrl.trim() : ''
  const hasBanner = bannerUrl.length > 0

  return (
    <div
      className={embedded ? 'min-h-0 h-full flex flex-col' : 'min-h-screen flex flex-col'}
      style={{ background: theme.page, color: theme.text, fontFamily: font }}
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
          <h1 className="font-extrabold leading-tight max-w-full break-words" style={{ fontSize: config.titleSize }}>
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
                  className="font-bold truncate"
                  style={{ fontSize: Math.min(Math.round(config.titleSize * 0.55), 22), color: theme.text }}
                >
                  {title}
                </h2>
                {details.tagline ? (
                  <p className="text-xs truncate" style={{ color: theme.sub }}>
                    {details.tagline}
                  </p>
                ) : null}
                {phone ? (
                  <p className="text-xs truncate" style={{ color: theme.sub }}>
                    {phone}
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
