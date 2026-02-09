import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Html5QrcodeScanner } from 'html5-qrcode'

function QRScanner(): JSX.Element {
  const scannerRef = useRef<Html5QrcodeScanner | null>(null)

  const navigate = useNavigate()

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      {
        qrbox: {
          width: 250,
          height: 250
        },
        fps: 5,
        aspectRatio: 1.0
      },
      false
    )

    scannerRef.current = scanner

    const onScanSuccess = (decodedText: string): void => {
      console.log('QR Code scanned:', decodedText)
      
      // Extract business ID from URL
      const businessIdMatch = decodedText.match(/\/order\/([^\/]+)/)
      if (businessIdMatch) {
        const businessId = businessIdMatch[1]
        scanner.clear()
        navigate(`/order/${businessId}`)
      } else if (decodedText.includes('business') || decodedText.length === 36) {
        // Assume it's a business ID directly
        scanner.clear()
        navigate(`/order/${decodedText}`)
      }
    }

    const onScanFailure = (): void => {
      // Ignore continuous scan errors
    }

    scanner.render(onScanSuccess, onScanFailure)

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear()
      }
    }
  }, [navigate])

  return (
    <div className="min-h-screen bg-zuri-light py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-6">
            <h1 className="text-3xl font-bold text-zuri-black mb-2">Scan QR Code</h1>
            <p className="text-gray-600">Point your camera at the QR code on the table</p>
          </div>

          <div id="qr-reader" className="mb-4"></div>

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

