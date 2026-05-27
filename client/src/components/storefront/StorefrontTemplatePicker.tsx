import type { StorefrontConfig, StorefrontMenuTemplateId } from '../../types'
import {
  STOREFRONT_MENU_TEMPLATES,
  applyStorefrontMenuTemplate,
  resolveActiveMenuTemplateId,
} from '../../lib/storefrontTemplates'

type Props = {
  config: StorefrontConfig
  onApply: (next: StorefrontConfig) => void
}

function TemplateMiniPreview({
  page,
  accent,
  panel,
  horizontal,
}: {
  page: string
  accent: string
  panel: string
  horizontal?: boolean
}): JSX.Element {
  return (
    <div className="rounded-lg overflow-hidden border border-black/10 h-[72px] flex flex-col" style={{ background: page }}>
      <div className="h-3 shrink-0" style={{ background: accent }} />
      <div className="flex-1 p-1.5 flex flex-col gap-1 justify-center">
        {horizontal ? (
          <>
            <div className="flex gap-1 items-center">
              <div className="w-5 h-5 rounded shrink-0" style={{ background: `${accent}55` }} />
              <div className="h-1.5 flex-1 rounded-full bg-black/10" />
            </div>
            <div className="flex gap-1 items-center">
              <div className="w-5 h-5 rounded shrink-0" style={{ background: `${accent}33` }} />
              <div className="h-1.5 flex-1 rounded-full bg-black/10" />
            </div>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-1">
            <div className="h-6 rounded-sm" style={{ background: panel, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }} />
            <div className="h-6 rounded-sm" style={{ background: panel, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }} />
          </div>
        )}
      </div>
    </div>
  )
}

export function StorefrontTemplatePicker({ config, onApply }: Props): JSX.Element {
  const activeId = resolveActiveMenuTemplateId(config)

  const selectTemplate = (id: StorefrontMenuTemplateId): void => {
    onApply(applyStorefrontMenuTemplate(config, id))
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-700">Storefront themes</p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
          Visual layout presets (colours, cards, hero). For separate item lists (breakfast vs dinner), use Catalog presets in the Menu tab.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 max-h-[min(420px,50vh)] overflow-y-auto pr-0.5">
        {STOREFRONT_MENU_TEMPLATES.map((t) => {
          const selected = activeId === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => selectTemplate(t.id)}
              className={`text-left rounded-xl border p-2 transition ${
                selected
                  ? 'border-zuri-orange ring-2 ring-zuri-orange/25 bg-zuri-orange/5'
                  : 'border-gray-200 hover:border-zuri-orange/40 bg-white'
              }`}
            >
              <TemplateMiniPreview
                page={t.preview.page}
                accent={t.preview.accent}
                panel={t.preview.panel}
                horizontal={t.config.cardLayout === 'horizontal'}
              />
              <p className="text-[11px] font-semibold text-zuri-black mt-2 leading-tight">{t.name}</p>
              <p className="text-[10px] text-gray-500 mt-0.5 line-clamp-2 leading-snug">{t.description}</p>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {t.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          )
        })}
      </div>
      {activeId === 'custom' ? (
        <p className="text-[10px] text-gray-500">Custom mix — pick a template anytime to reset the layout style.</p>
      ) : null}
    </div>
  )
}

