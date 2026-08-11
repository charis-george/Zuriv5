import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react'
import axios from 'axios'
import { formatUserFacingError } from '../../lib/formatApiError'
import { getBusinessToken } from '../../lib/businessAuthStorage'
import {
  ZURIQO_CHIPS,
  ZURIQO_TIER_META,
  type ZuriQoChip,
  type ZuriQoGuide,
  type ZuriQoTier
} from '../../lib/zuriQoAiPrompts'

export type ZuriQoProposedAction = {
  id: string
  label: string
  description: string
  actionType: string
  payload: Record<string, unknown>
}

export type ZuriQoAgentStep = {
  label: string
  status: 'done' | 'running' | 'pending' | 'needs_review'
}

export type ZuriQoMessage = {
  id: string
  role: 'user' | 'assistant'
  text: string
  tier?: ZuriQoTier
  draft?: {
    kind?: 'message' | 'catalog_item'
    title: string
    body: string
    item?: { name: string; description?: string; price?: number; categoryName?: string | null }
  }
  proposedAction?: ZuriQoProposedAction
  agentRun?: {
    id: string
    name: string
    steps: ZuriQoAgentStep[]
    summary: string
  }
  guide?: ZuriQoGuide
  confirmed?: boolean
}

type AiDailyQuota = {
  used: number
  limit: number | null
  remaining: number | null
  unlimited: boolean
}

type ConfirmResult = {
  message?: string
  refreshMenu?: boolean
  refreshBusiness?: boolean
  refreshTap?: boolean
  businessMode?: string
  tapEnabled?: boolean
  tapExpiresAt?: string | null
  tapCode?: string | null
}

type ZuriQoAiChatBarProps = {
  open: boolean
  onClose: () => void
  businessId: string
  isPhone?: boolean
  /** @deprecated ZuriQO is available on all plans; kept for call-site compatibility. */
  canUseAi?: boolean
  onUpgradeClick?: () => void
  businessMode?: string
  onCatalogPublished?: () => void
  onGuideNavigate?: (destination: string) => void
  onBusinessModeChanged?: (mode: string) => void
  onTapRefreshed?: (info?: { tapEnabled?: boolean; tapExpiresAt?: string | null; tapCode?: string | null }) => void
}


const BTN = 'dashboard-btn'

/** Light inline markdown: **bold**, *italic*, line breaks */
function ChatRichText({ text, className = '' }: { text: string; className?: string }): JSX.Element {
  const nodes: ReactNode[] = []
  const lines = String(text || '').split('\n')
  lines.forEach((line, li) => {
    if (li > 0) nodes.push(<br key={`br_${li}`} />)
    const parts = line.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g)
    parts.forEach((part, pi) => {
      if (!part) return
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        nodes.push(
          <strong key={`${li}_${pi}`} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        )
        return
      }
      if (part.startsWith('*') && part.endsWith('*') && part.length > 2 && !part.startsWith('**')) {
        nodes.push(
          <em key={`${li}_${pi}`} className="italic">
            {part.slice(1, -1)}
          </em>
        )
        return
      }
      nodes.push(<span key={`${li}_${pi}`}>{part}</span>)
    })
  })
  return <div className={className}>{nodes}</div>
}

function authHeaders() {
  const token = getBusinessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

function ChipIcon({ name }: { name: ZuriQoChip['icon'] }) {
  const common = {
    width: 14,
    height: 14,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  }
  if (name === 'orders') {
    return (
      <svg {...common}>
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
      </svg>
    )
  }
  if (name === 'chart') {
    return (
      <svg {...common}>
        <path d="M3 3v18h18" />
        <path d="M7 14v4" />
        <path d="M12 10v8" />
        <path d="M17 6v12" />
      </svg>
    )
  }
  if (name === 'stock') {
    return (
      <svg {...common}>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      </svg>
    )
  }
  if (name === 'draft') {
    return (
      <svg {...common}>
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
      </svg>
    )
  }
  if (name === 'action') {
    return (
      <svg {...common}>
        <path d="M5 12h14" />
        <path d="m12 5 7 7-7 7" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.9 4.9 1.4 1.4" />
      <path d="m17.7 17.7 1.4 1.4" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
    </svg>
  )
}

function stepDotClass(status: ZuriQoAgentStep['status']): string {
  if (status === 'done') return 'bg-emerald-500'
  if (status === 'needs_review') return 'bg-amber-500'
  if (status === 'running') return 'bg-zuri-orange animate-pulse'
  return 'bg-gray-300'
}

export function ZuriQoAiChatBar({
  open,
  onClose,
  businessId,
  isPhone = false,
  canUseAi = true,
  onUpgradeClick,
  businessMode,
  onCatalogPublished,
  onGuideNavigate,
  onBusinessModeChanged,
  onTapRefreshed
}: ZuriQoAiChatBarProps): JSX.Element | null {
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ZuriQoMessage[]>([])
  const [tierFilter, setTierFilter] = useState<ZuriQoTier | 'all'>('all')
  const [expanded, setExpanded] = useState(true)
  const [quota, setQuota] = useState<AiDailyQuota | null>(null)
  const [quotaExhausted, setQuotaExhausted] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const chips = ZURIQO_CHIPS.filter((c) => {
    if (tierFilter !== 'all' && c.tier !== tierFilter) return false
    // Keep mode-switch chips visible even when not currently on that mode
    if (c.id.startsWith('switch-')) return true
    if (businessMode !== 'ticketing' && /check.?in/i.test(c.prompt)) return false
    return true
  }).slice(0, tierFilter === 'all' ? 8 : 10)

  const applyQuota = (q: AiDailyQuota | undefined | null) => {
    if (!q) return
    setQuota(q)
    setQuotaExhausted(!q.unlimited && typeof q.remaining === 'number' && q.remaining <= 0)
  }

  useEffect(() => {
    if (!open || !businessId) return
    let cancelled = false
    void (async () => {
      try {
        const { data } = await axios.get<{ daily?: AiDailyQuota }>('/api/ai/quota', {
          headers: authHeaders()
        })
        if (!cancelled) applyQuota(data?.daily ?? null)
      } catch {
        /* non-blocking */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, businessId])

  useEffect(() => {
    if (!open || isPhone) return
    const t = window.setTimeout(() => inputRef.current?.focus(), 80)
    return () => window.clearTimeout(t)
  }, [open, isPhone])

  useEffect(() => {
    if (!open || !isPhone) {
      document.documentElement.style.removeProperty('--zuriqo-mobile-pad')
      return
    }
    document.documentElement.style.setProperty('--zuriqo-mobile-pad', expanded ? '14rem' : '5.5rem')
    return () => {
      document.documentElement.style.removeProperty('--zuriqo-mobile-pad')
    }
  }, [open, isPhone, expanded])

  useEffect(() => {
    if (!open) return
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, open, loading])

  useEffect(() => {
    if (!open) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  const pushAssistant = (msg: Omit<ZuriQoMessage, 'id' | 'role'>) => {
    setMessages((prev) => [
      ...prev,
      { id: `a_${Date.now()}_${Math.random().toString(16).slice(2)}`, role: 'assistant', ...msg }
    ])
  }

  const send = async (raw: string, preferredTier?: ZuriQoTier[]) => {
    const text = raw.trim()
    if (!text || loading) return
    if (!canUseAi) {
      pushAssistant({
        text: 'ZuriQO is temporarily unavailable. Please try again shortly.'
      })
      return
    }
    if (quotaExhausted) {
      pushAssistant({
        text: 'You’ve used today’s AI credits. Upgrade for a higher daily limit — or come back after midnight UTC.'
      })
      return
    }

    setInput('')
    setExpanded(true)
    const history = [...messages, { role: 'user' as const, text }].slice(-8).map((m) => ({
      role: m.role,
      text: m.text
    }))
    setMessages((prev) => [
      ...prev,
      { id: `u_${Date.now()}_${Math.random().toString(16).slice(2)}`, role: 'user', text }
    ])
    setLoading(true)
    try {
      const { data } = await axios.post(
        '/api/ai/chat',
        { businessId, message: text, preferredTier, history },
        { headers: authHeaders() }
      )
      applyQuota((data as { quota?: AiDailyQuota }).quota ?? null)
      pushAssistant({
        text: String(data.reply || 'Done.'),
        tier: data.tier,
        draft: data.draft,
        proposedAction: data.proposedAction,
        agentRun: data.agentRun,
        guide: data.guide
      })
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: { quota?: AiDailyQuota; error?: string } } }
      if (ax.response?.data?.quota) applyQuota(ax.response.data.quota)
      if (ax.response?.status === 429) setQuotaExhausted(true)
      pushAssistant({
        text: formatUserFacingError(ax.response?.data, 'ZuriQO couldn’t answer. Please try again.')
      })
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void send(input, tierFilter === 'all' ? undefined : [tierFilter])
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send(input, tierFilter === 'all' ? undefined : [tierFilter])
    }
  }

  const confirmAction = async (msgId: string, action: ZuriQoProposedAction) => {
    if (confirmingId) return
    setConfirmingId(msgId)
    try {
      const { data } = await axios.post<ConfirmResult>(
        '/api/ai/chat/confirm',
        {
          businessId,
          actionType: action.actionType,
          payload: action.payload
        },
        { headers: authHeaders() }
      )
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, confirmed: true } : m))
      )
      pushAssistant({ text: String(data?.message || 'Change applied.'), tier: 3 })
      if (
        data?.refreshMenu ||
        action.actionType === 'create_catalog_item' ||
        action.actionType === 'create_item_draft'
      ) {
        onCatalogPublished?.()
      }
      if (data?.refreshBusiness || action.actionType === 'switch_business_mode') {
        const mode =
          data?.businessMode ||
          (typeof action.payload?.businessMode === 'string' ? action.payload.businessMode : undefined)
        if (mode) onBusinessModeChanged?.(mode)
        else onCatalogPublished?.()
      }
      if (
        data?.refreshTap ||
        action.actionType === 'tap_room_on' ||
        action.actionType === 'tap_room_off' ||
        action.actionType === 'tap_room_extend'
      ) {
        onTapRefreshed?.({
          tapEnabled: data?.tapEnabled,
          tapExpiresAt: data?.tapExpiresAt,
          tapCode: data?.tapCode
        })
        onGuideNavigate?.('tap')
      }
      if (action.actionType === 'switch_business_mode') {
        onGuideNavigate?.('menu')
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: unknown } }
      pushAssistant({
        text: formatUserFacingError(ax.response?.data, 'Could not apply that change.'),
        tier: 3
      })
    } finally {
      setConfirmingId(null)
    }
  }

  const bottomPad = isPhone
    ? 'bottom-[calc(var(--mobile-nav-h,4.25rem)+0.5rem+env(safe-area-inset-bottom,0px))]'
    : 'bottom-6'

  const showTranscript = expanded && (isPhone || messages.length > 0 || loading || quotaExhausted)

  return (
    <div
      className={`fixed inset-x-0 z-[60] pointer-events-none flex justify-center px-2 sm:px-3 ${bottomPad}`}
      role="dialog"
      aria-label="ZuriQO AI"
    >
      <div className={`pointer-events-auto w-full flex flex-col items-stretch gap-2 ${isPhone ? 'max-w-full' : 'max-w-2xl'}`}>
        {showTranscript ? (
          <div
            className={`rounded-2xl border border-gray-200/90 bg-white/95 backdrop-blur-md shadow-[0_12px_40px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col ${
              isPhone ? 'max-h-[min(58dvh,440px)]' : 'max-h-[min(52vh,420px)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 border-b border-gray-100">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zuri-black truncate">ZuriQO</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {quota?.unlimited
                    ? 'Unlimited AI credits today'
                    : quota
                      ? `${quota.remaining ?? 0} of ${quota.limit ?? '—'} AI credits left today`
                      : 'Ask · draft · confirm · agents'}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {messages.length > 0 ? (
                  <button
                    type="button"
                    className={`${BTN} text-[11px] font-semibold text-gray-500 min-h-9 px-2.5 rounded-lg hover:bg-gray-50`}
                    onClick={() => setMessages([])}
                  >
                    Clear
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`${BTN} text-[11px] font-semibold text-gray-500 min-h-9 px-2.5 rounded-lg hover:bg-gray-50`}
                  onClick={() => setExpanded(false)}
                  aria-label="Minimize conversation"
                >
                  Hide
                </button>
                <button
                  type="button"
                  className={`${BTN} flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-50`}
                  onClick={onClose}
                  aria-label="Close ZuriQO"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6 6 18" />
                    <path d="m6 6 12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div ref={listRef} className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4 py-3 space-y-3">
              {messages.length === 0 && !loading && !quotaExhausted ? (
                <div className="rounded-xl bg-gray-50 border border-gray-100 px-3 py-3 text-sm text-zuri-black">
                  <p className="font-semibold">Ask ZuriQO anything about your business</p>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    Orders, catalog drafts, availability, and Assist — tap a chip or type below. Close anytime with ✕.
                  </p>
                </div>
              ) : null}
              {quotaExhausted ? (
                <div className="rounded-xl bg-zuri-orange/10 border border-zuri-orange/25 px-3 py-3 text-sm text-zuri-black">
                  <p className="font-semibold">Daily AI limit reached</p>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    You’ve used today’s ZuriQO credits. Upgrade for a higher daily allowance, or come back after midnight
                    UTC.
                  </p>
                  {onUpgradeClick ? (
                    <button
                      type="button"
                      onClick={onUpgradeClick}
                      className={`${BTN} mt-3 inline-flex min-h-10 rounded-xl bg-zuri-orange text-white text-xs font-semibold px-3 py-2`}
                    >
                      Upgrade plan
                    </button>
                  ) : null}
                </div>
              ) : null}
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`text-sm leading-relaxed ${
                    m.role === 'user' ? 'text-right' : 'text-left'
                  }`}
                >
                  <div
                    className={`inline-block max-w-[92%] rounded-2xl px-3.5 py-2.5 whitespace-pre-wrap ${
                      m.role === 'user'
                        ? 'bg-zuri-black text-white rounded-br-md'
                        : 'bg-gray-50 text-zuri-black border border-gray-100 rounded-bl-md'
                    }`}
                  >
                    {m.tier && m.role === 'assistant' ? (
                      <span className="inline-flex mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zuri-orange">
                        Tier {m.tier} · {ZURIQO_TIER_META[m.tier].label}
                      </span>
                    ) : null}
                    <ChatRichText text={m.text} />
                    {m.draft ? (
                      <div className="mt-2 rounded-xl bg-white border border-gray-200 px-3 py-2 text-left">
                        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                          {m.draft.kind === 'catalog_item' ? 'Catalog draft' : m.draft.title}
                        </p>
                        {m.draft.kind === 'catalog_item' && m.draft.item ? (
                          <div className="mt-1 space-y-0.5">
                            <p className="text-sm font-semibold text-zuri-black">{m.draft.item.name}</p>
                            {m.draft.item.description ? (
                              <p className="text-xs text-gray-700 whitespace-pre-wrap">{m.draft.item.description}</p>
                            ) : null}
                            <p className="text-xs text-gray-600">
                              ₦{Number(m.draft.item.price || 0).toLocaleString()}
                              {m.draft.item.categoryName ? ` · ${m.draft.item.categoryName}` : ''}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-800 mt-1 whitespace-pre-wrap">{m.draft.body}</p>
                        )}
                        {m.draft.kind === 'catalog_item' && m.proposedAction && !m.confirmed ? (
                          <button
                            type="button"
                            disabled={confirmingId === m.id}
                            onClick={() => void confirmAction(m.id, m.proposedAction!)}
                            className={`${BTN} mt-2 w-full rounded-lg bg-zuri-orange text-white text-xs font-semibold px-3 py-2 disabled:opacity-60`}
                          >
                            {confirmingId === m.id ? 'Publishing…' : 'Publish to catalog'}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {m.proposedAction && !m.confirmed && m.draft?.kind !== 'catalog_item' ? (
                      <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left">
                        <p className="text-xs font-semibold text-amber-950">{m.proposedAction.label}</p>
                        <p className="text-[11px] text-amber-900/80 mt-0.5">{m.proposedAction.description}</p>
                        <div className="mt-2 flex gap-2">
                          <button
                            type="button"
                            disabled={confirmingId === m.id}
                            onClick={() => void confirmAction(m.id, m.proposedAction!)}
                            className={`${BTN} rounded-lg bg-zuri-orange text-white text-xs font-semibold px-3 py-1.5 disabled:opacity-60`}
                          >
                            {confirmingId === m.id
                              ? 'Applying…'
                              : m.proposedAction.actionType === 'create_catalog_item'
                                ? 'Publish'
                                : m.proposedAction.actionType === 'switch_business_mode'
                                  ? 'Switch mode'
                                  : m.proposedAction.actionType.startsWith('tap_room_')
                                    ? 'Confirm Tap'
                                    : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setMessages((prev) =>
                                prev.map((x) =>
                                  x.id === m.id ? { ...x, proposedAction: undefined, confirmed: true } : x
                                )
                              )
                            }
                            className={`${BTN} rounded-lg border border-gray-200 bg-white text-xs font-semibold px-3 py-1.5`}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {m.confirmed && m.proposedAction ? (
                      <p className="mt-1.5 text-[11px] text-emerald-700 font-medium">Confirmed</p>
                    ) : null}
                    {m.agentRun ? (
                      <div className="mt-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-left">
                        <p className="text-xs font-semibold text-zuri-black">{m.agentRun.name}</p>
                        <ul className="mt-2 space-y-1.5">
                          {m.agentRun.steps.map((s, i) => (
                            <li key={`${m.agentRun!.id}_${i}`} className="flex items-start gap-2 text-[11px] text-gray-700">
                              <span className={`mt-1 h-1.5 w-1.5 rounded-full shrink-0 ${stepDotClass(s.status)}`} />
                              <span>
                                {s.label}
                                {s.status === 'needs_review' ? (
                                  <span className="text-amber-700 font-semibold"> · review</span>
                                ) : null}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <p className="text-[11px] text-gray-600 mt-2 leading-relaxed">{m.agentRun.summary}</p>
                      </div>
                    ) : null}
                    {m.guide ? (
                      <div className="mt-2 rounded-xl border border-zuri-orange/25 bg-orange-50/80 px-3 py-2.5 text-left">
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-zuri-orange">Live guide</p>
                        <p className="text-sm font-semibold text-zuri-black mt-0.5">{m.guide.title}</p>
                        {m.guide.steps?.length ? (
                          <ol className="mt-2 space-y-1 list-decimal list-inside text-[11px] text-gray-800">
                            {m.guide.steps.map((step, i) => (
                              <li key={`${m.id}_g_${i}`}>{step}</li>
                            ))}
                          </ol>
                        ) : null}
                        {m.guide.tip ? (
                          <p className="mt-2 text-[11px] text-gray-600 leading-relaxed">
                            <span className="font-semibold text-zuri-black">Idea · </span>
                            {m.guide.tip}
                          </p>
                        ) : null}
                        {onGuideNavigate ? (
                          <button
                            type="button"
                            onClick={() => onGuideNavigate(m.guide!.destination)}
                            className={`${BTN} mt-2.5 w-full rounded-lg bg-zuri-black text-white text-xs font-semibold px-3 py-2`}
                          >
                            Take me there
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {loading ? (
                <p className="text-xs text-zuri-orange font-semibold animate-pulse">ZuriQO is working…</p>
              ) : null}
            </div>
          </div>
        ) : null}

        {expanded ? (
          <div className={`flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none px-0.5 ${isPhone ? 'touch-pan-x' : ''}`}>
            {([1, 2, 3, 4] as ZuriQoTier[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTierFilter((cur) => (cur === t ? 'all' : t))}
                className={`${BTN} shrink-0 rounded-full min-h-8 px-3 py-1.5 text-[10px] font-semibold border ${
                  tierFilter === t
                    ? 'bg-zuri-orange text-white border-zuri-orange'
                    : 'bg-white/90 text-gray-600 border-gray-200'
                }`}
              >
                T{t} {ZURIQO_TIER_META[t].label}
              </button>
            ))}
          </div>
        ) : null}

        {expanded ? (
          <div className={`flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none ${isPhone ? 'touch-pan-x' : ''}`}>
            {chips.map((chip) => (
              <button
                key={chip.id}
                type="button"
                disabled={loading}
                onClick={() => void send(chip.prompt, [chip.tier])}
                className={`${BTN} shrink-0 inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white/95 min-h-9 px-3 py-2 text-[11px] font-semibold text-gray-700 shadow-sm hover:border-zuri-orange/40 disabled:opacity-50`}
              >
                <span className="text-zuri-orange">
                  <ChipIcon name={chip.icon} />
                </span>
                {chip.label}
              </button>
            ))}
          </div>
        ) : null}

        <form
          onSubmit={onSubmit}
          className={`flex items-center gap-1.5 sm:gap-2 border border-gray-200/90 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.12)] ${
            isPhone ? 'rounded-2xl pl-2 pr-1.5 py-1.5' : 'rounded-full pl-3 pr-1.5 py-1.5'
          }`}
        >
          <button
            type="button"
            onClick={onClose}
            className={`${BTN} flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-50`}
            aria-label="Close ZuriQO"
            title="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          {!expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className={`${BTN} text-[11px] font-semibold text-zuri-orange px-1 shrink-0`}
            >
              Show
            </button>
          ) : null}
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => setExpanded(true)}
            placeholder="Ask ZuriQO…"
            disabled={loading}
            className="flex-1 min-w-0 bg-transparent text-sm text-zuri-black placeholder:text-gray-400 focus:outline-none py-2"
            aria-label="Ask ZuriQO"
            autoComplete="off"
            enterKeyHint="send"
          />
          <button
            type="submit"
            disabled={loading || !input.trim() || quotaExhausted}
            className={`${BTN} flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zuri-orange text-white disabled:opacity-40`}
            aria-label="Send"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="m5 12 7-7 7 7" />
              <path d="M12 19V5" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  )
}

/** Compact sparkles button for dashboard chrome */
export function ZuriQoSummonButton({
  onClick,
  active,
  className = ''
}: {
  onClick: () => void
  active?: boolean
  className?: string
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center justify-center w-10 h-10 rounded-full border transition focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 overflow-hidden ${BTN} ${
        active
          ? 'bg-zuri-orange/15 border-zuri-orange ring-2 ring-zuri-orange/30'
          : 'bg-white border-gray-200 hover:bg-gray-50'
      } ${className}`}
      aria-label={active ? 'Close ZuriQO AI' : 'Open ZuriQO AI'}
      title="ZuriQO AI"
    >
      <img src="/zuri-logo.png" alt="" className="h-7 w-7 object-contain" />
    </button>
  )
}
