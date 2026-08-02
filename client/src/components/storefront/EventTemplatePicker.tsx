import type { StorefrontEventPage } from '../../types'
import {
  STOREFRONT_EVENT_TEMPLATES,
  applyEventTemplate,
  resolveActiveEventTemplateId,
} from '../../lib/storefrontEventTemplates'

type Props = {
  event: StorefrontEventPage
  onApply: (next: StorefrontEventPage) => void
}

function EventTemplateMiniPreview({
  hero,
  accent,
  panel,
  centered,
}: {
  hero: string
  accent: string
  panel: string
  centered?: boolean
}): JSX.Element {
  return (
    <div className="rounded-lg overflow-hidden border border-black/10 h-[72px] flex flex-col" style={{ background: hero }}>
      <div className={`flex-1 p-2 flex flex-col gap-1 ${centered ? 'items-center justify-center' : 'justify-end'}`}>
        <div className={`h-1.5 rounded-full bg-white/40 ${centered ? 'w-10' : 'w-14'}`} />
        <div className={`h-1 rounded-full bg-white/25 ${centered ? 'w-8' : 'w-10'}`} />
      </div>
      <div className="h-5 px-1.5 flex gap-1 items-center" style={{ background: panel }}>
        <div className="h-2.5 flex-1 rounded-sm" style={{ background: `${accent}33` }} />
        <div className="h-2.5 w-6 rounded-sm" style={{ background: accent }} />
      </div>
    </div>
  )
}

export function EventTemplatePicker({ event, onApply }: Props): JSX.Element {
  const activeId = resolveActiveEventTemplateId(event)

  const selectTemplate = (id: typeof STOREFRONT_EVENT_TEMPLATES[number]['id']): void => {
    onApply(applyEventTemplate(event, id))
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-700">Event page design</p>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-relaxed">
          Layout presets for hero, countdown, lineup, and ticket placement — each event can have its own look.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2 max-h-[min(360px,45vh)] overflow-y-auto pr-0.5">
        {STOREFRONT_EVENT_TEMPLATES.map((t) => {
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
              <EventTemplateMiniPreview
                hero={t.preview.hero}
                accent={t.preview.accent}
                panel={t.preview.panel}
                centered={t.layout.heroTextAlign === 'center'}
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
        <p className="text-[10px] text-gray-500">Custom layout — pick a template anytime to reset the design.</p>
      ) : null}
    </div>
  )
}
