import type { ReactNode } from 'react'
import type { StorefrontConfig, StorefrontDetails } from '../../types'
import {
  getStorefrontTheme,
  getHeroBackground,
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

  return (
    <div
      className={embedded ? 'min-h-0 h-full flex flex-col' : 'min-h-screen'}
      style={{ background: theme.page, color: theme.text, fontFamily: font }}
    >
      <div
        className="relative w-full px-6 pt-7 pb-9 box-border flex flex-col justify-end flex-shrink-0"
        style={{ minHeight: config.heroHeight, background: getHeroBackground(config), color: '#fff' }}
      >
        {showPreviewBadge ? (
          <p className="absolute top-5 left-6 text-xs uppercase tracking-wider text-white/80">Live preview</p>
        ) : null}
        <div>
          <h1 className="font-extrabold leading-tight" style={{ fontSize: config.titleSize }}>
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

      <header className="sticky top-0 z-20 border-b" style={{ background: theme.panel, borderColor: theme.border }}>
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
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
            {headerRight}
          </div>
        </div>
      </header>

      <div className={embedded ? 'max-w-6xl mx-auto px-4 py-6 flex-1 overflow-y-auto' : 'max-w-6xl mx-auto px-4 py-8'}>
        {children}
      </div>
    </div>
  )
}
