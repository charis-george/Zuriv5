import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { SavedCard } from '../types'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'

interface TapSession {
  token: string
  orderId: string
  businessId: string
  businessName: string
  amount: number
  items: { name: string; quantity: number; price: number }[]
  expiresAt: string
}

function TapPayPage(): JSX.Element {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const [session, setSession] = useState<TapSession | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [tapUser, setTapUser] = useState<{ id: string; email: string; name?: string } | null>(null)
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null)
  const [charging, setCharging] = useState(false)
  const [paid, setPaid] = useState(false)

  useEffect(() => {
    if (!token) {
      setError('Invalid link')
      setLoading(false)
      return
    }
    axios.get<TapSession>(`/api/tap/session/${token}`)
      .then(res => setSession(res.data))
      .catch(err => {
        setError(err.response?.data?.error || 'Session expired or not found')
      })
      .finally(() => setLoading(false))
  }, [token])

  useEffect(() => {
    const t = localStorage.getItem('zuri_tap_token')
    if (!t) return
    axios.get('/api/tap-auth/me', { headers: { Authorization: `Bearer ${t}` } })
      .then(res => setTapUser(res.data))
      .catch(() => localStorage.removeItem('zuri_tap_token'))
  }, [])

  useEffect(() => {
    if (!tapUser || !session) return
    axios.get<SavedCard[]>(`/api/payment/saved-cards?email=${encodeURIComponent(tapUser.email)}&businessId=${session.businessId}`)
      .then(res => {
        const cards = res.data || []
        setSavedCards(cards)
        if (cards.length) setSelectedCardId(cards[0].id)
      })
      .catch(() => setSavedCards([]))
  }, [tapUser, session])

  const handlePayWithSavedCard = async (): Promise<void> => {
    if (!session || !tapUser || !selectedCardId || savedCards.length === 0) return
    setCharging(true)
    try {
      await axios.post('/api/payment/charge-saved', {
        email: tapUser.email,
        businessId: session.businessId,
        orderId: session.orderId,
        amount: session.amount,
        saved_card_id: selectedCardId
      })
      setPaid(true)
      axios.delete(`/api/tap/session/${session.token}`).catch(() => {})
    } catch (err) {
      alert(axios.isAxiosError(err) ? (err.response?.data?.error || 'Payment failed') : 'Payment failed')
    } finally {
      setCharging(false)
    }
  }

  const handlePayWithNewCard = (): void => {
    if (!session || !tapUser) return
    axios.post('/api/payment/initialize', {
      email: tapUser.email,
      amount: session.amount,
      orderId: session.orderId,
      businessId: session.businessId,
      saveCard: true,
      callbackUrl: `${window.location.origin}/payment-done?tap=1`
    })
      .then(res => {
        if (res.data?.authorizationUrl) window.location.href = res.data.authorizationUrl
        else alert('Could not start payment')
      })
      .catch(() => alert('Could not start payment'))
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#fefbf5]">
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
            <span className="text-3xl">✓</span>
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
        <div className="text-center max-w-sm">
          <h1 className="text-xl font-bold text-zuri-black mb-2">Sign in to pay</h1>
          <p className="text-gray-600 text-sm mb-6">
            Pay ₦{session.amount.toFixed(2)} to {session.businessName}
          </p>
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
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <h1 className="text-lg font-bold text-zuri-black text-center">Pay with Zuri Tap</h1>
        <p className="text-center text-2xl font-bold text-zuri-orange mt-2">₦{session.amount.toFixed(2)}</p>
        <p className="text-center text-gray-600 text-sm mt-1">to {session.businessName}</p>

        {session.items.length > 0 && (
          <ul className="mt-4 text-sm text-gray-600 space-y-1">
            {session.items.map((item, i) => (
              <li key={i}>{item.quantity}× {item.name} — ₦{item.price.toFixed(2)}</li>
            ))}
          </ul>
        )}

        <div className="mt-6 space-y-3">
          {savedCards.length > 0 && (
            <>
              <p className="text-xs font-semibold text-gray-500">Saved card</p>
              <div className="space-y-2">
                {savedCards.map(card => (
                  <label key={card.id} className="flex items-center gap-2 p-3 border border-gray-200 rounded-xl cursor-pointer">
                    <input
                      type="radio"
                      name="card"
                      checked={selectedCardId === card.id}
                      onChange={() => setSelectedCardId(card.id)}
                      className="text-zuri-orange"
                    />
                    <span className="text-sm">•••• {card.last4} ({card.card_type})</span>
                  </label>
                ))}
              </div>
              <button
                onClick={handlePayWithSavedCard}
                disabled={charging}
                className="w-full bg-zuri-orange text-white py-3 rounded-xl font-semibold disabled:opacity-50"
              >
                {charging ? 'Processing…' : `Pay ₦${session.amount.toFixed(2)}`}
              </button>
            </>
          )}
          <button
            onClick={handlePayWithNewCard}
            className="w-full border border-gray-300 text-gray-700 py-3 rounded-xl font-semibold"
          >
            {savedCards.length > 0 ? 'Use different card' : 'Add card & pay'}
          </button>
        </div>

        <p className="text-xs text-gray-400 text-center mt-4">Signed in as {tapUser.email}</p>
      </div>
    </div>
  )
}

export default TapPayPage
