import { useEffect } from 'react'

export type NoticeVariant = 'info' | 'success' | 'error' | 'warning'

export interface NoticeModalProps {
  open: boolean
  title?: string
  message: string
  variant?: NoticeVariant
  buttonLabel?: string
  onClose: () => void
}

export function NoticeModal({
  open,
  title,
  message,
  variant = 'info',
  buttonLabel = 'OK',
  onClose
}: NoticeModalProps): JSX.Element | null {
  useEffect(() => {
    if (!open) return
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [open, onClose])

  if (!open) return null

  const variantStyles: Record<NoticeVariant, string> = {
    info: 'border-gray-200',
    success: 'border-green-200 bg-green-50/30',
    error: 'border-red-200 bg-red-50/30',
    warning: 'border-amber-200 bg-amber-50/30'
  }
  const buttonStyles: Record<NoticeVariant, string> = {
    info: 'bg-zuri-orange hover:bg-zuri-orange-dark text-white',
    success: 'bg-green-600 hover:bg-green-700 text-white',
    error: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white'
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden="true" />
      <div className={`relative w-full max-w-md bg-white rounded-2xl border p-6 ${variantStyles[variant]}`}>
        {title && <h2 className="text-lg font-semibold text-zuri-black mb-2">{title}</h2>}
        <p className="text-gray-700 text-sm mb-6">{message}</p>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} className={`px-4 py-2 rounded-xl text-sm font-semibold transition ${buttonStyles[variant]}`}>
            {buttonLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
