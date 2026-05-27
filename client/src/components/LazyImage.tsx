import { useEffect, useRef, useState } from 'react'

type Props = {
  src: string
  alt: string
  className?: string
  /** Load when within this margin of the viewport (default: 280px below) */
  rootMargin?: string
  /** Above-the-fold / LCP — load immediately */
  eager?: boolean
  width?: number
  height?: number
}

/**
 * Defers setting `src` until the image is near the viewport so large marketing PNGs
 * do not all download on first paint.
 */
export function LazyImage({
  src,
  alt,
  className = '',
  rootMargin = '280px 0px',
  eager = false,
  width,
  height
}: Props): JSX.Element {
  const ref = useRef<HTMLImageElement>(null)
  const [activeSrc, setActiveSrc] = useState<string | null>(eager ? src : null)

  useEffect(() => {
    if (eager) {
      setActiveSrc(src)
      return
    }
    const el = ref.current
    if (!el) return

    if (typeof IntersectionObserver === 'undefined') {
      setActiveSrc(src)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setActiveSrc(src)
          observer.disconnect()
        }
      },
      { rootMargin, threshold: 0.01 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [src, eager, rootMargin])

  return (
    <img
      ref={ref}
      src={activeSrc ?? undefined}
      alt={alt}
      width={width}
      height={height}
      className={className}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      fetchPriority={eager ? 'high' : 'auto'}
    />
  )
}
