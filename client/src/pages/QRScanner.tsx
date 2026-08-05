import type { MutableRefObject } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'
import { organizationJsonLd, usePageSeo } from '../lib/seo'
import { apiUrl } from '../lib/apiBase'
import { getBusinessToken, isBusinessLoggedIn } from '../lib/businessAuthStorage'
import {
  clearScannerSession,
  getScannerBusinessName,
  getTicketVerifyAuthToken,
  isScannerConnected
} from '../lib/scannerAuthStorage'

/**
 * html5-qrcode (mebjas/html5-qrcode): only one active scanner should own a given DOM node.
 * React 18 Strict Mode runs mount → cleanup → mount; overlapping async start() calls can stack
 * video + shader UI. We clear the host element, use a mount-generation guard, and fully
 * dispose (stop + clear) before creating another Html5Qrcode on that node.
 * @see https://github.com/mebjas/html5-qrcode
 */

function parseBusinessIdFromText(text: string): string | null {
  const trimmed = text.trim()
  const fromPath = trimmed.match(/\/order\/([^/?#]+)/i)
  if (fromPath?.[1]) {
    let segment = fromPath[1]
    try {
      segment = decodeURIComponent(segment)
    } catch {
      /* keep raw */
    }
    const cleaned = segment.replace(/[\s\u200B-\u200D\uFEFF]/g, '')
    return cleaned || null
  }
  const cleaned = trimmed.replace(/[\s\u200B-\u200D\uFEFF]/g, '')
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (uuidLike.test(cleaned)) return cleaned
  if (cleaned.length === 36 && cleaned.includes('-')) return cleaned
  return null
}

function parseTicketTokenFromText(text: string): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null
  try {
    const parsed = new URL(trimmed, 'https://zuriqo.com')
    const token = parsed.searchParams.get('ticket')
    return token && token.trim() ? token.trim() : null
  } catch {
    return null
  }
}

type CameraArg = string | { facingMode: string }

async function disposeReader(h: Html5Qrcode | null): Promise<void> {
  if (!h) return
  try {
    await h.stop().catch(() => {})
  } catch {
    /* ignore */
  }
  try {
    h.clear()
  } catch {
    /* ignore */
  }
}

function clearScannerHostElement(elementId: string): void {
  const el = document.getElementById(elementId)
  if (el) el.innerHTML = ''
}

async function startFirstWorkingCamera(
  readerElementId: string,
  onDecoded: (text: string) => void,
  instanceRef: MutableRefObject<Html5Qrcode | null>,
  isStale: () => boolean
): Promise<Html5Qrcode | null> {
  const scanConfig = {
    fps: 10,
    qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
      const edge = Math.min(viewfinderWidth, viewfinderHeight)
      // html5-qrcode only decodes inside its internal scan region (qrbox).
      // Previously the qrbox was intentionally small, which made scanning feel
      // "boundary-alignment strict". Make it much larger so that any QR that
      // is still within the visible camera frame can be detected.
      const side = Math.max(120, Math.floor(edge * 0.95))
      const clamped = Math.min(side, 320)
      return { width: clamped, height: clamped }
    }
  }

  const queue: CameraArg[] = [
    { facingMode: 'environment' },
    { facingMode: 'user' }
  ]
  try {
    const cams = await Html5Qrcode.getCameras()
    if (isStale()) return null
    const seen = new Set<string>()
    for (const c of cams) {
      if (c?.id && !seen.has(c.id)) {
        seen.add(c.id)
        queue.push(c.id)
      }
    }
  } catch {
    /* ignore */
  }

  for (let i = 0; i < queue.length; i++) {
    if (isStale()) return null
    const cam = queue[i]
    let h: Html5Qrcode | null = null
    try {
      h = new Html5Qrcode(readerElementId, { verbose: false })
    } catch {
      await disposeReader(h)
      continue
    }
    try {
      await h.start(cam, scanConfig, onDecoded, () => {})
      if (isStale()) {
        instanceRef.current = null
        await disposeReader(h)
        return null
      }
      instanceRef.current = h
      return h
    } catch {
      await disposeReader(h)
    }
  }
  return null
}

async function decodeQrFromImageFile(fileAnchorId: string, file: File): Promise<string> {
  const reader = new Html5Qrcode(fileAnchorId, { verbose: false })
  try {
    return await reader.scanFile(file, false)
  } finally {
    try {
      reader.clear()
    } catch {
      /* ignore */
    }
  }
}

function QRScanner(): JSX.Element {
  usePageSeo({
    title: 'Scan a ZURI QR Code | Menu and Ticket Verification',
    description: 'Scan a ZURI QR code to open a digital menu or, for logged-in businesses, verify a ticket receipt QR instantly.',
    path: '/scan',
    jsonLd: [
      organizationJsonLd,
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Scan a ZURI QR Code',
        url: 'https://zuriqo.com/scan',
        description: 'Scan ZURI menu QR codes and verify ticket receipt QR codes for paid entry.'
      }
    ]
  })

  const location = useLocation()
  const navigate = useNavigate()
  const readerIdRef = useRef<string | undefined>(undefined)
  if (!readerIdRef.current) {
    readerIdRef.current =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? `zuri-qr-${crypto.randomUUID()}`
        : `zuri-qr-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`
  }
  const readerElementId = readerIdRef.current
  const fileHostElementId = `${readerElementId}-file`

  const mountGenRef = useRef(0)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const handledRef = useRef(false)
  const cancelledRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [scanError, setScanError] = useState<string>('')
  const [cameraBootKey, setCameraBootKey] = useState(0)
  const [fileBusy, setFileBusy] = useState(false)
  const [ticketVerification, setTicketVerification] = useState<{
    status: 'pending' | 'confirmed' | 'used' | 'error'
    title: string
    message: string
    meta?: string
    guestName?: string
    ticketType?: string
  } | null>(null)
  const [businessSignedIn, setBusinessSignedIn] = useState(() => isBusinessLoggedIn())
  const [scannerConnected, setScannerConnected] = useState(() => isScannerConnected())
  const [scannerBusinessName, setScannerBusinessName] = useState(() => getScannerBusinessName() || '')
  const ticketFromQuery = new URLSearchParams(location.search).get('ticket')?.trim() || ''

  useEffect(() => {
    setBusinessSignedIn(isBusinessLoggedIn())
    setScannerConnected(isScannerConnected())
    setScannerBusinessName(getScannerBusinessName() || '')
  }, [location.pathname, location.search])

  const verifyTicketToken = async (token: string): Promise<void> => {
    const authToken = getTicketVerifyAuthToken()
    if (!authToken) {
      setTicketVerification({
        status: 'error',
        title: 'Scanner not connected',
        message: 'Connect this phone with an access code from your organizer, or log in with your full ZURI business account.'
      })
      return
    }

    setTicketVerification({
      status: 'pending',
      title: 'Verifying ticket receipt…',
      message: 'Checking payment status and locking this QR if it is valid.'
    })

    try {
      const res = await fetch(apiUrl('/api/qr/ticket-receipt/verify'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({ token })
      })

      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.success) {
        const amount = Number(data?.order?.totalAmount || 0)
        const guestName = data?.order?.customerName || 'Guest'
        const ticketType = data?.ticket?.typeName || 'Ticket'
        const ticketNumber = data?.ticket?.number
        const ticketLabel =
          ticketNumber != null ? `Ticket ${ticketNumber}` : ticketType
        setTicketVerification({
          status: 'confirmed',
          title: guestName,
          guestName,
          ticketType,
          message: `${ticketLabel} confirmed — ${ticketType}. This QR is now locked and cannot be reused.`,
          meta: `${amount > 0 ? `₦${amount.toFixed(2)}` : 'Paid'}${data?.business?.name ? ` · ${data.business.name}` : ''}`
        })
        return
      }

      if (res.status === 409 && data?.status === 'used') {
        const guestName = data?.order?.customerName || 'Guest'
        const ticketType = data?.ticket?.typeName || 'Ticket'
        setTicketVerification({
          status: 'used',
          title: guestName,
          guestName,
          ticketType,
          message: `${ticketType} — this receipt QR was already scanned and cannot be used again.`,
          meta: data?.order?.scannedAt ? `First confirmed: ${new Date(data.order.scannedAt).toLocaleString()}` : undefined
        })
        return
      }

      setTicketVerification({
        status: 'error',
        title: 'Could not verify ticket',
        message: data?.error || 'This QR is invalid, unpaid, or belongs to another business account.'
      })
    } catch {
      setTicketVerification({
        status: 'error',
        title: 'Verification failed',
        message: 'We could not verify this ticket right now. Check your connection and try again.'
      })
    }
  }

  useEffect(() => {
    if (!ticketFromQuery) {
      setTicketVerification(null)
      return
    }
    void verifyTicketToken(ticketFromQuery)
  }, [ticketFromQuery])

  useLayoutEffect(() => {
    if (ticketFromQuery) {
      clearScannerHostElement(readerElementId)
      return () => {
        cancelledRef.current = true
        mountGenRef.current += 1
      }
    }

    const myGen = ++mountGenRef.current
    const isStale = (): boolean => myGen !== mountGenRef.current

    cancelledRef.current = false
    handledRef.current = false
    scannerRef.current = null
    setScanError('')

    const el = document.getElementById(readerElementId)
    if (!el) {
      setScanError('Scanner could not initialize. Please reload this page.')
      return () => {
        cancelledRef.current = true
        mountGenRef.current += 1
      }
    }

    clearScannerHostElement(readerElementId)

    const onDecoded = (decodedText: string): void => {
      try {
        if (handledRef.current || cancelledRef.current || isStale()) return
        const ticketToken = parseTicketTokenFromText(decodedText)
        if (ticketToken) {
          handledRef.current = true
          const s = scannerRef.current
          const go = (): void => {
            if (!cancelledRef.current && !isStale()) void verifyTicketToken(ticketToken)
          }
          if (s) {
            void s.stop().catch(() => {}).finally(go)
          } else {
            go()
          }
          return
        }
        const id = parseBusinessIdFromText(decodedText)
        if (!id) return
        handledRef.current = true
        const s = scannerRef.current
        const go = (): void => {
          if (!cancelledRef.current && !isStale()) navigate(`/order/${id}`)
        }
        if (s) {
          void s
            .stop()
            .catch(() => {})
            .finally(go)
        } else {
          go()
        }
      } catch {
        /* ignore */
      }
    }

    void (async () => {
      try {
        if (isStale()) return
        const instance = await startFirstWorkingCamera(readerElementId, onDecoded, scannerRef, isStale)
        if (isStale()) {
          scannerRef.current = null
          await disposeReader(instance)
          return
        }
        if (!instance) {
          setScanError(
            'No camera worked. Use HTTPS (or localhost), allow camera access, or upload a photo of the QR code below.'
          )
          return
        }
        scannerRef.current = instance
      } catch {
        if (isStale()) return
        setScanError('Camera could not start. Try uploading a photo of the QR code below.')
      }
    })()

    return () => {
      cancelledRef.current = true
      mountGenRef.current += 1
      const s = scannerRef.current
      scannerRef.current = null
      void disposeReader(s).finally(() => {
        clearScannerHostElement(readerElementId)
      })
    }
  }, [navigate, readerElementId, cameraBootKey, ticketFromQuery])

  const onPickImage = (): void => {
    fileInputRef.current?.click()
  }

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setScanError('')
    setFileBusy(true)
    try {
      const s = scannerRef.current
      scannerRef.current = null
      await disposeReader(s)
      clearScannerHostElement(readerElementId)

      const text = await decodeQrFromImageFile(fileHostElementId, file)
      const ticketToken = parseTicketTokenFromText(text)
      if (ticketToken) {
        await verifyTicketToken(ticketToken)
        return
      }
      const id = parseBusinessIdFromText(text)
      if (id) {
        navigate(`/order/${id}`)
        return
      }
      setScanError('No ZURI menu QR found in that image. Try a clearer photo or use the camera above.')
    } catch {
      setScanError('Could not read that image. Use a PNG or JPG showing the full QR code.')
    } finally {
      setFileBusy(false)
      setCameraBootKey((k) => k + 1)
    }
  }

  return (
    <div className="min-h-screen bg-zuri-light py-8 px-4">
      {/* Dedicated host for html5-qrcode file decoding only (never call .start() here). */}
      <div
        id={fileHostElementId}
        className="fixed w-px h-px overflow-hidden opacity-0 pointer-events-none"
        aria-hidden
      />

      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-zuri-black mb-2">Scan QR Code</h1>
            <p className="text-gray-600 text-sm">
              {ticketFromQuery
                ? 'Checking this ticket receipt for a logged-in business account.'
                : 'Point your camera at a menu QR code or a ticket receipt QR.'}
            </p>
            {businessSignedIn ? (
              <p className="mt-2 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 inline-block">
                Business account signed in — ticket QR codes will verify automatically.
              </p>
            ) : scannerConnected ? (
              <p className="mt-2 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 inline-block">
                Scanner connected{scannerBusinessName ? ` for ${scannerBusinessName}` : ''} — ticket QR codes will verify
                automatically.
              </p>
            ) : (
              <div className="mt-3 text-xs text-gray-600 space-y-1">
                <p>
                  Verifying tickets?{' '}
                  <Link
                    to="/scan/connect"
                    className="font-medium text-zuri-orange hover:underline"
                  >
                    Connect with an access code
                  </Link>{' '}
                  or{' '}
                  <Link
                    to="/business/login?redirect=%2Fscan"
                    className="font-medium text-zuri-orange hover:underline"
                  >
                    log in with your business account
                  </Link>
                  .
                </p>
              </div>
            )}
            {scannerConnected && !businessSignedIn ? (
              <button
                type="button"
                onClick={() => {
                  clearScannerSession()
                  setScannerConnected(false)
                  setScannerBusinessName('')
                }}
                className="mt-2 text-[11px] text-gray-500 hover:text-zuri-black underline"
              >
                Disconnect scanner
              </button>
            ) : null}
          </div>

          {scanError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 text-center">
              <p className="text-sm text-red-700">{scanError}</p>
            </div>
          )}

          {ticketVerification ? (
            <div
              className={`mb-4 rounded-xl px-4 py-4 text-center border ${
                ticketVerification.status === 'confirmed'
                  ? 'border-green-200 bg-green-50/80'
                  : ticketVerification.status === 'used'
                    ? 'border-amber-200 bg-amber-50/80'
                    : ticketVerification.status === 'pending'
                      ? 'border-zuri-orange/30 bg-zuri-orange/5'
                      : 'border-red-200 bg-red-50/80'
              }`}
            >
              <p className="text-sm font-semibold text-zuri-black">{ticketVerification.title}</p>
              {ticketVerification.ticketType ? (
                <p className="text-base font-bold text-zuri-orange mt-1">{ticketVerification.ticketType}</p>
              ) : null}
              <p className="text-sm text-gray-700 mt-1">{ticketVerification.message}</p>
              {ticketVerification.meta ? (
                <p className="text-xs text-gray-500 mt-2">{ticketVerification.meta}</p>
              ) : null}
            </div>
          ) : null}

          {!ticketFromQuery ? (
            <div className="relative mb-4 w-full min-h-[240px] rounded-xl border border-gray-100 overflow-hidden bg-zuri-black/5">
              <div id={readerElementId} className="w-full min-h-[240px]" />
            </div>
          ) : null}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(ev) => void onFileChange(ev)}
          />

          <div className="rounded-xl border border-zuri-orange/25 bg-zuri-light/80 p-4">
            <p className="text-xs font-medium text-zuri-black mb-2">Or upload a photo of the QR code</p>
            <button
              type="button"
              disabled={fileBusy}
              onClick={onPickImage}
              className="w-full sm:w-auto px-4 py-2 rounded-lg text-sm font-medium border-2 border-zuri-orange text-zuri-orange bg-transparent hover:border-zuri-orange-dark hover:text-zuri-orange-dark transition-colors disabled:opacity-50"
            >
              {fileBusy ? 'Reading image…' : 'Choose image'}
            </button>
            <p className="text-[11px] text-zuri-black/50 mt-2">PNG or JPG — include the full code in frame.</p>
          </div>

          {ticketVerification ? (
            <div className="text-center mt-4">
              <button
                type="button"
                onClick={() => {
                  if (ticketFromQuery) {
                    navigate('/scan')
                    return
                  }
                  handledRef.current = false
                  setTicketVerification(null)
                  setScanError('')
                  setCameraBootKey((k) => k + 1)
                }}
                className="text-sm font-medium text-zuri-orange hover:text-zuri-orange-dark transition"
              >
                Verify another QR
              </button>
            </div>
          ) : null}

          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="text-sm text-zuri-black hover:text-zuri-orange transition"
            >
              ← Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default QRScanner
