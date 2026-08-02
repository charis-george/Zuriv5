import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import io, { Socket } from 'socket.io-client'
import { SavedCard } from '../types'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'
import { API_BASE_URL, apiUrl } from '../lib/apiBase'
import { clearTapToken, getTapToken } from '../lib/tapAuthStorage'
import { formatUserFacingError } from '../lib/formatApiError'
import { organizationJsonLd, usePageSeo } from '../lib/seo'
import { preloadZuriPayment, startZuriPayment, type ZuriPaymentInitializePayload } from '../lib/zuriPayment'

const WS_URL =
  (import.meta.env.VITE_WS_URL as string) ||
  API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : (typeof window !== 'undefined' ? window.location.origin : ''))

interface TapVenuePreview {
  code: string
  businessId: string
  businessName: string
  logoUrl: string | null
  address: string | null
  bankVerified: boolean
  expiresAt: string
  staffLabel?: string | null
  staffCodeId?: string | null
}

interface TapRequest {
  orderId: string
  businessId: string
  businessName: string
  logoUrl?: string | null
  bankVerified?: boolean
  amount: number
  items: { name: string; quantity: number; price: number }[]
  token?: string
  expiresAt?: string
  tableRef?: string | null
  staffLabel?: string | null
}

function formatCountdown(expiresAt?: string): string | null {
  if (!expiresAt) return null
  const ms = new Date(expiresAt).getTime() - Date.now()
  if (ms <= 0) return 'Expired'
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function TapWaitPage(): JSX.Element {
  const [tapUser, setTapUser] = useState<{ id: string; email: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [lookupLoading, setLookupLoading] = useState(false)
  const [venuePreview, setVenuePreview] = useState<TapVenuePreview | null>(null)
  const [joined, setJoined] = useState(false)
  const [joinedVenue, setJoinedVenue] = useState<TapVenuePreview | null>(null)
  const [request, setRequest] = useState<TapRequest | null>(null)
  const [confirmStep, setConfirmStep] = useState(false)
  const [passwordStep, setPasswordStep] = useState(false)
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [password, setPassword] = useState('')
  const [paying, setPaying] = useState(false)
  const [paystackLoading, setPaystackLoading] = useState(false)
  const [paid, setPaid] = useState(false)
  const [paidAmount, setPaidAmount] = useState<number | null>(null)
  const [paidBusiness, setPaidBusiness] = useState<string | null>(null)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [countdown, setCountdown] = useState<string | null>(null)
  const socketRef = useRef<Socket | null>(null)
  const businessName = request?.businessName?.trim() || joinedVenue?.businessName || 'Zuri Tap'

  usePageSeo({
    title: `ZURI | ${businessName}`,
    description: request
      ? `Pay ${request.businessName} securely with Zuri Tap.`
      : 'Enter a Zuri Tap business code to receive a payment request and complete payment from your saved card.',
    path: '/tap',
    jsonLd: [
      organizationJsonLd,
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Zuri Tap Payment Code',
        url: 'https://zuriqo.com/tap',
        description: 'Customer page for entering a Zuri Tap business payment code.'
      }
    ]
  })
  const navigate = useNavigate()

  useEffect(() => {
    preloadZuriPayment()
  }, [])

  useEffect(() => {
    const token = getTapToken()
    if (!token) {
      navigate('/tap/login?redirect=' + encodeURIComponent('/tap'))
      return
    }
    axios.get(apiUrl('/api/tap-auth/me'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => setTapUser(res.data))
      .catch(() => {
        clearTapToken()
        navigate('/tap/login?redirect=' + encodeURIComponent('/tap'))
      })
      .finally(() => setLoading(false))
  }, [navigate])

  useEffect(() => {
    if (!request?.expiresAt) {
      setCountdown(null)
      return
    }
    const tick = () => {
      const label = formatCountdown(request.expiresAt)
      setCountdown(label)
      if (label === 'Expired') {
        setRequest(null)
        setConfirmStep(false)
        setPasswordStep(false)
        setPassword('')
      }
    }
    tick()
    const id = window.setInterval(tick, 1000)
    return () => window.clearInterval(id)
  }, [request?.expiresAt, request?.orderId])

  const lookupCode = async (): Promise<void> => {
    const c = code.trim().toUpperCase()
    if (!c || c.length !== 6) {
      setRoomError('Enter the 6-character code from the business')
      return
    }
    setRoomError(null)
    setLookupLoading(true)
    try {
      const { data } = await axios.get<TapVenuePreview>(apiUrl(`/api/tap/lookup/${c}`))
      setVenuePreview(data)
    } catch (err) {
      setVenuePreview(null)
      setRoomError(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Invalid or expired Tap code')
          : 'Invalid or expired Tap code'
      )
    } finally {
      setLookupLoading(false)
    }
  }

  const joinRoom = (): void => {
    if (!venuePreview) return
    const c = venuePreview.code
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }

    const socket = io(WS_URL)
    socketRef.current = socket
    setJoined(true)
    setJoinedVenue(venuePreview)
    setRequest(null)
    setConfirmStep(false)
    setPasswordStep(false)
    setRoomError(null)

    socket.on('tap-request', (data: TapRequest) => {
      setRequest({
        ...data,
        logoUrl: data.logoUrl ?? venuePreview.logoUrl,
        bankVerified: data.bankVerified ?? venuePreview.bankVerified
      })
      setConfirmStep(false)
      setPasswordStep(false)
      setPassword('')
      setSavedCards([])
      setPaid(false)
    })
    socket.on('tap-request-cancelled', (data: { orderId?: string }) => {
      setRequest((prev) => {
        if (!prev) return null
        if (data?.orderId && data.orderId !== prev.orderId) return prev
        return null
      })
      setConfirmStep(false)
      setPasswordStep(false)
      setPassword('')
    })
    socket.on('tap-room-error', (data: { error?: string }) => {
      setRoomError(data?.error || 'Could not join Tap room')
      setJoined(false)
      setJoinedVenue(null)
      socket.disconnect()
      socketRef.current = null
    })
    socket.on('connect', () => {
      socket.emit('join-tap-room', c)
    })
    socket.emit('join-tap-room', c)
  }

  useEffect(() => {
    if (!request || !tapUser) return
    axios.get<SavedCard[]>(apiUrl(`/api/payment/saved-cards?email=${encodeURIComponent(tapUser.email)}&businessId=${request.businessId}`))
      .then(res => setSavedCards(Array.isArray(res.data) ? res.data : []))
      .catch(() => setSavedCards([]))
  }, [request, tapUser])

  const leaveRoom = (): void => {
    if (socketRef.current) {
      socketRef.current.emit('leave-tap-room', code.trim().toUpperCase())
      socketRef.current.disconnect()
      socketRef.current = null
    }
    setJoined(false)
    setJoinedVenue(null)
    setVenuePreview(null)
    setRequest(null)
    setConfirmStep(false)
    setPasswordStep(false)
    setCode('')
  }

  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect()
        socketRef.current = null
      }
    }
  }, [])

  const handleDecline = async (): Promise<void> => {
    if (!request) return
    const token = getTapToken()
    try {
      await axios.post(
        apiUrl('/api/tap/decline'),
        { orderId: request.orderId, token: request.token },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      )
    } catch {
      /* local clear even if network fails */
    }
    setRequest(null)
    setConfirmStep(false)
    setPasswordStep(false)
    setPassword('')
  }

  const handlePay = async (): Promise<void> => {
    if (!request || !tapUser || !password.trim()) return
    setPaying(true)
    try {
      const token = getTapToken()
      await axios.post(apiUrl('/api/tap/charge-with-password'), {
        orderId: request.orderId,
        email: tapUser.email,
        password: password.trim(),
        token: request.token
      }, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      setPaidAmount(request.amount)
      setPaidBusiness(request.businessName)
      setPaid(true)
      setRequest(null)
      setPassword('')
      setConfirmStep(false)
      setPasswordStep(false)
    } catch (err) {
      alert(axios.isAxiosError(err) ? formatUserFacingError(err.response?.data, 'Payment failed') : 'Payment failed')
    } finally {
      setPaying(false)
    }
  }

  const handlePayWithPaystack = async (): Promise<void> => {
    if (!request || !tapUser) return
    setPaystackLoading(true)
    try {
      const { data } = await axios.post<ZuriPaymentInitializePayload>(apiUrl('/api/payment/initialize'), {
        email: tapUser.email,
        amount: request.amount,
        orderId: request.orderId,
        businessId: request.businessId,
        saveCard: true,
        tap: true,
        callbackUrl: `${window.location.origin}/payment-done?orderId=${request.orderId}&tap=1`
      })
      await startZuriPayment(
        {
          provider: data.provider,
          authorizationUrl: data.authorizationUrl,
          accessCode: data.accessCode,
          reference: data.reference || request.orderId,
          orderId: data.orderId || request.orderId,
          checkoutUrl: data.checkoutUrl,
          apiKey: data.apiKey,
          contractCode: data.contractCode,
          amount: data.amount ?? request.amount,
          customerEmail: data.customerEmail || tapUser.email,
          customerName: data.customerName,
          isTestMode: data.isTestMode,
        },
        {
          successPath: `${window.location.origin}/payment-done?reference=${encodeURIComponent(request.orderId)}&tap=1`,
          onError: (msg) => alert(msg || 'Could not start payment'),
        },
      )
    } catch (err) {
      alert(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Could not start payment')
          : 'Could not start payment'
      )
    } finally {
      setPaystackLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <PaperPlaneLoader size="md" />
      </div>
    )
  }

  if (!tapUser) return <></>

  const displayLogo = request?.logoUrl || joinedVenue?.logoUrl
  const displayVerified = request?.bankVerified ?? joinedVenue?.bankVerified

  return (
    <div className="min-h-screen bg-[#fefbf5] p-4">
      <header className="max-w-md mx-auto mb-6">
        <a href="/zuri-tap" className="text-sm text-gray-500 hover:text-zuri-orange">← Zuri Tap</a>
        <h1 className="text-xl font-bold text-zuri-black mt-2">Zuri Tap</h1>
        <p className="text-sm text-gray-600 mt-1">Confirm the venue, then approve each payment request before entering your password.</p>
      </header>

      <div className="max-w-md mx-auto space-y-6">
        {!joined ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <label className="block text-sm font-semibold text-zuri-black mb-2">Room code</label>
            <p className="text-xs text-gray-500 mb-2">Enter the staff member&apos;s 6-character Tap code (not a shared venue PIN).</p>
            <input
              type="text"
              value={code}
              onChange={e => {
                setCode(e.target.value.toUpperCase().slice(0, 6))
                setVenuePreview(null)
                setRoomError(null)
              }}
              placeholder="e.g. 4A2B9K"
              maxLength={6}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-zuri-orange"
            />
            {roomError && <p className="mt-2 text-sm text-red-600">{roomError}</p>}

            {!venuePreview ? (
              <button
                type="button"
                onClick={lookupCode}
                disabled={lookupLoading || code.trim().length !== 6}
                className="mt-4 w-full bg-zuri-black text-white py-3 rounded-xl font-semibold disabled:opacity-50"
              >
                {lookupLoading ? 'Checking…' : 'Look up venue'}
              </button>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-gray-100 bg-[#faf7f2] p-4">
                  <div className="flex items-center gap-3">
                    {venuePreview.logoUrl ? (
                      <img src={venuePreview.logoUrl} alt="" className="h-14 w-14 rounded-xl object-cover bg-white" />
                    ) : (
                      <div className="h-14 w-14 rounded-xl bg-zuri-black/90 text-white flex items-center justify-center text-lg font-bold">
                        {(venuePreview.businessName || 'Z').slice(0, 1).toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="font-bold text-zuri-black truncate">{venuePreview.businessName}</p>
                      {venuePreview.staffLabel && (
                        <p className="text-sm text-gray-700">Staff: {venuePreview.staffLabel}</p>
                      )}
                      {venuePreview.address && (
                        <p className="text-xs text-gray-500 truncate">{venuePreview.address}</p>
                      )}
                      {venuePreview.bankVerified ? (
                        <p className="text-xs font-semibold text-emerald-700 mt-1">Verified payout account</p>
                      ) : (
                        <p className="text-xs font-semibold text-amber-700 mt-1">Unverified venue</p>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-3">
                    Only continue if this is the venue you are paying. Wrong code = wrong recipient.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setVenuePreview(null); setCode('') }}
                    className="flex-1 py-3 border border-gray-200 rounded-xl font-semibold text-gray-700"
                  >
                    Wrong venue
                  </button>
                  <button
                    type="button"
                    onClick={joinRoom}
                    className="flex-1 py-3 bg-zuri-orange text-white rounded-xl font-semibold"
                  >
                    Confirm & join
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  {joinedVenue?.logoUrl ? (
                    <img src={joinedVenue.logoUrl} alt="" className="h-10 w-10 rounded-lg object-cover" />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-zuri-black text-white flex items-center justify-center text-sm font-bold">
                      {(joinedVenue?.businessName || 'Z').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-zuri-black truncate">{joinedVenue?.businessName}</p>
                    <p className="text-xs text-gray-500">
                      {joinedVenue?.staffLabel ? `${joinedVenue.staffLabel} · ` : ''}
                      Room <strong className="font-mono">{joinedVenue?.code || code}</strong>
                    </p>
                  </div>
                </div>
                <button type="button" onClick={leaveRoom} className="text-sm text-zuri-orange font-semibold shrink-0">Leave</button>
              </div>
            </div>

            {paid && !request ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm text-center">
                <p className="font-semibold text-green-800">Payment complete</p>
                <p className="text-sm text-green-700 mt-1">
                  ₦{(paidAmount ?? 0).toFixed(2)} paid to {paidBusiness}
                </p>
                <button
                  type="button"
                  onClick={() => setPaid(false)}
                  className="mt-3 text-sm font-semibold text-zuri-orange"
                >
                  Wait for next request
                </button>
              </div>
            ) : !request ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm text-center">
                <div className="w-16 h-16 rounded-full bg-zuri-orange/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl font-bold text-zuri-orange">…</span>
                </div>
                <p className="text-zuri-black font-semibold">Waiting for payment request</p>
                <p className="text-sm text-gray-500 mt-2">Keep this screen open. When {joinedVenue?.businessName || 'the business'} sends a request, confirm the amount here.</p>
              </div>
            ) : !confirmStep ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">Confirm before you pay</p>
                <div className="flex items-center gap-3 mb-4">
                  {displayLogo ? (
                    <img src={displayLogo} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  ) : (
                    <div className="h-14 w-14 rounded-xl bg-zuri-black text-white flex items-center justify-center text-lg font-bold">
                      {(request.businessName || 'Z').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <p className="text-lg font-bold text-zuri-black">{request.businessName}</p>
                    {displayVerified && (
                      <p className="text-xs font-semibold text-emerald-700">Verified payout account</p>
                    )}
                    {(request.tableRef || request.staffLabel) && (
                      <p className="text-xs text-gray-500 mt-0.5">
                        {[request.tableRef, request.staffLabel].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
                <p className="text-3xl font-bold text-zuri-orange">₦{request.amount.toFixed(2)}</p>
                {countdown && (
                  <p className={`text-xs mt-1 ${countdown === 'Expired' ? 'text-red-600' : 'text-gray-500'}`}>
                    Request expires in {countdown}
                  </p>
                )}
                {request.items.length > 0 && (
                  <ul className="mt-3 text-sm text-gray-600 space-y-1">
                    {request.items.map((item, i) => (
                      <li key={i}>{item.quantity}× {item.name} — ₦{item.price.toFixed(2)}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-6 flex gap-2">
                  <button
                    type="button"
                    onClick={handleDecline}
                    className="flex-1 py-3 border border-gray-200 rounded-xl font-semibold text-gray-700"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmStep(true)}
                    className="flex-1 py-3 bg-zuri-orange text-white rounded-xl font-semibold"
                  >
                    Yes, pay {request.businessName.split(' ')[0]}
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <button
                  type="button"
                  onClick={() => { setConfirmStep(false); setPasswordStep(false); setPassword('') }}
                  className="text-sm text-gray-500 hover:text-zuri-orange mb-3"
                >
                  ← Back to confirmation
                </button>
                <h2 className="text-lg font-bold text-zuri-black mb-1">Pay ₦{request.amount.toFixed(2)}</h2>
                <p className="text-sm text-gray-600 mb-4">to {request.businessName}</p>

                <div className="space-y-4">
                  {savedCards.length > 0 && (
                    <>
                      {!passwordStep ? (
                        <button
                          type="button"
                          onClick={() => setPasswordStep(true)}
                          className="w-full py-3 bg-zuri-orange text-white rounded-xl font-semibold"
                        >
                          Pay with saved card
                        </button>
                      ) : (
                        <>
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">Zuri Tap password</label>
                            <input
                              type="password"
                              value={password}
                              onChange={e => setPassword(e.target.value)}
                              placeholder="Enter your password to authorize"
                              autoFocus
                              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handlePay}
                            disabled={paying || !password.trim()}
                            className="w-full py-2.5 bg-zuri-orange text-white rounded-xl font-semibold disabled:opacity-50"
                          >
                            {paying ? 'Paying…' : 'Authorize payment'}
                          </button>
                          <p className="text-xs text-gray-400 text-center">Failed charge? Fix and tap authorize again — no new request needed.</p>
                        </>
                      )}
                      <p className="text-xs text-gray-400 text-center">or</p>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={handlePayWithPaystack}
                    disabled={paystackLoading}
                    className="w-full py-2.5 border-2 border-zuri-black text-zuri-black rounded-xl font-semibold disabled:opacity-50"
                  >
                    {paystackLoading ? 'Opening…' : savedCards.length > 0 ? 'Pay with card or transfer (new)' : 'Pay with card or transfer'}
                  </button>
                  <button
                    type="button"
                    onClick={handleDecline}
                    className="w-full py-2 text-sm font-semibold text-gray-500"
                  >
                    Decline request
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default TapWaitPage
