import type { JSX } from 'react'

type Size = 'sm' | 'md' | 'lg'

const sizeClasses: Record<Size, string> = {
  sm: 'space-x-1',
  md: 'space-x-1.5',
  lg: 'space-x-2',
}

interface PaperPlaneLoaderProps {
  size?: Size
  label?: string
  className?: string
}

export function PaperPlaneLoader({ size = 'md', label, className = '' }: PaperPlaneLoaderProps): JSX.Element {
  const spacing = sizeClasses[size]
  const dotSize =
    size === 'sm' ? 'w-1.5 h-1.5' :
    size === 'lg' ? 'w-2.5 h-2.5' :
    'w-2 h-2'

  return (
    <div className={`flex flex-col items-center justify-center ${className}`}>
      <div className={`flex items-center ${spacing}`}>
        {[0, 1, 2].map((i) => (
          <span
            // eslint-disable-next-line react/no-array-index-key
            key={i}
            className={`${dotSize} rounded-full bg-zuri-orange animate-bounce`}
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      {label && (
        <p className="mt-3 text-zuri-black text-sm">{label}</p>
      )}
    </div>
  )
}
