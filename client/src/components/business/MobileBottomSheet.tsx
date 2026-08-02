import { useRef, useState, type ReactNode } from 'react'

type MobileBottomSheetProps = {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  headerRight?: ReactNode
  children: ReactNode
}

const DISMISS_DRAG_PX = 72

export function MobileBottomSheet({
  open,
  onClose,
  title,
  subtitle,
  headerRight,
  children
}: MobileBottomSheetProps): JSX.Element | null {
  const dragStartY = useRef(0)
  const dragOffset = useRef(0)
  const [translateY, setTranslateY] = useState(0)
  const [dragging, setDragging] = useState(false)

  if (!open) return null

  const onTouchStart = (e: React.TouchEvent): void => {
    dragStartY.current = e.touches[0]?.clientY ?? 0
    dragOffset.current = 0
    setDragging(true)
  }

  const onTouchMove = (e: React.TouchEvent): void => {
    if (!dragging) return
    const dy = (e.touches[0]?.clientY ?? dragStartY.current) - dragStartY.current
    dragOffset.current = Math.max(0, dy)
    setTranslateY(dragOffset.current)
  }

  const finishDrag = (): void => {
    setDragging(false)
    if (dragOffset.current >= DISMISS_DRAG_PX) onClose()
    dragOffset.current = 0
    setTranslateY(0)
  }

  return (
    <>
      <button type="button" className="mobile-sheet-backdrop" aria-label="Close" onClick={onClose} />
      <div
        className="mobile-sheet-panel"
        style={{
          transform: translateY > 0 ? `translateY(${translateY}px)` : undefined,
          transition: dragging ? 'none' : 'transform 0.22s ease-out'
        }}
      >
        <div
          className="mobile-sheet-grabber-hit"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={finishDrag}
          onTouchCancel={finishDrag}
        >
          <div className="mobile-sheet-grabber" aria-hidden />
        </div>
        <div className="mobile-sheet-header">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-zuri-black truncate">{title}</h2>
            {subtitle ? <p className="text-sm text-gray-500 truncate mt-0.5">{subtitle}</p> : null}
          </div>
          {headerRight ?? (
            <button type="button" onClick={onClose} className="dashboard-btn text-sm text-gray-500 shrink-0 px-2 py-1">
              Close
            </button>
          )}
        </div>
        <div className="mobile-sheet-body">{children}</div>
      </div>
    </>
  )
}
