export type PendingPaymentKind = 'subscription' | 'order'

const REF_KEY = 'zuri_pending_payment_reference'
const KIND_KEY = 'zuri_pending_payment_kind'

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const ZURI_PAYMENT_REF_RE = /zuri_[a-z0-9_]+/i

/** Monnify may return reference=orderId?paymentReference=zuri_... as one corrupted value. */
export function parseMonnifyReturnRefs(raw: string | null | undefined): {
  orderId: string | null
  paymentReference: string | null
  raw: string
} {
  let s = String(raw || '').trim()
  try {
    s = decodeURIComponent(s)
  } catch {
    /* keep */
  }

  let orderId: string | null = null
  let paymentReference: string | null = null

  const embedded = s.match(/^([^?]+)\?paymentReference=(.+)$/i)
  if (embedded) {
    orderId = embedded[1].trim()
    paymentReference = embedded[2].trim()
  } else {
    const uuid = s.match(UUID_RE)
    if (uuid) orderId = uuid[0]
    const zuri = s.match(ZURI_PAYMENT_REF_RE)
    if (zuri) paymentReference = zuri[0]
    if (!orderId && s.startsWith('sub_')) orderId = s
  }

  if (orderId && !UUID_RE.test(orderId) && !orderId.startsWith('sub_')) {
    const uuid = orderId.match(UUID_RE)
    if (uuid) orderId = uuid[0]
  }

  return { orderId, paymentReference, raw: s }
}

function pickVerifyReference(params: URLSearchParams): string | null {
  const orderId = params.get('orderId')?.trim()
  if (orderId) return orderId

  const paymentReference = params.get('paymentReference')?.trim()
  if (paymentReference) return paymentReference

  for (const key of ['reference', 'trxref', 'ref']) {
    const v = params.get(key)?.trim()
    if (!v) continue
    const parsed = parseMonnifyReturnRefs(v)
    if (parsed.orderId) return parsed.orderId
    if (parsed.paymentReference) return parsed.paymentReference
    return v
  }

  return null
}

export function stashPendingPayment(reference: string, kind: PendingPaymentKind): void {
  if (!reference?.trim()) return
  try {
    sessionStorage.setItem(REF_KEY, reference.trim())
    sessionStorage.setItem(KIND_KEY, kind)
  } catch {
    /* private mode / quota */
  }
}

export function peekPendingPaymentReference(kind?: PendingPaymentKind): string | null {
  try {
    const ref = sessionStorage.getItem(REF_KEY)?.trim()
    if (!ref) return null
    if (kind) {
      const k = sessionStorage.getItem(KIND_KEY) as PendingPaymentKind | null
      if (k && k !== kind) return null
    }
    return ref
  } catch {
    return null
  }
}

export function clearPendingPaymentReference(): void {
  try {
    sessionStorage.removeItem(REF_KEY)
    sessionStorage.removeItem(KIND_KEY)
  } catch {
    /* ignore */
  }
}

/** Read Paystack return params from the current URL (query + hash). */
export function readPaymentReferenceFromLocation(): string | null {
  if (typeof window === 'undefined') return null

  const tryParams = (params: URLSearchParams): string | null => pickVerifyReference(params)

  const fromQuery = tryParams(new URLSearchParams(window.location.search))
  if (fromQuery) return fromQuery

  const hash = window.location.hash.replace(/^#\/?/, '')
  if (hash.includes('=')) {
    const fromHash = tryParams(new URLSearchParams(hash.startsWith('?') ? hash.slice(1) : hash))
    if (fromHash) return fromHash
  }

  return null
}

export function resolvePaymentReference(
  searchParams: URLSearchParams,
  kind: PendingPaymentKind,
): string | null {
  const fromParams = pickVerifyReference(searchParams)
  if (fromParams) return fromParams

  const fromLocation = readPaymentReferenceFromLocation()
  if (fromLocation) return fromLocation

  return peekPendingPaymentReference(kind)
}
