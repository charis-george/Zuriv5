import type { MutableRefObject } from 'react'
import { useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Html5Qrcode } from 'html5-qrcode'

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
  if (fromPath?.[1]) return fromPath[1]
  const uuidLike = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  if (uuidLike.test(trimmed)) return trimmed
  if (trimmed.length === 36 && trimmed.includes('-')) return trimmed
  return null
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
      const side = Math.max(80, Math.floor(Math.min(250, edge * 0.72)))
      return { width: side, height: side }
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

  useLayoutEffect(() => {
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
  }, [navigate, readerElementId, cameraBootKey])

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
            <p className="text-gray-600 text-sm">Point your camera at the QR code on the table</p>
          </div>

          {scanError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 text-center">
              <p className="text-sm text-red-700">{scanError}</p>
            </div>
          )}

          <div className="relative mb-4 w-full min-h-[240px] rounded-xl border border-gray-100 overflow-hidden bg-zuri-black/5">
            <div id={readerElementId} className="w-full min-h-[240px]" />
          </div>

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
