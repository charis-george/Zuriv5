/** Turn axios response.data (any JSON shape) into a user-visible string. */
export function formatApiErrorBody(data: unknown): string {
  if (data == null) return ''
  if (typeof data === 'string') {
    const t = data.trim()
    return t.length > 500 ? `${t.slice(0, 500)}…` : t
  }
  if (typeof data !== 'object') return String(data)

  const o = data as Record<string, unknown>
  const keys = Object.keys(o)
  if (keys.length === 0) return ''

  if (typeof o.message === 'string' && o.message.trim()) return o.message.trim()

  const err = o.error
  if (typeof err === 'string' && err.trim()) return err.trim()
  if (err != null && typeof err === 'object') {
    const inner = err as Record<string, unknown>
    if (typeof inner.message === 'string' && inner.message.trim()) return inner.message.trim()
    if (typeof inner.error === 'string' && inner.error.trim()) return inner.error.trim()
    if (typeof inner.details === 'string' && inner.details.trim()) return inner.details.trim()
  }

  if (Array.isArray(o.errors) && o.errors.length > 0) {
    const first = o.errors[0]
    if (typeof first === 'string') return first
    if (first && typeof first === 'object') {
      const fe = first as Record<string, unknown>
      if (typeof fe.message === 'string') return fe.message
    }
  }

  try {
    const s = JSON.stringify(o)
    return s.length > 400 ? `${s.slice(0, 400)}…` : s
  } catch {
    return 'Something went wrong. Please try again.'
  }
}
