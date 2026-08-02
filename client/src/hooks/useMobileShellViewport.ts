import { useEffect, useRef, type RefObject } from 'react'

const ROOT_CLASS = 'mobile-dashboard-active'

/** Full layout height — never shrink when the on-screen keyboard opens. */
function syncLayoutHeight(): void {
  document.documentElement.style.setProperty('--layout-height', `${window.innerHeight}px`)
}

function isKeyboardLikelyOpen(): boolean {
  const vv = window.visualViewport
  if (!vv) return false
  return vv.height < window.innerHeight * 0.82
}

/** Locks mobile dashboard layout; bottom nav stays at the physical screen bottom. */
export function useMobileShellViewport(mainRef: RefObject<HTMLElement | null>): void {
  const layoutHeightRef = useRef(0)

  useEffect(() => {
    if (typeof window === 'undefined') return

    document.documentElement.classList.add(ROOT_CLASS)
    syncLayoutHeight()
    layoutHeightRef.current = window.innerHeight

    const onLayoutChange = (): void => {
      syncLayoutHeight()
      layoutHeightRef.current = window.innerHeight
    }

    const onVisualViewportChange = (): void => {
      if (isKeyboardLikelyOpen()) {
        const active = document.activeElement
        const main = mainRef.current
        if (active instanceof HTMLElement && main?.contains(active)) {
          window.requestAnimationFrame(() => {
            active.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
          })
        }
        return
      }
      onLayoutChange()
    }

    const onFocusOut = (event: FocusEvent): void => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (!target.matches('input, textarea, select')) return
      window.setTimeout(onLayoutChange, 150)
    }

    const viewport = window.visualViewport
    viewport?.addEventListener('resize', onVisualViewportChange)
    window.addEventListener('resize', onLayoutChange)
    window.addEventListener('orientationchange', onLayoutChange)
    document.addEventListener('focusout', onFocusOut)

    return () => {
      document.documentElement.classList.remove(ROOT_CLASS)
      document.documentElement.style.removeProperty('--layout-height')
      viewport?.removeEventListener('resize', onVisualViewportChange)
      window.removeEventListener('resize', onLayoutChange)
      window.removeEventListener('orientationchange', onLayoutChange)
      document.removeEventListener('focusout', onFocusOut)
    }
  }, [mainRef])
}
