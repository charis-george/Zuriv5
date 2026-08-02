import type { StorefrontConfig, StorefrontFontPairingId } from '../../types'
import { STOREFRONT_FONT_PAIRINGS, normalizeFontPairingId } from '../../lib/storefrontFontPairings'

type Props = {
  config: StorefrontConfig
  onSelect: (id: StorefrontFontPairingId) => void
}

export function StorefrontFontPairingPicker({ config, onSelect }: Props): JSX.Element {
  const active = normalizeFontPairingId(config.fontFamily)

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-700">Typography pairing</p>
      <p className="text-[11px] text-gray-500 leading-snug">Simple sans-serif families — same font for titles and body, no display or serif mixes.</p>
      <div className="grid grid-cols-2 gap-2">
        {STOREFRONT_FONT_PAIRINGS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onSelect(preset.id)}
            className={`text-left rounded-xl border px-3 py-2.5 transition ${
              active === preset.id
                ? 'border-zuri-orange bg-zuri-orange/10 ring-1 ring-zuri-orange/30'
                : 'border-gray-200 bg-white hover:border-gray-300'
            }`}
          >
            <p
              className="text-sm font-medium text-gray-900 leading-tight"
              style={{ fontFamily: preset.headingFont }}
            >
              {preset.label}
            </p>
            <p className="text-[10px] text-gray-500 mt-0.5">{preset.personality}</p>
            <p className="text-[10px] text-gray-400 mt-1 truncate" style={{ fontFamily: preset.bodyFont }}>
              Aa Bb 123
            </p>
          </button>
        ))}
      </div>
    </div>
  )
}
