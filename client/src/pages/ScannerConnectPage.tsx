import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { apiUrl } from '../lib/apiBase'
import { organizationJsonLd, usePageSeo } from '../lib/seo'
import {
  clearScannerSession,
  getScannerBusinessName,
  isScannerConnected,
  setScannerSession
} from '../lib/scannerAuthStorage'
import { isBusinessLoggedIn } from '../lib/businessAuthStorage'

const CODE_LENGTH = 6

function normalizeCodeInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH)
}

function ScannerConnectPage(): JSX.Element {
  usePageSeo({
    title: 'Connect Ticket Scanner | ZURI',
    description: 'Enter your ZURI scanner access code to verify ticket receipts from your phone — no full dashboard login required.',
    path: '/scan/connect',
    jsonLd: [
      organizationJsonLd,
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Connect ZURI Ticket Scanner',
        url: 'https://zuriqo.com/scan/connect',
        description: 'Pair a phone for ticket scanning using a ZURI access code.'
      }
    ]
  })

  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [code, setCode] = useState(() => normalizeCodeInput(searchParams.get('code') || ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [connected, setConnected] = useState(() => isScannerConnected())
  const [businessName, setBusinessName] = useState(() => getScannerBusinessName() || '')

  useEffect(() => {
    const fromQuery = searchParams.get('code')
    if (fromQuery) setCode(normalizeCodeInput(fromQuery))
  }, [searchParams])

  const onConnect = async (e?: React.FormEvent): Promise<void> => {
    e?.preventDefault()
    setError('')
    const normalized = normalizeCodeInput(code)
    if (normalized.length !== CODE_LENGTH) {
      setError(`Enter the full ${CODE_LENGTH}-character access code from your organizer.`)
      return
    }

    setBusy(true)
    try {
      const res = await fetch(apiUrl('/api/qr/scanner-codes/redeem'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normalized })
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.token) {
        setError(data?.error || 'Invalid or revoked access code.')
        return
      }
      setScannerSession(data.token, data.businessId, data.businessName || 'Business')
      setConnected(true)
      setBusinessName(data.businessName || 'Business')
      navigate('/scan', { replace: true })
    } catch {
      setError('Could not connect right now. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  const onDisconnect = (): void => {
    clearScannerSession()
    setConnected(false)
    setBusinessName('')
    setCode('')
  }

  return (
    <div className="min-h-screen bg-zuri-light py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-semibold text-zuri-black mb-2">Ticket scanner</h1>
            <p className="text-gray-600 text-sm">
              Enter the access code from your organizer to scan ticket receipts on this phone — without full dashboard
              access.
            </p>
          </div>

          {isBusinessLoggedIn() ? (
            <div className="mb-4 rounded-xl border border-green-200 bg-green-50/80 px-4 py-3 text-sm text-green-800">
              You&apos;re logged into the full business account. You can{' '}
              <Link to="/scan" className="font-semibold text-zuri-orange hover:underline">
                go straight to scan
              </Link>
              .
            </div>
          ) : null}

          {connected ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-green-200 bg-green-50/80 px-4 py-4 text-center">
                <p className="text-sm font-semibold text-zuri-black">Scanner connected</p>
                <p className="text-sm text-gray-700 mt-1">
                  This phone can verify tickets for <strong>{businessName || 'your venue'}</strong>.
                </p>
                <p className="text-xs text-gray-500 mt-2">Scanner-only — no orders, menu, or payout access.</p>
              </div>
              <Link
                to="/scan"
                className="block w-full text-center bg-zuri-orange text-white py-3 rounded-xl font-semibold hover:bg-zuri-orange-dark transition"
              >
                Open scanner
              </Link>
              <button
                type="button"
                onClick={onDisconnect}
                className="block w-full text-center text-sm text-gray-600 hover:text-zuri-black transition"
              >
                Disconnect this phone
              </button>
            </div>
          ) : (
            <form onSubmit={(e) => void onConnect(e)} className="space-y-4">
              <div>
                <label htmlFor="scanner-code" className="block text-sm font-semibold text-zuri-black mb-2">
                  Access code
                </label>
                <input
                  id="scanner-code"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  maxLength={CODE_LENGTH}
                  value={code}
                  onChange={(e) => setCode(normalizeCodeInput(e.target.value))}
                  placeholder="ABC123"
                  className="w-full text-center text-2xl font-mono tracking-[0.35em] uppercase px-4 py-4 border-2 border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-zuri-orange"
                />
                <p className="text-xs text-gray-500 mt-2 text-center">
                  {CODE_LENGTH} characters · from your ZURI dashboard
                </p>
              </div>

              {error ? (
                <div className="rounded-xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-700 text-center">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={busy || code.length !== CODE_LENGTH}
                className="w-full bg-zuri-orange text-white py-3 rounded-xl font-semibold hover:bg-zuri-orange-dark transition disabled:opacity-50"
              >
                {busy ? 'Connecting…' : 'Connect scanner'}
              </button>
            </form>
          )}

          <div className="text-center mt-6 space-y-2">
            <Link to="/scan" className="block text-sm text-zuri-orange hover:text-zuri-orange-dark transition">
              Back to scan page
            </Link>
            <Link to="/" className="block text-sm text-gray-500 hover:text-zuri-black transition">
              ← Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ScannerConnectPage
