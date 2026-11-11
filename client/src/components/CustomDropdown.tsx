import { useState, useRef, useEffect } from 'react'

export interface DropdownOption {
  value: string
  label: string
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim())
  if (!m) return null
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) }
}

function colorAlpha(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return hex
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`
}

interface CustomDropdownProps {
  options: DropdownOption[]
  value: string
  onChange: (value: string, label: string) => void
  placeholder?: string
  searchable?: boolean
  disabled?: boolean
  className?: string
  triggerClassName?: string
  /** Custom inline styles for the trigger (e.g. themed OrderPage selectors) */
  triggerStyle?: React.CSSProperties
  /** Accent color class for focus ring & selected highlight. Defaults to zuri-orange */
  accent?: 'orange' | 'yellow'
  /** Storefront brand color — overrides accent classes when set */
  brandColor?: string
  /** Custom inline styles for the dropdown panel */
  panelStyle?: React.CSSProperties
  /** Text color for unselected options (storefront theming) */
  optionTextColor?: string
  /** Size variant */
  size?: 'sm' | 'md'
}

export function CustomDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select…',
  searchable = false,
  disabled = false,
  className = '',
  triggerClassName = '',
  triggerStyle,
  accent = 'orange',
  brandColor,
  panelStyle,
  optionTextColor,
  size = 'md',
}: CustomDropdownProps) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const selected = options.find(o => o.value === value)
  const filtered = searchable
    ? options.filter(o => o.label.toLowerCase().includes(search.toLowerCase()))
    : options

  const themed = !!brandColor?.trim()
  const accentHex = themed ? brandColor!.trim() : ''

  const ringClass = themed
    ? ''
    : accent === 'yellow'
      ? 'focus:ring-zuri-yellow focus:border-zuri-yellow'
      : 'focus:ring-zuri-orange/50 focus:border-zuri-orange'
  const activeRingClass = themed
    ? ''
    : accent === 'yellow'
      ? 'border-zuri-yellow ring-2 ring-zuri-yellow'
      : 'border-zuri-orange ring-2 ring-zuri-orange/50'
  const highlightClass = themed
    ? ''
    : accent === 'yellow'
      ? 'bg-zuri-yellow/10 text-zuri-black font-semibold'
      : 'bg-zuri-orange/10 text-zuri-orange font-semibold'
  const hoverClass = themed
    ? ''
    : accent === 'yellow'
      ? 'hover:bg-zuri-yellow/10'
      : 'hover:bg-zuri-orange/10'

  const themedTriggerStyle: React.CSSProperties | undefined = themed
    ? {
        ...(open
          ? { borderColor: accentHex, boxShadow: `0 0 0 2px ${colorAlpha(accentHex, 0.35)}` }
          : {}),
      }
    : undefined

  const themedPanelStyle: React.CSSProperties = themed
    ? {
        background: panelStyle?.background ?? '#ffffff',
        borderColor: panelStyle?.borderColor ?? colorAlpha(accentHex, 0.2),
        ...panelStyle,
      }
    : (panelStyle ?? {})

  const py = size === 'sm' ? 'py-2' : 'py-2.5'

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { setOpen(o => !o); setSearch('') } }}
        className={`w-full flex items-center justify-between px-4 ${py} border rounded-xl text-sm transition focus:outline-none ${themed ? 'focus:ring-0' : 'focus:ring-2'} ${ringClass} ${open ? (themed ? '' : activeRingClass) : (themed ? '' : 'border-gray-200')} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${triggerClassName}`}
        style={{ ...triggerStyle, ...themedTriggerStyle }}
      >
        <span className={selected ? 'text-inherit' : 'text-gray-400'}>
          {selected?.label || placeholder}
        </span>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div
          className={`absolute left-0 right-0 top-full mt-1 z-50 rounded-xl shadow-lg overflow-hidden ${themed ? 'border' : 'bg-white border border-gray-200'}`}
          style={themed ? themedPanelStyle : panelStyle}
        >
          {searchable && (
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                autoFocus
                className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none ${themed ? 'focus:ring-0' : `focus:ring-2 ${ringClass}`}`}
                style={themed ? { borderColor: colorAlpha(accentHex, 0.25) } : undefined}
                onFocus={(e) => {
                  if (themed) {
                    e.currentTarget.style.borderColor = accentHex
                    e.currentTarget.style.boxShadow = `0 0 0 2px ${colorAlpha(accentHex, 0.35)}`
                  }
                }}
                onBlur={(e) => {
                  if (themed) {
                    e.currentTarget.style.borderColor = colorAlpha(accentHex, 0.25)
                    e.currentTarget.style.boxShadow = 'none'
                  }
                }}
              />
            </div>
          )}
          <ul className="max-h-56 overflow-y-auto overscroll-contain">
            {filtered.map(o => {
              const isSelected = value === o.value
              const optionStyle: React.CSSProperties | undefined = themed
                ? {
                    color: isSelected ? accentHex : (optionTextColor ?? 'inherit'),
                    background: isSelected ? colorAlpha(accentHex, 0.12) : undefined,
                    fontWeight: isSelected ? 600 : undefined,
                  }
                : undefined
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    onClick={() => { onChange(o.value, o.label); setOpen(false); setSearch('') }}
                    className={`w-full text-left px-4 ${py} text-sm transition ${themed ? '' : hoverClass} ${isSelected && !themed ? highlightClass : (!themed ? 'text-zuri-black' : '')}`}
                    style={optionStyle}
                    onMouseEnter={(e) => {
                      if (themed && !isSelected) {
                        e.currentTarget.style.background = colorAlpha(accentHex, 0.08)
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (themed && !isSelected) {
                        e.currentTarget.style.background = ''
                      }
                    }}
                  >
                    {o.label}
                  </button>
                </li>
              )
            })}
            {filtered.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-400 text-center">No results</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
