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
import { preloadPaystackInline, startZuriPayment } from '../lib/paystackZuri'

const WS_URL =
  (import.meta.env.VITE_WS_URL as string) ||
  API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : (typeof window !== 'undefined' ? window.location.origin : ''))

interface TapRequest {
  orderId: string
  businessId: string
  businessName: string
  amount: number
  items: { name: string; quantity: number; price: number }[]
}

function TapWaitPage(): JSX.Element {
  const [tapUser, setTapUser] = useState<{ id: string; email: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [code, setCode] = useState('')
  const [joined, setJoined] = useState(false)
  const [request, setRequest] = useState<TapRequest | null>(null)
  const [opened, setOpened] = useState(false)
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [password, setPassword] = useState('')
  const [paying, setPaying] = useState(false)
  const [paystackLoading, setPaystackLoading] = useState(false)
  const [paid, setPaid] = useState(false)
  const socketRef = useRef<Socket | null>(null)
  const businessName = request?.businessName?.trim() || 'Zuri Tap'

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
    preloadPaystackInline()
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

  const joinRoom = (): void => {
    const c = code.trim().toUpperCase()
    if (!c || c.length !== 6) {
      alert('Enter the 6-character code from the business')
      return
    }
    // Ensure we don't accidentally keep multiple sockets/listeners.
    if (socketRef.current) {
      socketRef.current.disconnect()
      socketRef.current = null
    }

    const socket = io(WS_URL)
    socketRef.current = socket
    setJoined(true)
    setRequest(null)
    // Attach the listener before joining, so we don't miss a fast server emit.
    socket.on('tap-request', (data: TapRequest) => {
      setRequest(data)
      setOpened(false)
      setPassword('')
      setSavedCards([])
    })
    // Re-join after reconnects (common in production networks).
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
    setRequest(null)
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

  const handlePay = async (): Promise<void> => {
    if (!request || !tapUser || !password.trim()) return
    setPaying(true)
    try {
      const token = getTapToken()
      await axios.post(apiUrl('/api/tap/charge-with-password'), {
        orderId: request.orderId,
        email: tapUser.email,
        password: password.trim()
      }, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      setPaid(true)
      setRequest(null)
      setPassword('')
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
      const { data } = await axios.post<{ authorizationUrl: string; accessCode?: string; reference: string }>(apiUrl('/api/payment/initialize'), {
        email: tapUser.email,
        amount: request.amount,
        orderId: request.orderId,
        businessId: request.businessId,
        saveCard: true,
        tap: true,
        callbackUrl: `${window.location.origin}/payment-done?reference=${request.orderId}&tap=1`
      })
      await startZuriPayment(
        {
          authorizationUrl: data.authorizationUrl,
          accessCode: data.accessCode,
          reference: data.reference || request.orderId,
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

  return (
    <div className="min-h-screen bg-[#fefbf5] p-4">
      <header className="max-w-md mx-auto mb-6">
        <a href="/zuri-tap" className="text-sm text-gray-500 hover:text-zuri-orange">← Zuri Tap</a>
        <h1 className="text-xl font-bold text-zuri-black mt-2">Zuri Tap</h1>
        <p className="text-sm text-gray-600 mt-1">Join the room with the code from the business. Wherever you are, you&apos;ll see the request.</p>
      </header>

      <div className="max-w-md mx-auto space-y-6">
        {!joined ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
            <label className="block text-sm font-semibold text-zuri-black mb-2">Room code</label>
            <p className="text-xs text-gray-500 mb-2">Enter the 6-character code shown on the business device.</p>
            <input
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="e.g. 4A2B9K"
              maxLength={6}
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-lg font-mono tracking-widest uppercase focus:outline-none focus:ring-2 focus:ring-zuri-orange"
            />
            <button
              type="button"
              onClick={joinRoom}
              className="mt-4 w-full bg-zuri-black text-white py-3 rounded-xl font-semibold"
            >
              Join
            </button>
          </div>
        ) : (
          <>
            <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm flex items-center justify-between">
              <span className="text-sm text-gray-600">Room: <strong className="text-zuri-black">{code}</strong></span>
              <button type="button" onClick={leaveRoom} className="text-sm text-zuri-orange font-semibold">Leave</button>
            </div>

            {!request ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm text-center">
                <div className="w-16 h-16 rounded-full bg-zuri-orange/10 flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">📱</span>
                </div>
                <p className="text-zuri-black font-semibold">Waiting for payment request</p>
                <p className="text-sm text-gray-500 mt-2">Keep this screen open. When the business sends a request, it will appear here.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 shadow-sm">
                <h2 className="text-lg font-bold text-zuri-black mb-1">Payment request</h2>
                <p className="text-2xl font-bold text-zuri-orange">₦{request.amount.toFixed(2)}</p>
                <p className="text-gray-600 text-sm">from {request.businessName}</p>
                {request.items.length > 0 && (
                  <ul className="mt-3 text-sm text-gray-600 space-y-1">
                    {request.items.map((item, i) => (
                      <li key={i}>{item.quantity}× {item.name} — ₦{item.price.toFixed(2)}</li>
                    ))}
                  </ul>
                )}

                {!paid ? (
                  <div className="mt-6 space-y-4">
                    {!opened ? (
                      <button
                        type="button"
                        onClick={() => setOpened(true)}
                        className="w-full py-3 bg-zuri-orange text-white rounded-xl font-semibold"
                      >
                        Open
                      </button>
                    ) : (
                      <>
                        {savedCards.length > 0 && (
                          <>
                            <p className="text-xs font-semibold text-gray-500">Pay with saved card</p>
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-1">Zuri Tap password</label>
                              <input
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Enter your password to pay"
                                className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => { setRequest(null); setOpened(false); setPassword('') }}
                                className="flex-1 py-2.5 border border-gray-200 rounded-xl font-semibold text-gray-700"
                              >
                                Decline
                              </button>
                              <button
                                type="button"
                                onClick={handlePay}
                                disabled={paying || !password.trim()}
                                className="flex-1 py-2.5 bg-zuri-orange text-white rounded-xl font-semibold disabled:opacity-50"
                              >
                                {paying ? 'Paying…' : 'Pay'}
                              </button>
                            </div>
                            <p className="text-xs text-gray-400 text-center">or</p>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={handlePayWithPaystack}
                          disabled={paystackLoading}
                          className="w-full py-2.5 border-2 border-zuri-black text-zuri-black rounded-xl font-semibold disabled:opacity-50"
                        >
                          {paystackLoading ? 'Opening…' : savedCards.length > 0 ? 'Pay with Paystack (new card)' : 'Pay with Paystack'}
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="mt-6 p-4 bg-green-50 rounded-xl text-center">
                    <p className="font-semibold text-green-800">Payment complete</p>
                    <p className="text-sm text-green-700 mt-1">₦{request.amount.toFixed(2)} paid to {request.businessName}</p>
                    <button
                      type="button"
                      onClick={() => setPaid(false)}
                      className="mt-3 text-sm font-semibold text-zuri-orange"
                    >
                      Wait for next request
                    </button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default TapWaitPage
