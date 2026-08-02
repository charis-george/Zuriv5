import type { ReactNode } from 'react'

type Props = {
  pageTitle: string
  url: string
  children: ReactNode
}

/** Browser chrome for the customizer live preview (tab title + URL). */
export function StorefrontPreviewChrome({ pageTitle, url, children }: Props): JSX.Element {
  return (
    <div className="flex flex-col min-h-full bg-white">
      <div className="shrink-0 border-b border-gray-200 bg-[#f3f4f6] px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-1.5 mb-2.5" aria-hidden>
          <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f57]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#febc2e]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[#28c840]" />
        </div>
        <div
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 shadow-sm"
          title={pageTitle}
        >
          <img src="/ZURI.png" alt="" className="h-3.5 w-auto shrink-0 opacity-90" decoding="async" />
          <span className="text-[11px] font-semibold text-zuri-black truncate">{pageTitle}</span>
        </div>
        <p className="text-[10px] text-gray-500 mt-1.5 truncate font-mono" title={url}>
          {url}
        </p>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
