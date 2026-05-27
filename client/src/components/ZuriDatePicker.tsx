import { useState, useRef, useEffect, useMemo } from 'react'

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'] as const

export function parseIsoDateLocal(iso: string): Date | null {
  if (!iso || typeof iso !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const d = Number(m[3])
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null
  const dt = new Date(y, mo, d)
  if (dt.getFullYear() !== y || dt.getMonth() !== mo || dt.getDate() !== d) return null
  return dt
}

export function toIsoDateLocal(d: Date): string {
  const y = d.getFullYear()
  const mo = String(d.getMonth() + 1).padStart(2, '0')
  const da = String(d.getDate()).padStart(2, '0')
  return `${y}-${mo}-${da}`
}

function startOfLocalDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function sameLocalDay(a: Date, b: Date): boolean {
  return startOfLocalDay(a) === startOfLocalDay(b)
}

function monthGrid(viewYear: number, viewMonth: number): (Date | null)[] {
  const first = new Date(viewYear, viewMonth, 1)
  const pad = first.getDay()
  const lastDay = new Date(viewYear, viewMonth + 1, 0).getDate()
  const cells: (Date | null)[] = []
  for (let i = 0; i < pad; i++) cells.push(null)
  for (let day = 1; day <= lastDay; day++) {
    cells.push(new Date(viewYear, viewMonth, day))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

type ZuriDatePickerProps = {
  value: string
  onChange: (iso: string) => void
  placeholder?: string
  id?: string
  disabled?: boolean
  /** ISO YYYY-MM-DD — days before this are disabled */
  minDate?: string
  /** ISO YYYY-MM-DD — days after this are disabled */
  maxDate?: string
  /** Accent matches CustomDropdown */
  accent?: 'orange' | 'yellow'
  /** Show “Clear” in popover (off for required fields like reservations) */
  allowClear?: boolean
}

export function ZuriDatePicker({
  value,
  onChange,
  placeholder = 'Pick a date',
  id,
  disabled = false,
  minDate,
  maxDate,
  accent = 'orange',
  allowClear = true,
}: ZuriDatePickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const selected = useMemo(() => parseIsoDateLocal(value), [value])
  const minD = useMemo(() => (minDate ? parseIsoDateLocal(minDate) : null), [minDate])
  const maxD = useMemo(() => (maxDate ? parseIsoDateLocal(maxDate) : null), [maxDate])

  const initialView = selected ?? new Date()
  const [viewYear, setViewYear] = useState(initialView.getFullYear())
  const [viewMonth, setViewMonth] = useState(initialView.getMonth())

  useEffect(() => {
    if (!open) return
    const base = selected ?? new Date()
    setViewYear(base.getFullYear())
    setViewMonth(base.getMonth())
  }, [open, selected])

  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const grid = useMemo(() => monthGrid(viewYear, viewMonth), [viewYear, viewMonth])
  const today = new Date()

  const ringClass =
    accent === 'yellow'
      ? 'focus:ring-zuri-yellow focus:border-zuri-yellow'
      : 'focus:ring-zuri-orange/50 focus:border-zuri-orange'
  const activeRingClass =
    accent === 'yellow'
      ? 'border-zuri-yellow ring-2 ring-zuri-yellow'
      : 'border-zuri-orange ring-2 ring-zuri-orange/50'

  const label = selected
    ? selected.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  const isDisabledDay = (d: Date): boolean => {
    const t = startOfLocalDay(d)
    if (minD && t < startOfLocalDay(minD)) return true
    if (maxD && t > startOfLocalDay(maxD)) return true
    return false
  }

  const goPrevMonth = (): void => {
    if (viewMonth === 0) {
      setViewMonth(11)
      setViewYear((y) => y - 1)
    } else {
      setViewMonth((m) => m - 1)
    }
  }

  const goNextMonth = (): void => {
    if (viewMonth === 11) {
      setViewMonth(0)
      setViewYear((y) => y + 1)
    } else {
      setViewMonth((m) => m + 1)
    }
  }

  const py = 'py-2.5'

  return (
    <div ref={ref} className="relative w-full min-w-[10rem]">
      <button
        id={id}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!disabled) setOpen((o) => !o)
        }}
        className={`w-full flex items-center justify-between px-4 ${py} border rounded-xl text-sm transition focus:outline-none focus:ring-2 ${ringClass} ${open ? activeRingClass : 'border-gray-200'} ${disabled ? 'opacity-50 cursor-not-allowed' : 'bg-white text-zuri-black'} `}
      >
        <span className={label ? 'text-inherit font-medium' : 'text-gray-400'}>{label || placeholder}</span>
        <svg className={`w-4 h-4 text-gray-400 shrink-0 ml-2 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && !disabled && (
        <div
          className="absolute left-0 right-0 top-full z-[60] mt-1 rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden min-w-[260px] sm:min-w-[280px]"
          role="dialog"
          aria-label="Calendar"
        >
          <div className="border-b border-gray-100 bg-zuri-light/80 px-3 py-2.5 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={goPrevMonth}
              className="p-1.5 rounded-lg text-zuri-black hover:bg-zuri-orange/15 transition focus:outline-none focus:ring-2 focus:ring-zuri-orange/40"
              aria-label="Previous month"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className="text-sm font-bold text-zuri-black tabular-nums">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button
              type="button"
              onClick={goNextMonth}
              className="p-1.5 rounded-lg text-zuri-black hover:bg-zuri-orange/15 transition focus:outline-none focus:ring-2 focus:ring-zuri-orange/40"
              aria-label="Next month"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="p-2.5">
            <div className="grid grid-cols-7 gap-0.5 mb-1">
              {WEEKDAY_LABELS.map((w) => (
                <div key={w} className="text-center text-[10px] font-bold text-gray-500 uppercase tracking-wide py-1">
                  {w}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
              {grid.map((cell, idx) => {
                if (!cell) {
                  return <div key={`e-${idx}`} className="min-h-[2.25rem]" />
                }
                const isSel = selected != null && sameLocalDay(cell, selected)
                const isToday = sameLocalDay(cell, today)
                const dis = isDisabledDay(cell)
                return (
                  <button
                    key={cell.getTime()}
                    type="button"
                    disabled={dis}
                    onClick={() => {
                      if (dis) return
                      onChange(toIsoDateLocal(cell))
                      setOpen(false)
                    }}
                    className={[
                      'min-h-[2.25rem] rounded-lg text-sm font-semibold transition flex items-center justify-center',
                      dis
                        ? 'text-gray-300 cursor-not-allowed'
                        : isSel
                          ? 'bg-zuri-orange text-white shadow-sm'
                          : 'text-zuri-black hover:bg-zuri-orange/15',
                      !dis && !isSel && isToday ? 'ring-2 ring-zuri-orange/40 ring-inset' : '',
                    ].join(' ')}
                  >
                    {cell.getDate()}
                  </button>
                )
              })}
            </div>
          </div>

          {allowClear && selected ? (
            <div className="border-t border-gray-100 px-2.5 py-2 bg-gray-50/80 flex justify-end">
              <button
                type="button"
                className="text-xs font-semibold text-gray-600 hover:text-zuri-orange transition px-2 py-1 rounded-lg"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                Clear
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}
