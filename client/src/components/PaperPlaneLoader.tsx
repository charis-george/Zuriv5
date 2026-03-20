import type { JSX } from 'react'

/** Public asset; filename contains a space — keep encoded for reliable loading. */
const ZURI_LOADER_VIDEO = encodeURI('/ZURI Animation.mp4')

type Size = 'sm' | 'md' | 'lg'

const videoMaxHeight: Record<Size, string> = {
  sm: 'max-h-16',
  md: 'max-h-24',
  lg: 'max-h-[min(28vh,160px)]'
}

interface PaperPlaneLoaderProps {
  size?: Size
  label?: string
  className?: string
  /** Use inside cards/toolbars; default is full-hero size */
  compact?: boolean
}

export function PaperPlaneLoader({ size = 'md', label, className = '', compact = false }: PaperPlaneLoaderProps): JSX.Element {
  const h = compact ? 'max-h-20' : videoMaxHeight[size]

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <video
        className={`w-auto ${h} max-w-[min(70vw,240px)] object-contain pointer-events-none`}
        autoPlay
        loop
        muted
        playsInline
        aria-hidden
      >
        <source src={ZURI_LOADER_VIDEO} type="video/mp4" />
      </video>
      {label ? (
        <p className="mt-4 text-white/90 text-sm text-center max-w-xs">{label}</p>
      ) : null}
    </div>
  )
}
