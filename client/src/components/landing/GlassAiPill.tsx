import type { ReactNode } from 'react'

export type GlassAiPillVariant = 'forYou' | 'trending' | 'reorder' | 'pairs' | 'assist' | 'rnr'

/** Default — cards, quick picks, light panel backgrounds */
const variantClass: Record<GlassAiPillVariant, string> = {
  forYou: 'bg-white/80 border-violet-200/80 text-violet-900 shadow-[0_2px_10px_rgba(139,92,246,0.15)]',
  trending: 'bg-white/80 border-orange-200/80 text-orange-950 shadow-[0_2px_10px_rgba(249,115,22,0.15)]',
  reorder: 'bg-white/80 border-neutral-200/85 text-neutral-900 shadow-[0_2px_8px_rgba(0,0,0,0.08)]',
  pairs: 'bg-white/80 border-emerald-200/80 text-emerald-950 shadow-[0_2px_8px_rgba(16,185,129,0.12)]',
  assist: 'bg-white/85 border-zuri-orange/40 text-zuri-black shadow-[0_2px_10px_rgba(255,189,89,0.2)]',
  rnr: 'bg-white/80 border-fuchsia-200/85 text-fuchsia-950 shadow-[0_2px_10px_rgba(192,38,211,0.14)]'
}

/** On menu photos — opaque fills, no blur bleed; readable on any food image */
const variantOnPhoto: Record<GlassAiPillVariant, string> = {
  forYou: 'bg-violet-600 border-violet-500/80 text-white shadow-[0_2px_10px_rgba(0,0,0,0.35)]',
  trending: 'bg-orange-600 border-orange-500/80 text-white shadow-[0_2px_10px_rgba(0,0,0,0.35)]',
  reorder: 'bg-neutral-800 border-neutral-700/80 text-white shadow-[0_2px_10px_rgba(0,0,0,0.35)]',
  pairs: 'bg-emerald-700 border-emerald-600/80 text-white shadow-[0_2px_10px_rgba(0,0,0,0.35)]',
  assist: 'bg-zuri-black border-zuri-orange/50 text-white shadow-[0_2px_10px_rgba(0,0,0,0.35)]',
  rnr: 'bg-fuchsia-700 border-fuchsia-500/85 text-white shadow-[0_2px_10px_rgba(0,0,0,0.35)]'
}

const iconOnPhoto: Record<GlassAiPillVariant, string> = {
  forYou: 'text-violet-100',
  trending: 'text-orange-100',
  reorder: 'text-neutral-200',
  pairs: 'text-emerald-100',
  assist: 'text-zuri-yellow',
  rnr: 'text-fuchsia-100'
}

type Props = {
  variant: GlassAiPillVariant
  children: ReactNode
  className?: string
  /** Sitting on a menu item photo — solid contrast, not frosted glass */
  onPhoto?: boolean
  title?: string
}

export function GlassAiPill({ variant, children, className = '', onPhoto = false, title }: Props): JSX.Element {
  const surface = onPhoto ? variantOnPhoto[variant] : variantClass[variant]
  const blur = onPhoto ? '' : 'backdrop-blur-md'

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-bold leading-tight ${blur} ${surface} ${className}`}
    >
      {children}
    </span>
  )
}

function IconSparkle({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2l1.2 4.2L18 8l-4.8 1.8L12 14l-1.2-4.2L6 8l4.8-1.8L12 2zm0 10l.9 3.1L16 16l-3.1.9L12 20l-.9-3.1L8 16l3.1-.9L12 12z" />
    </svg>
  )
}

function IconFlame({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 22c-3.3 0-6-2.2-6-5.5 0-2.5 1.5-4.2 3-6.2.5 2.2 2 3.8 3 4.8-.2-2.8 1-5.5 3-8.3 2.5 2.8 4 5.5 4 8.2 0 3.3-2.7 6-6 6z" />
    </svg>
  )
}

function IconReorder({ className }: { className?: string }): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v4h4M20 20v-4h-4M5 19a9 9 0 0014.3-3.7M19 5a9 9 0 00-14.3 3.7" />
    </svg>
  )
}

type PillProps = { className?: string; onPhoto?: boolean }

export function ForYouPill({ className, onPhoto }: PillProps): JSX.Element {
  return (
    <GlassAiPill variant="forYou" className={className} onPhoto={onPhoto}>
      <IconSparkle className={`h-3 w-3 shrink-0 ${onPhoto ? iconOnPhoto.forYou : 'text-violet-600'}`} />
      For you
    </GlassAiPill>
  )
}

export function TrendingPill({ className, onPhoto }: PillProps): JSX.Element {
  return (
    <GlassAiPill variant="trending" className={className} onPhoto={onPhoto}>
      <IconFlame className={`h-3 w-3 shrink-0 ${onPhoto ? iconOnPhoto.trending : 'text-orange-600'}`} />
      Trending
    </GlassAiPill>
  )
}

export function ReorderPill({ className, onPhoto }: PillProps): JSX.Element {
  return (
    <GlassAiPill variant="reorder" className={className} onPhoto={onPhoto}>
      <IconReorder className={`h-3 w-3 shrink-0 ${onPhoto ? iconOnPhoto.reorder : 'text-neutral-600'}`} />
      Reorder
    </GlassAiPill>
  )
}

export function PairsWellPill({ className, onPhoto }: PillProps): JSX.Element {
  return (
    <GlassAiPill variant="pairs" className={`uppercase tracking-wide ${className ?? ''}`} onPhoto={onPhoto}>
      Pairs well
    </GlassAiPill>
  )
}

export function CrossVenuePill({
  className,
  onPhoto,
  label = 'From Zuri network'
}: PillProps & { label?: string }): JSX.Element {
  return (
    <GlassAiPill variant="forYou" className={className} onPhoto={onPhoto}>
      <IconSparkle className={`h-3 w-3 shrink-0 ${onPhoto ? iconOnPhoto.forYou : 'text-violet-600'}`} />
      {label}
    </GlassAiPill>
  )
}

/** Guest taste RNR — reinforced “for you” from prior uncertain-session memory */
export function RnrTastePill({
  className,
  onPhoto,
  title
}: PillProps & { title?: string }): JSX.Element {
  return (
    <GlassAiPill variant="rnr" className={`max-w-[min(100%,11rem)] truncate ${className ?? ''}`} onPhoto={onPhoto} title={title}>
      <IconSparkle className={`h-3 w-3 shrink-0 ${onPhoto ? iconOnPhoto.rnr : 'text-fuchsia-600'}`} />
      Taste match
    </GlassAiPill>
  )
}
