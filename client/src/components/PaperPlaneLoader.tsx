import { useEffect, useRef, useState, type JSX } from 'react'

/** Public asset; filename contains a space — keep encoded for reliable loading. */
const ZURI_LOADER_VIDEO = encodeURI('/ZURI Animation.mp4')

type Size = 'sm' | 'md' | 'lg'

const sizePx: Record<Size, number> = {
  sm: 48,
  md: 72,
  lg: 120
}

interface PaperPlaneLoaderProps {
  size?: Size
  label?: string
  className?: string
  /** Use inside cards/toolbars; default is full-hero size */
  compact?: boolean
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return ios
}

/** CSS-only loader — no native video controls on iOS Safari. */
function LogoPulseLoader({ px, className }: { px: number; className?: string }): JSX.Element {
  return (
    <div
      className={`zuri-loader-logo ${className ?? ''}`}
      style={{ width: px, height: px }}
      aria-hidden
    >
      <img src="/ZURI.png" alt="" width={px} height={px} className="zuri-loader-logo__img" draggable={false} />
    </div>
  )
}

export function PaperPlaneLoader({ size = 'md', label, className = '', compact = false }: PaperPlaneLoaderProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [useLogoLoader, setUseLogoLoader] = useState(() => isIosSafari())
  const px = compact ? 56 : sizePx[size]

  useEffect(() => {
    if (useLogoLoader) return
    const video = videoRef.current
    if (!video) return

    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.setAttribute('x-webkit-airplay', 'deny')
    video.controls = false
    video.removeAttribute('controls')

    const tryPlay = (): void => {
      const p = video.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => setUseLogoLoader(true))
      }
    }

    tryPlay()
    video.addEventListener('loadeddata', tryPlay)
    return () => video.removeEventListener('loadeddata', tryPlay)
  }, [useLogoLoader])

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      {useLogoLoader ? (
        <LogoPulseLoader px={px} />
      ) : (
        <video
          ref={videoRef}
          className="zuri-loader-video"
          style={{ width: px, height: px, maxWidth: 'min(70vw, 240px)' }}
          autoPlay
          loop
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          controls={false}
          aria-hidden
        >
          <source src={ZURI_LOADER_VIDEO} type="video/mp4" />
        </video>
      )}
      {label ? (
        <p className="mt-4 text-white/90 text-sm text-center max-w-xs">{label}</p>
      ) : null}
    </div>
  )
}
