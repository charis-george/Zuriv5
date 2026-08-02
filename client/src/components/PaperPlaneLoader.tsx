import { useEffect, useRef, type JSX } from 'react'

/** Compact H.264 loop (~11KB) — much lighter than the original 1440² MP4. */
const ZURI_LOADER_MP4 = '/zuri-loader.mp4'

type Size = 'sm' | 'md' | 'lg'

const sizePx: Record<Size, number> = {
  sm: 48,
  md: 72,
  lg: 120,
}

interface PaperPlaneLoaderProps {
  size?: Size
  label?: string
  className?: string
  compact?: boolean
}

/**
 * Centered ZURI loading animation only.
 * Decodes a tiny MP4 and paints frames to canvas so Safari never shows a play button.
 * No alternate / pulse logo fallback.
 */
export function PaperPlaneLoader({
  size = 'md',
  label,
  className = '',
  compact = false,
}: PaperPlaneLoaderProps): JSX.Element {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const px = compact ? 56 : sizePx[size]

  useEffect(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas) return

    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    let raf = 0
    let alive = true
    let retryTimer: ReturnType<typeof setTimeout> | null = null

    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.loop = true
    video.controls = false
    video.disablePictureInPicture = true
    video.setAttribute('playsinline', '')
    video.setAttribute('webkit-playsinline', '')
    video.setAttribute('muted', '')
    video.removeAttribute('controls')

    const paint = (): void => {
      if (!alive) return
      if (video.readyState >= 2 && video.videoWidth > 0) {
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth
          canvas.height = video.videoHeight
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      }
      raf = requestAnimationFrame(paint)
    }

    const tryPlay = (): void => {
      if (!alive) return
      const playResult = video.play()
      if (playResult && typeof playResult.then === 'function') {
        playResult
          .then(() => {
            if (alive) paint()
          })
          .catch(() => {
            if (!alive) return
            retryTimer = setTimeout(tryPlay, 350)
          })
      } else {
        paint()
      }
    }

    tryPlay()
    video.addEventListener('loadeddata', tryPlay)
    video.addEventListener('canplay', tryPlay)

    return () => {
      alive = false
      cancelAnimationFrame(raf)
      if (retryTimer) clearTimeout(retryTimer)
      video.removeEventListener('loadeddata', tryPlay)
      video.removeEventListener('canplay', tryPlay)
      try {
        video.pause()
      } catch {
        /* ignore */
      }
    }
  }, [])

  return (
    <div
      className={`relative flex flex-col items-center justify-center ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label || 'Loading'}
    >
      <video
        ref={videoRef}
        className="zuri-loader-video-source"
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        controls={false}
        tabIndex={-1}
        aria-hidden
      >
        <source src={ZURI_LOADER_MP4} type="video/mp4" />
      </video>

      <canvas
        ref={canvasRef}
        className="zuri-loader-canvas"
        style={{ width: px, height: px, maxWidth: 'min(70vw, 240px)' }}
        aria-hidden
      />

      {label ? (
        <p className="mt-4 text-white/90 text-sm text-center max-w-xs">{label}</p>
      ) : null}
    </div>
  )
}
