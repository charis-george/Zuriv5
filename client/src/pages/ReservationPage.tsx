import { useEffect, useMemo, useState, FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'
import type { Business } from '../types'

function toDateInputValue(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function ReservationPage(): JSX.Element {
  const { businessId } = useParams<{ businessId: string }>()
  const [loading, setLoading] = useState(true)
  const [business, setBusiness] = useState<Business | null>(null)
  const [error, setError] = useState<string | null>(null)
  const now = useMemo(() => new Date(), [])
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [partySize, setPartySize] = useState<number>(2)
  const [reservationDate, setReservationDate] = useState(toDateInputValue(now))
  const [reservationTime, setReservationTime] = useState('19:00')
  const [notes, setNotes] = useState('')
  const [requesting, setRequesting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!businessId) return
    setLoading(true)
    axios.get<Business>(`/api/qr/business/${businessId}`)
      .then((res) => setBusiness(res.data))
      .catch(() => setError('Business not found'))
      .finally(() => setLoading(false))
  }, [businessId])

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    if (!businessId) return
    const name = customerName.trim()
    const phone = customerPhone.trim()
    if (!name) return setError('Please enter your name')
    if (!phone) return setError('Please enter your phone number')

    setRequesting(true)
    setError(null)
    try {
      const { data } = await axios.post('/api/reservations', {
        businessId,
        customerName: name,
        customerPhone: phone,
        partySize,
        reservationDate,
        reservationTime,
        notes: notes.trim() || null
      })
      if (data?.success) {
        setSubmitted(true)
        const humanWhen = new Date(`${reservationDate}T${reservationTime}:00`).toLocaleString()
        setSubmittedMessage(`Request received for ${humanWhen}. The business will confirm shortly.`)
      } else {
        setError(data?.error || 'Failed to submit reservation request')
      }
    } catch {
      setError('Failed to submit reservation request. Please try again.')
    } finally {
      setRequesting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <PaperPlaneLoader size="lg" />
      </div>
    )
  }

  if (!businessId || error) {
    return (
      <div className="min-h-screen bg-zuri-light py-10 px-4 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-zuri-black mb-2">Reservation unavailable</h1>
          <p className="text-gray-500 text-sm mb-6">{error || 'Business not found'}</p>
          <Link to="/" className="inline-block bg-zuri-orange text-white px-3 py-2 rounded-lg font-semibold text-[13px] leading-none hover:bg-zuri-orange-dark transition-colors">
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zuri-light py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="bg-white rounded-2xl border border-gray-200 p-8">
          <div className="flex items-start justify-between gap-3 mb-6">
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-zuri-black mb-2 truncate">
                {business?.name ? `Book a table at ${business.name}` : 'Book a table'}
              </h1>
              <p className="text-gray-600 text-sm">Fill in the details and the business will confirm your request.</p>
            </div>
            <Link to={`/order/${businessId}`} className="inline-block text-zuri-black hover:text-zuri-yellow transition text-sm font-semibold">
              ← Back to menu
            </Link>
          </div>

          {submitted ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-xl bg-zuri-orange/15 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-zuri-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-zuri-black mb-2">Request sent</h2>
              <p className="text-gray-600 text-sm mb-6">{submittedMessage}</p>
              <Link to={`/order/${businessId}`} className="inline-block w-full bg-zuri-orange text-white py-2 rounded-lg font-semibold text-[13px] leading-none text-center hover:bg-zuri-orange-dark transition-colors">
                Back to menu
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && <div className="rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-sm text-red-700">{error}</div>}
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" placeholder="Your name" required />
              <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" placeholder="Phone number" required />
              <div className="grid md:grid-cols-2 gap-4">
                <input type="date" value={reservationDate} onChange={(e) => setReservationDate(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" required />
                <input type="time" value={reservationTime} onChange={(e) => setReservationTime(e.target.value)} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" required />
              </div>
              <input type="number" min={1} max={50} value={partySize} onChange={(e) => setPartySize(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" required />
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm" placeholder="Notes (optional)" />
              <button type="submit" disabled={requesting} className="w-full bg-zuri-orange text-white py-2 rounded-lg font-semibold text-[13px] leading-none hover:bg-zuri-orange-dark transition-colors disabled:opacity-70">
                {requesting ? 'Sending…' : 'Request reservation'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReservationPage
