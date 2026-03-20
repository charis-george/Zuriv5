import type { StorefrontConfig } from '../../types'
import { getStorefrontTheme, cardShadowClass } from '../../lib/storefrontTheme'

export type StorefrontMenuGridItem = {
  id: string
  name: string
  description?: string
  price: number
  imageUrl?: string
  available: boolean
}

export type StorefrontMenuGridCategory = {
  id: string
  name: string
  items: StorefrontMenuGridItem[]
}

type Props = {
  config: StorefrontConfig
  categories: StorefrontMenuGridCategory[]
  onItemClick: (item: StorefrontMenuGridItem) => void
  emptyMessage?: string
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
    <h2
      className="text-lg font-bold mb-4 pb-2 border-b-2"
      style={{ color: theme.text, borderColor: config.brandColor }}
    >
      {name}
    </h2>
  )
}

function gridClass(config: StorefrontConfig): string {
  if (config.gridStyle === 'row_list') return 'grid grid-cols-1'
  if (config.gridStyle === 'wide_cards') return 'grid grid-cols-1 md:grid-cols-2'
  return 'grid sm:grid-cols-2'
}

function imageRadius(config: StorefrontConfig): number | string {
  const base = Math.max(6, config.cardRadius - 4)
  if (config.cardImageShape === 'square') return 4
  if (config.cardImageShape === 'circle') return 9999
  return base
}

export function StorefrontMenuGrid({
  config,
  categories,
  onItemClick,
  emptyMessage = 'No menu items available'
}: Props): JSX.Element {
  const theme = getStorefrontTheme(config)
  const shadow = cardShadowClass(config.shadowDepth)

  if (categories.length === 0) {
    return (
      <div
        className="rounded-2xl border p-8 text-center"
        style={{ background: theme.panel, borderColor: theme.border }}
      >
        <p className="text-sm" style={{ color: theme.sub }}>
          {emptyMessage}
        </p>
      </div>
    )
  }

  return (
    <>
      {categories.map((category, catIdx) => {
        const showBottomDivider = catIdx < categories.length - 1 && config.dividerStyle !== 'none'
        return (
          <section
            key={category.id}
            className={showBottomDivider ? 'pb-8 mb-2' : 'mb-10 last:mb-0'}
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
                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => item.available && onItemClick(item)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && item.available) {
                        e.preventDefault()
                        onItemClick(item)
                      }
                    }}
                    className={`border p-5 transition ${shadow} ${
                      !item.available ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
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
                        className={
                          isCircle ? 'w-28 h-28 mx-auto mb-3 rounded-full overflow-hidden shrink-0' : 'w-full mb-3'
                        }
                      >
                        <img
                          src={item.imageUrl}
                          alt=""
                          className={isCircle ? 'w-full h-full object-cover' : 'w-full h-40 object-cover'}
                          style={isCircle ? undefined : { borderRadius: imgR as number }}
                        />
                      </div>
                    ) : null}
                    {config.showPhotos && !item.imageUrl ? (
                      <div
                        className={`mb-3 ${isCircle ? 'w-28 h-28 mx-auto rounded-full' : 'w-full h-24'}`}
                        style={{ borderRadius: isCircle ? 9999 : (imgR as number), background: `${config.brandColor}22` }}
                      />
                    ) : null}
                  <div className="flex justify-between items-start gap-2 mb-1">
                    <h3 className="font-bold" style={{ color: theme.text }}>
                      {item.name}
                    </h3>
                    <span
                      className="font-bold text-sm shrink-0"
                      style={{ color: config.priceTextColor || config.brandColor }}
                    >
                      ₦{Number(item.price).toFixed(2)}
                    </span>
                  </div>
                  {config.showDescriptions && item.description ? (
                    <p className="text-xs mb-2 line-clamp-2" style={{ color: theme.sub }}>
                      {item.description}
                    </p>
                  ) : null}
                    {!item.available ? (
                      <span className="text-red-500 text-xs font-semibold">Out of stock</span>
                    ) : null}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </>
  )
}
