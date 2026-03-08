import { useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams, Link } from 'react-router-dom'
import axios from 'axios'
import { PLAN_LABELS, PLAN_PRICES, PLAN_PRICES_YEARLY, type PlanId, type BillingInterval, type Business } from '../types'

function parseAmount(plan: PlanId, interval: BillingInterval): { display: string; numeric: number } {
  const table = interval === 'yearly' ? PLAN_PRICES_YEARLY : PLAN_PRICES
  const display = table[plan] || '₦0'
  const numeric = Number(display.replace(/[^0-9]/g, '')) || 0
  return { display, numeric }
}

function SubscriptionSummary(): JSX.Element {
  const { plan: planParam } = useParams<{ plan: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const interval: BillingInterval = (searchParams.get('interval') === 'yearly' ? 'yearly' : 'monthly')

  const plan: PlanId | null = useMemo(() => {
    const p = (planParam || '').toLowerCase()
    const allowed: PlanId[] = ['starter', 'growth', 'pro', 'zuri_plus']
    return allowed.includes(p as PlanId) ? (p as PlanId) : null
  }, [planParam])

  const { display, numeric } = useMemo(
    () => (plan ? parseAmount(plan, interval) : { display: '₦0', numeric: 0 }),
    [plan, interval]
  )

  const handlePay = async (): Promise<void> => {
    if (!plan) return
    setError(null)
    const token = localStorage.getItem('zuri_business_token')
    const businessId = localStorage.getItem('zuri_business_id')
    if (!token || !businessId) {
      setError('Please log in to your business dashboard to complete this subscription.')
      return
    }
    setLoading(true)
    try {
      const { data: business } = await axios.get<Business>(`/api/business/${businessId}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (!business?.email) {
        setError('Business email not found. Please check your profile.')
        setLoading(false)
        return
      }
      const body = {
        businessId,
        plan,
        email: business.email,
        callbackUrl: `${window.location.origin}/upgrade-done`,
        interval
      }
      const { data } = await axios.post<{ authorizationUrl: string }>('/api/subscription/initialize', body, {
        headers: { Authorization: `Bearer ${token}` }
      })
      if (data?.authorizationUrl) {
        window.location.href = data.authorizationUrl
      } else {
        setError('Could not start payment. Please try again.')
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        if (err.response?.status === 401 || err.response?.status === 403) {
          setError('Please log in to your business dashboard to subscribe to a plan.')
          localStorage.removeItem('zuri_business_token')
          localStorage.removeItem('zuri_business_id')
        } else {
          setError(err.response?.data?.error || 'Failed to start subscription payment.')
        }
      } else {
        setError('Failed to start subscription payment.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (!plan) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-zuri-black mb-2">Plan not found</h1>
          <p className="text-gray-500 text-sm mb-6">Please go back to the pricing section and choose a valid plan.</p>
          <Link
            to="/#pricing"
            className="inline-block bg-zuri-orange text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition"
          >
            Back to pricing
          </Link>
        </div>
      </div>
    )
  }

  const planLabel = PLAN_LABELS[plan]
  const duration = interval === 'monthly' ? '1 month' : '12 months'
  const billingLabel = interval === 'monthly' ? 'Monthly' : 'Yearly'

  return (
    <div className="min-h-screen bg-[#f5f5f5] py-10 px-4">
      <div className="max-w-md mx-auto">
        <div className="mb-6">
          <Link to="/" className="inline-flex items-center text-sm text-gray-500 hover:text-zuri-orange transition">
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to home
          </Link>
        </div>
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
          <h1 className="text-xl font-bold text-zuri-black mb-1">Subscription summary</h1>
          <p className="text-gray-500 text-sm mb-6">Review your subscription before continuing to Paystack.</p>

          <div className="space-y-4 mb-6">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Subscription plan</span>
              <span className="font-semibold text-zuri-black">
                {planLabel} ({interval === 'monthly' ? '1 Month' : '12 Months'})
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Amount</span>
              <span className="font-bold text-zuri-orange">{display}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Duration</span>
              <span className="font-semibold text-zuri-black">{duration}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Billing period</span>
              <span className="font-semibold text-zuri-black">{billingLabel}</span>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handlePay}
            disabled={loading || numeric <= 0}
            className="w-full bg-zuri-orange text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-zuri-orange-dark transition disabled:opacity-60 mb-3"
          >
            {loading ? 'Redirecting…' : `Pay ${display}`}
          </button>
          <p className="text-[11px] text-gray-500 text-center">
            Payment secured by <span className="font-semibold text-gray-700">Paystack</span>. You&rsquo;ll be redirected to
            complete your payment.
          </p>
        </div>
      </div>
    </div>
  )
}

export default SubscriptionSummary

