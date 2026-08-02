import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { SavedCard } from '../types'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'
import { apiUrl } from '../lib/apiBase'
import { clearTapToken, getTapToken } from '../lib/tapAuthStorage'
import { formatUserFacingError } from '../lib/formatApiError'
import { preloadZuriPayment, startZuriPayment, type ZuriPaymentInitializePayload } from '../lib/zuriPayment'
import { usePageSeo } from '../lib/seo'

interface TapSession {
  token: string
  orderId: string
  businessId: string
  businessName: string
  logoUrl?: string | null
  bankVerified?: boolean
  amount: number
  items: { name: string; quantity: number; price: number }[]
  expiresAt: string
  tableRef?: string | null
  staffLabel?: string | null
}

function TapPayPage(): JSX.Element {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<TapSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tapUser, setTapUser] = useState<{ id: string; email: string; name?: string } | null>(null)
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [confirmed, setConfirmed] = useState(false)
  const [password, setPassword] = useState('')
  const [charging, setCharging] = useState(false)
  const [paid, setPaid] = useState(false)
  const businessName = session?.businessName?.trim() || 'Tap Payment'

  usePageSeo({
    title: `ZURI | ${businessName}`,
    description: session
      ? `Pay ${session.businessName} securely with Zuri Tap.`
      : 'Complete a secure Zuri Tap payment.',
    path: token ? `/tap/pay/${token}` : '/tap/pay',
    noindex: true,
  })

  useEffect(() => {
    preloadZuriPayment()
  }, [])

  useEffect(() => {
    if (!token) {
      setError('Invalid link')
      setLoading(false)
      return
    }
    axios.get<TapSession>(apiUrl(`/api/tap/session/${token}`))
      .then(res => setSession(res.data))
      .catch(err => {
        setError(formatUserFacingError(err.response?.data, 'Session expired or not found'))
      })
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    const t = getTapToken()
    if (!t) return
    axios.get(apiUrl('/api/tap-auth/me'), { headers: { Authorization: `Bearer ${t}` } })
      .then(res => setTapUser(res.data))
      .catch(() => clearTapToken())
  }, [])

  useEffect(() => {
    if (!tapUser || !session) return
    axios.get<SavedCard[]>(apiUrl(`/api/payment/saved-cards?email=${encodeURIComponent(tapUser.email)}&businessId=${session.businessId}`))
      .then(res => {
        setSavedCards(Array.isArray(res.data) ? res.data : [])
      })
      .catch(() => setSavedCards([]))
  }, [tapUser, session])

  const handlePayWithPassword = async (): Promise<void> => {
    if (!session || !tapUser || !password.trim()) return
    setCharging(true)
    try {
      const t = getTapToken()
      await axios.post(
        apiUrl('/api/tap/charge-with-password'),
        {
          orderId: session.orderId,
          email: tapUser.email,
          password: password.trim(),
          token: session.token
        },
        { headers: t ? { Authorization: `Bearer ${t}` } : {} }
      )
      setPaid(true)
      axios.delete(apiUrl(`/api/tap/session/${session.token}`)).catch(() => {})
    } catch (err) {
      alert(axios.isAxiosError(err) ? formatUserFacingError(err.response?.data, 'Payment failed') : 'Payment failed')
    } finally {
      setCharging(false)
    }
  }

  const handlePayWithNewCard = async (): Promise<void> => {
    if (!session || !tapUser) return
    try {
      const res = await axios.post<ZuriPaymentInitializePayload>(apiUrl('/api/payment/initialize'), {
        email: tapUser.email,
        amount: session.amount,
        orderId: session.orderId,
        businessId: session.businessId,
        saveCard: true,
        tap: true,
        callbackUrl: `${window.location.origin}/payment-done?orderId=${session.orderId}&tap=1`
      })
      await startZuriPayment(
        {
          provider: res.data.provider,
          authorizationUrl: res.data.authorizationUrl,
          accessCode: res.data.accessCode,
          reference: res.data.reference || session.orderId,
          orderId: res.data.orderId || session.orderId,
          checkoutUrl: res.data.checkoutUrl,
          apiKey: res.data.apiKey,
          contractCode: res.data.contractCode,
          amount: res.data.amount ?? session.amount,
          customerEmail: res.data.customerEmail || tapUser.email,
          customerName: res.data.customerName || tapUser.name,
          isTestMode: res.data.isTestMode,
        },
        {
          successPath: `${window.location.origin}/payment-done?reference=${encodeURIComponent(session.orderId)}&tap=1`,
          onError: (msg) => alert(msg || 'Could not start payment'),
        },
      )
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        alert(formatUserFacingError(err.response?.data, 'Could not start payment'))
        return
      }
      alert('Could not start payment')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <PaperPlaneLoader size="md" />
      </div>
    )
  }

  if (error || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#fefbf5]">
        <div className="text-center">
          <p className="text-red-600 font-medium">{error || 'Session not found'}</p>
          <a href="/zuri-tap" className="mt-4 inline-block text-sm text-zuri-orange hover:underline">Back to Zuri Tap</a>
        </div>
      </div>
    )
  }

  if (paid) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#fefbf5]">
        <div className="text-center max-w-sm">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl text-green-700 font-bold">OK</span>
          </div>
          <h1 className="text-xl font-bold text-zuri-black">Payment complete</h1>
          <p className="text-gray-600 mt-2">₦{session.amount.toFixed(2)} paid to {session.businessName}</p>
          <a href="/zuri-tap" className="mt-6 inline-block text-sm font-semibold text-zuri-orange hover:underline">Done</a>
        </div>
      </div>
    )
  }

  if (!tapUser) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#fefbf5]">
        <div className="text-center max-w-sm bg-white rounded-2xl border border-gray-200 p-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            {session.logoUrl ? (
              <img src={session.logoUrl} alt="" className="h-12 w-12 rounded-xl object-cover" />
            ) : null}
            <div className="text-left">
              <p className="font-bold text-zuri-black">{session.businessName}</p>
              <p className="text-zuri-orange font-semibold">₦{session.amount.toFixed(2)}</p>
            </div>
          </div>
          <h1 className="text-xl font-bold text-zuri-black mb-2">Sign in to pay</h1>
          <p className="text-gray-600 text-sm mb-6">Confirm the venue after signing in, then authorize with your Tap password.</p>
          <button
            onClick={() => navigate(`/tap/login?redirect=${encodeURIComponent(`/tap/pay/${token}`)}`)}
            className="w-full bg-zuri-black text-white py-3 rounded-xl font-semibold"
          >
            Sign in to Zuri Tap
          </button>
          <button
            onClick={() => navigate(`/tap/register?redirect=${encodeURIComponent(`/tap/pay/${token}`)}`)}
            className="w-full mt-3 border border-gray-300 text-gray-700 py-3 rounded-xl font-semibold"
          >
            Create Zuri Tap account
          </button>
          <a href="/zuri-tap" className="mt-4 inline-block text-sm text-gray-500 hover:text-zuri-orange">Back</a>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#fefbf5]">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-6">
        {!confirmed ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3 text-center">Confirm before you pay</p>
            <div className="flex items-center gap-3 mb-4">
              {session.logoUrl ? (
                <img src={session.logoUrl} alt="" className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <div className="h-14 w-14 rounded-xl bg-zuri-black text-white flex items-center justify-center text-lg font-bold">
                  {(session.businessName || 'Z').slice(0, 1).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-lg font-bold text-zuri-black">{session.businessName}</p>
                {session.bankVerified && (
                  <p className="text-xs font-semibold text-emerald-700">Verified payout account</p>
                )}
              </div>
            </div>
            <p className="text-3xl font-bold text-zuri-orange">₦{session.amount.toFixed(2)}</p>
            {(session.tableRef || session.staffLabel) && (
              <p className="text-xs text-gray-500 mt-1">
                {[session.tableRef, session.staffLabel].filter(Boolean).join(' · ')}
              </p>
            )}
            {session.items.length > 0 && (
              <ul className="mt-4 text-sm text-gray-600 space-y-1">
                {session.items.map((item, i) => (
                  <li key={i}>{item.quantity}× {item.name} — ₦{item.price.toFixed(2)}</li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setConfirmed(true)}
              className="mt-6 w-full bg-zuri-orange text-white py-3 rounded-xl font-semibold"
            >
              Yes, pay {session.businessName}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => { setConfirmed(false); setPassword('') }}
              className="text-sm text-gray-500 hover:text-zuri-orange mb-3"
            >
              ← Back to confirmation
            </button>
            <h1 className="text-lg font-bold text-zuri-black">Pay ₦{session.amount.toFixed(2)}</h1>
            <p className="text-gray-600 text-sm mt-1">to {session.businessName}</p>

            <div className="mt-6 space-y-3">
              {savedCards.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-500">
                    Saved card ·••• {savedCards[0].last4}
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Zuri Tap password</label>
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Authorize with your password"
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange"
                    />
                  </div>
                  <button
                    onClick={handlePayWithPassword}
                    disabled={charging || !password.trim()}
                    className="w-full bg-zuri-orange text-white py-3 rounded-xl font-semibold disabled:opacity-50"
                  >
                    {charging ? 'Processing…' : `Authorize ₦${session.amount.toFixed(2)}`}
                  </button>
                  <p className="text-xs text-gray-400 text-center">Charge failed? Enter password again to retry.</p>
                </>
              )}
              <button
                onClick={handlePayWithNewCard}
                className="w-full border border-gray-300 text-gray-700 py-3 rounded-xl font-semibold"
              >
                {savedCards.length > 0 ? 'Use different card or transfer' : 'Add card & pay'}
              </button>
            </div>
          </>
        )}

        <p className="text-xs text-gray-400 text-center mt-4">Signed in as {tapUser.email}</p>
      </div>
    </div>
  )
}

export default TapPayPage
