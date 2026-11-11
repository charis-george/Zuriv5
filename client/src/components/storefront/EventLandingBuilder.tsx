import type { EventRefundPolicy, StorefrontDetails, StorefrontEventPage, StorefrontProfile } from '../../types'
import {
  formatRefundPolicyLabel,
  createDefaultEventPage,
  slugifyEventTitle,
  eventShareUrl
} from '../../lib/storefrontEventPages'
import { formatZuriEventTitle } from '../../lib/storefrontSeoTitles'
import { EventTemplatePicker } from './EventTemplatePicker'

type Props = {
  businessId: string
  businessName?: string
  details: StorefrontDetails
  onChange: (pages: StorefrontEventPage[]) => void
  selectedId: string | null
  onSelectId: (id: string | null) => void
  storefrontProfiles?: StorefrontProfile[]
  activeStorefrontId?: string | null
}

export function EventLandingBuilder({
  businessId,
  businessName,
  details,
  onChange,
  selectedId,
  onSelectId,
  storefrontProfiles = [],
  activeStorefrontId
}: Props): JSX.Element {
  const pages = details.eventPages ?? []
  const selected = pages.find((p) => p.id === selectedId) ?? pages[0] ?? null
  const venueName = details.name?.trim() || businessName?.trim() || 'Venue'
  const activeStorefront =
    storefrontProfiles.find((p) => p.id === activeStorefrontId) ??
    storefrontProfiles.find((p) => p.isDefault) ??
    storefrontProfiles[0] ??
    null

  const patchSelected = (patch: Partial<StorefrontEventPage>): void => {
    if (!selected) return
    onChange(pages.map((p) => (p.id === selected.id ? { ...p, ...patch } : p)))
  }

  const addEvent = (): void => {
    const next = createDefaultEventPage(`Event ${pages.length + 1}`)
    if (activeStorefrontId) next.storefrontId = activeStorefrontId
    onChange([...pages, next])
    onSelectId(next.id)
  }

  const removeEvent = (id: string): void => {
    const next = pages.filter((p) => p.id !== id)
    onChange(next)
    onSelectId(next[0]?.id ?? null)
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-semibold text-gray-700">Event landing pages</p>
        <p className="text-[11px] text-gray-500 mt-1 leading-snug">
          Each event gets a branded micropage with cover, lineup, countdown, and ticket tiers — shareable on WhatsApp and Instagram.
          {activeStorefront ? (
            <span className="block mt-1 text-zuri-orange font-medium">
              Connected to storefront: {activeStorefront.name}
            </span>
          ) : null}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {pages.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelectId(p.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border truncate max-w-[10rem] ${
              selected?.id === p.id ? 'border-zuri-orange text-zuri-orange bg-zuri-orange/10' : 'border-gray-200 text-gray-600'
            }`}
          >
            {p.title}
          </button>
        ))}
        <button
          type="button"
          onClick={addEvent}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-gray-300 text-gray-600 hover:border-zuri-orange hover:text-zuri-orange"
        >
          + New event
        </button>
      </div>

      {!selected ? (
        <p className="text-sm text-gray-500">Add an event to start building your landing page.</p>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
          <EventTemplatePicker
            event={selected}
            onApply={(next) => onChange(pages.map((p) => (p.id === selected.id ? next : p)))}
          />
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Event title</label>
            <input
              value={selected.title}
              onChange={(e) => {
                const title = e.target.value
                patchSelected({ title, slug: slugifyEventTitle(title || 'event') })
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            />
            <p className="text-[10px] text-gray-500 mt-1 truncate" title={formatZuriEventTitle(selected.title, venueName)}>
              Browser tab &amp; shares: {formatZuriEventTitle(selected.title, venueName)}
            </p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Link ending</label>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 shrink-0">/event/…/</span>
              <input
                value={selected.slug}
                onChange={(e) => patchSelected({ slug: slugifyEventTitle(e.target.value || selected.title) })}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              />
            </div>
            {businessId ? (
              <p className="text-[10px] text-gray-500 mt-1 break-all">
                {eventShareUrl(businessId, selected.slug)}
              </p>
            ) : null}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Subtitle</label>
            <input
              value={selected.subtitle ?? ''}
              onChange={(e) => patchSelected({ subtitle: e.target.value })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Cover image URL</label>
            <input
              value={selected.coverImageUrl ?? ''}
              onChange={(e) => patchSelected({ coverImageUrl: e.target.value || null })}
              placeholder="https://… or leave blank to use storefront banner"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Event start (countdown)</label>
            <input
              type="datetime-local"
              value={selected.eventStartsAt ? selected.eventStartsAt.slice(0, 16) : ''}
              onChange={(e) => {
                const v = e.target.value
                patchSelected({ eventStartsAt: v ? new Date(v).toISOString() : selected.eventStartsAt })
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            />
          </div>
          <label className="flex items-center justify-between text-sm text-gray-700">
            <span>Show countdown</span>
            <input
              type="checkbox"
              checked={selected.showCountdown !== false}
              onChange={(e) => patchSelected({ showCountdown: e.target.checked })}
            />
          </label>
          <label className="flex items-center justify-between text-sm text-gray-700">
            <span>Published</span>
            <input
              type="checkbox"
              checked={selected.enabled !== false}
              onChange={(e) => patchSelected({ enabled: e.target.checked })}
            />
          </label>

          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Refund / cancellation policy</label>
            <select
              value={selected.refundPolicy || 'full_before_event'}
              onChange={(e) => patchSelected({ refundPolicy: e.target.value as EventRefundPolicy })}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            >
              <option value="no_refunds">{formatRefundPolicyLabel('no_refunds')}</option>
              <option value="full_before_event">{formatRefundPolicyLabel('full_before_event')}</option>
              <option value="custom">{formatRefundPolicyLabel('custom')}</option>
            </select>
            <textarea
              value={selected.refundPolicyText ?? ''}
              onChange={(e) => patchSelected({ refundPolicyText: e.target.value })}
              placeholder="Describe refund terms shown to buyers at checkout…"
              rows={3}
              className="w-full mt-2 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
            />
            <p className="text-[10px] text-gray-500 mt-1">Buyers see this before paying for tickets.</p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-500">Lineup</label>
              <button
                type="button"
                className="text-[11px] font-semibold text-zuri-orange"
                onClick={() =>
                  patchSelected({
                    lineup: [...(selected.lineup ?? []), { name: 'Artist name', role: 'Stage' }]
                  })
                }
              >
                + Add act
              </button>
            </div>
            <div className="space-y-2">
              {(selected.lineup ?? []).map((act, idx) => (
                <div key={idx} className="flex gap-2">
                  <input
                    value={act.name}
                    onChange={(e) => {
                      const lineup = [...(selected.lineup ?? [])]
                      lineup[idx] = { ...lineup[idx], name: e.target.value }
                      patchSelected({ lineup })
                    }}
                    placeholder="Name"
                    className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
                  />
                  <input
                    value={act.role ?? ''}
                    onChange={(e) => {
                      const lineup = [...(selected.lineup ?? [])]
                      lineup[idx] = { ...lineup[idx], role: e.target.value }
                      patchSelected({ lineup })
                    }}
                    placeholder="Role"
                    className="w-24 px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
                  />
                  <button
                    type="button"
                    className="text-red-600 text-xs px-1"
                    onClick={() => {
                      const lineup = (selected.lineup ?? []).filter((_, i) => i !== idx)
                      patchSelected({ lineup })
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="text-xs font-semibold text-red-600 hover:underline"
            onClick={() => removeEvent(selected.id)}
          >
            Delete this event
          </button>
        </div>
      )}
    </div>
  )
}
