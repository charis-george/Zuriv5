import { useState, useRef, useEffect } from 'react'

export interface DropdownOption {
  value: string
  label: string
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

  const ringClass = accent === 'yellow'
    ? 'focus:ring-zuri-yellow focus:border-zuri-yellow'
    : 'focus:ring-zuri-orange/50 focus:border-zuri-orange'
  const activeRingClass = accent === 'yellow'
    ? 'border-zuri-yellow ring-2 ring-zuri-yellow'
    : 'border-zuri-orange ring-2 ring-zuri-orange/50'
  const highlightClass = accent === 'yellow'
    ? 'bg-zuri-yellow/10 text-zuri-black font-semibold'
    : 'bg-zuri-orange/10 text-zuri-orange font-semibold'
  const hoverClass = accent === 'yellow'
    ? 'hover:bg-zuri-yellow/10'
    : 'hover:bg-zuri-orange/10'

  const py = size === 'sm' ? 'py-2' : 'py-2.5'

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { setOpen(o => !o); setSearch('') } }}
        className={`w-full flex items-center justify-between px-4 ${py} border rounded-xl text-sm transition focus:outline-none focus:ring-2 ${ringClass} ${open ? activeRingClass : 'border-gray-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${triggerClassName}`}
        style={triggerStyle}
      >
        <span className={selected ? 'text-inherit' : 'text-gray-400'}>
          {selected?.label || placeholder}
        </span>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          {searchable && (
            <div className="p-2 border-b border-gray-100">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                autoFocus
                className={`w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 ${ringClass}`}
              />
            </div>
          )}
          <ul className="max-h-56 overflow-y-auto overscroll-contain">
            {filtered.map(o => (
              <li key={o.value}>
                <button
                  type="button"
                  onClick={() => { onChange(o.value, o.label); setOpen(false); setSearch('') }}
                  className={`w-full text-left px-4 ${py} text-sm transition ${hoverClass} ${value === o.value ? highlightClass : 'text-zuri-black'}`}
                >
                  {o.label}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-400 text-center">No results</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
