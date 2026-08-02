import type { StorefrontProfile } from '../../types'
import { storefrontShareUrl } from '../../lib/storefrontProfiles'

type Props = {
  businessId: string
  profiles: StorefrontProfile[]
  selectedId: string | null
  onSelectId: (id: string) => void
  onAdd?: () => void
  compact?: boolean
}

export function StorefrontProfilePicker({
  businessId,
  profiles,
  selectedId,
  onSelectId,
  onAdd,
  compact = false
}: Props): JSX.Element {
  const selected = profiles.find((p) => p.id === selectedId) ?? profiles[0] ?? null

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <div>
        <p className="text-xs font-semibold text-gray-700">Storefront</p>
        {!compact ? (
          <p className="text-[11px] text-gray-500 mt-1 leading-snug">
            Each storefront has its own link and branding. Connect events to the storefront they belong to.
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {profiles.map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => onSelectId(profile.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border truncate max-w-[11rem] ${
              selected?.id === profile.id
                ? 'border-zuri-orange text-zuri-orange bg-zuri-orange/10'
                : 'border-gray-200 text-gray-600'
            }`}
            title={profile.name}
          >
            {profile.name}
          </button>
        ))}
        {onAdd ? (
          <button
            type="button"
            onClick={onAdd}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-dashed border-gray-300 text-gray-600 hover:border-zuri-orange hover:text-zuri-orange"
          >
            + New storefront
          </button>
        ) : null}
      </div>
      {selected && businessId ? (
        <p className="text-[10px] text-gray-500 break-all">
          Live link: {storefrontShareUrl(businessId, selected)}
        </p>
      ) : null}
    </div>
  )
}
