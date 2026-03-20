import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import axios from 'axios'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'

function PaymentDone(): JSX.Element {
  const [searchParams] = useSearchParams()
  const reference = searchParams.get('reference')
  const tap = searchParams.get('tap') === '1'
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading')
  const [message, setMessage] = useState<string>('')
  const [reviewEligibility, setReviewEligibility] = useState<{ loading: boolean; exists: boolean; businessName: string | null } | null>(null)
  const [reviewRating, setReviewRating] = useState<number>(0)
  const [reviewComment, setReviewComment] = useState<string>('')
  const [reviewSubmitting, setReviewSubmitting] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)

  useEffect(() => {
    if (!reference) {
      setStatus('failed')
      setMessage('Missing payment reference')
      return
    }
    axios
      .get(`/api/payment/verify/${reference}`)
      .then((res) => {
        if (res.data?.success) {
          setStatus('success')
        } else {
          setStatus('failed')
          setMessage(res.data?.message || 'Payment was not successful')
        }
      })
      .catch((err) => {
        setStatus('failed')
        setMessage('Failed to verify payment')
      })
  }, [reference])

  useEffect(() => {
    if (status !== 'success' || !reference) return

    setReviewEligibility({ loading: true, exists: false, businessName: null })
    axios
      .get(`/api/reviews/for-order/${reference}`)
      .then((res) => {
        setReviewEligibility({
          loading: false,
          exists: Boolean(res.data?.exists),
          businessName: res.data?.businessName ?? null
        })
      })
      .catch(() => {
        // If review eligibility fails to load, avoid blocking the happy path.
        setReviewEligibility({ loading: false, exists: false, businessName: null })
      })
  }, [status, reference])

  const submitReview = async (): Promise<void> => {
    if (!reference) return
    if (!reviewRating || reviewRating < 1) {
      setReviewError('Please choose a rating.')
      return
    }
    setReviewSubmitting(true)
    setReviewError(null)
    try {
      await axios.post('/api/reviews', {
        orderId: reference,
        rating: reviewRating,
        comment: reviewComment
      })
      setReviewEligibility((prev) => (prev ? { ...prev, exists: true } : prev))
      setReviewComment('')
      setReviewRating(0)
    } catch (err) {
      if (axios.isAxiosError(err)) setReviewError(err.response?.data?.error || 'Failed to submit review')
      else setReviewError('Failed to submit review')
    } finally {
      setReviewSubmitting(false)
    }
  }

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <PaperPlaneLoader size="md" />
      </div>
    )
  }

  if (status === 'success') {
    const businessLabel = reviewEligibility?.businessName || 'your business'
    return (
      <div className="min-h-screen bg-[#f5f5f5] py-8 px-4 flex items-center justify-center">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full">
          <div className="w-14 h-14 rounded-xl bg-zuri-orange/15 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-zuri-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-zuri-black text-center mb-2">
            {tap ? 'Your Zuri Tap payment was successful' : 'Your payment was successful'}
          </h1>
          <p className="text-gray-500 text-sm text-center mb-8">
            {tap ? 'Your card has been saved for faster Zuri Tap payments next time.' : 'Your order has been paid. Thank you.'}
          </p>
          <div className="space-y-3 mb-8">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Reference</span>
              <span className="font-semibold text-zuri-black">{reference?.slice(0, 12)}…</span>
            </div>
          </div>

          <div className="mb-8 border-t border-gray-100 pt-4">
            {reviewEligibility?.loading ? (
              <div className="flex items-center justify-center">
                <PaperPlaneLoader size="sm" compact />
              </div>
            ) : reviewEligibility && reviewEligibility.exists ? (
              <div className="text-center">
                <p className="text-sm font-semibold text-zuri-black">Thanks for your review!</p>
                <p className="text-xs text-gray-500 mt-1">We’ve already received your rating for {businessLabel}.</p>
              </div>
            ) : reviewEligibility ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold text-zuri-black text-center">
                  Rate {businessLabel}
                </p>
                <div className="flex items-center justify-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setReviewRating(star)}
                      className="focus:outline-none"
                      aria-label={`Rate ${star} star`}
                    >
                      <span className={star <= reviewRating ? 'text-zuri-orange' : 'text-gray-300'}>
                        ★
                      </span>
                    </button>
                  ))}
                </div>

                <label className="block text-xs text-gray-600">
                  Optional comment (up to 2000 chars)
                </label>
                <textarea
                  value={reviewComment}
                  onChange={(e) => setReviewComment(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zuri-orange focus:border-zuri-orange"
                  placeholder="What did we do well?"
                />

                {reviewError ? (
                  <p className="text-xs text-red-600 text-center">{reviewError}</p>
                ) : null}

                <button
                  type="button"
                  onClick={() => void submitReview()}
                  disabled={reviewSubmitting || reviewRating < 1}
                  className="w-full bg-zuri-orange text-white py-2 rounded-lg text-sm font-semibold hover:bg-zuri-orange-dark transition disabled:opacity-50"
                >
                  {reviewSubmitting ? 'Submitting…' : 'Submit review'}
                </button>
              </div>
            ) : null}
          </div>

          <Link
            to={tap ? '/tap' : '/'}
            className="block w-full bg-zuri-orange text-white py-1.5 rounded-lg text-sm text-center hover:bg-zuri-orange-dark transition"
          >
            {tap ? 'Back to Zuri Tap' : 'Back to home'}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] py-8 px-4 flex items-center justify-center">
      <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full">
        <div className="w-14 h-14 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-zuri-black text-center mb-2">Payment failed</h1>
        <p className="text-gray-500 text-sm text-center mb-8">{message}</p>
        <Link
          to={tap ? '/tap' : '/'}
          className="block w-full bg-zuri-black text-white py-1.5 rounded-lg text-sm text-center hover:bg-gray-800 transition"
        >
          {tap ? 'Back to Zuri Tap' : 'Back to home'}
        </Link>
      </div>
    </div>
  )
}

export default PaymentDone
