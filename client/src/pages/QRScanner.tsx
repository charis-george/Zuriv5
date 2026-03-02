import { useEffect, useId, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Html5QrcodeScanner } from 'html5-qrcode'

const DEBUG_LOG = (message: string, data: Record<string, unknown>, hypothesisId: string) => {
  // #region agent log
  fetch('http://127.0.0.1:7885/ingest/27cc0656-b460-497f-bc8e-e093f6629dd3', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '0133e9' },
    body: JSON.stringify({
      sessionId: '0133e9',
      location: 'QRScanner.tsx',
      message,
      data: { ...data, hypothesisId },
      timestamp: Date.now()
    })
  }).catch(() => {})
  // #endregion
}

function QRScanner(): JSX.Element {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null)
  const wrapperRef = useRef<HTMLDivElement | null>(null)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mountCountRef = useRef(0)
  const scannerId = `qr-reader-${useId().replace(/:/g, '')}`

  // #region agent log
  DEBUG_LOG('QRScanner render', { scannerId }, 'H2,H5')
  // #endregion

  const navigate = useNavigate()

  useEffect(() => {
    mountCountRef.current += 1
    const runId = mountCountRef.current
    const wrapper = wrapperRef.current
    // #region agent log
    DEBUG_LOG('effect start', {
      scannerId,
      runId,
      wrapperFound: !!wrapper,
      containersWithId: document.querySelectorAll(`[id="${scannerId}"]`).length
    }, 'H1,H2,H5')
    // #endregion
    if (!wrapper) return

    wrapper.innerHTML = ''
    const container = document.createElement('div')
    container.id = scannerId
    containerRef.current = container
    wrapper.appendChild(container)

    const scanner = new Html5QrcodeScanner(
      scannerId,
      {
        qrbox: { width: 250, height: 250 },
        fps: 5,
        aspectRatio: 1.0
      },
      false
    )

    scannerRef.current = scanner

    const onScanSuccess = (decodedText: string): void => {
      console.log('QR Code scanned:', decodedText)
      const businessIdMatch = decodedText.match(/\/order\/([^/]+)/)
      if (businessIdMatch) {
        safeClear()
        navigate(`/order/${businessIdMatch[1]}`)
      } else if (decodedText.includes('business') || decodedText.length === 36) {
        safeClear()
        navigate(`/order/${decodedText}`)
      }
    }

    const onScanFailure = (): void => {}

    function safeClear(): void {
      try {
        scannerRef.current?.clear()
      } catch (e) {
        // #region agent log
        DEBUG_LOG('safeClear threw', { err: String(e), scannerId }, 'H3,H4')
        // #endregion
      }
      scannerRef.current = null
    }

    scanner.render(onScanSuccess, onScanFailure)
    // #region agent log
    DEBUG_LOG('scanner.render() called', { scannerId, runId }, 'H1')
    // #endregion

    return () => {
      const sc = scannerRef.current
      scannerRef.current = null
      // #region agent log
      const el = document.getElementById(scannerId)
      DEBUG_LOG('cleanup start', {
        scannerId,
        runId,
        containerStillInDom: !!el,
        containerChildCount: el ? el.childNodes.length : 0
      }, 'H3,H4')
      // #endregion
      void (async () => {
        const toRemove = containerRef.current
        containerRef.current = null
        if (toRemove?.parentNode) {
          toRemove.parentNode.removeChild(toRemove)
        }
        try {
          await sc?.clear()
        } catch {
          // ignore (container may already be gone)
        }
        // #region agent log
        DEBUG_LOG('cleanup done', { scannerId, runId }, 'H3')
        // #endregion
      })()
    }
  }, [navigate, scannerId])

  return (
    <div className="min-h-screen bg-zuri-light py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-zuri-black mb-2">Scan QR Code</h1>
            <p className="text-gray-600">Point your camera at the QR code on the table</p>
          </div>

          <div ref={wrapperRef} className="mb-4" />

          <div className="text-center mt-6">
            <button
              onClick={() => navigate('/')}
              className="text-zuri-black hover:text-zuri-yellow transition"
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

