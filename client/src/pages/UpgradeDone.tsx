import { useEffect, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import axios from 'axios'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'
import {
  clearPendingPaymentReference,
  resolvePaymentReference,
  readPaymentReferenceFromLocation,
} from '../lib/paymentReferenceStorage'
import { apiUrl } from '../lib/apiBase'
import { getBusinessToken } from '../lib/businessAuthStorage'

function UpgradeDone(): JSX.Element {
  const [searchParams] = useSearchParams()
  const [reference, setReference] = useState<string | null>(null)
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading')
  const [message, setMessage] = useState<string>('')
  const [plan, setPlan] = useState<string>('')

  const tryRecover = useCallback((fallbackRef?: string | null): void => {
    setStatus('loading')
    const token = getBusinessToken()
    if (!token) {
      setStatus('failed')
      setMessage(fallbackRef ? 'Payment could not be verified. Try again from Payment & pricing.' : 'Missing payment reference')
      return
    }
    const recoverUrl = fallbackRef
      ? apiUrl(`/api/subscription/recover?reference=${encodeURIComponent(fallbackRef)}`)
      : apiUrl('/api/subscription/recover')
    axios
      .get(recoverUrl, {
        headers: { Authorization: `Bearer ${token}` },
      })
      .then((res) => {
        if (res.data?.success) {
          clearPendingPaymentReference()
          setStatus('success')
          setPlan(res.data?.plan || '')
          if (res.data?.reference) setReference(res.data.reference)
        } else {
          setStatus('failed')
          setMessage(res.data?.message || 'Payment could not be verified. If you were charged, open Payment & pricing from your dashboard.')
        }
      })
      .catch((err: { response?: { data?: { message?: string } } }) => {
        setStatus('failed')
        setMessage(
          err.response?.data?.message ||
            'Payment could not be verified. If you were charged, open Payment & pricing from your dashboard.'
        )
      })
  }, [])

  const verify = useCallback((ref: string, attempt = 0): void => {
    setStatus('loading')
    axios
      .get(apiUrl(`/api/subscription/verify/${encodeURIComponent(ref)}`))
      .then((res) => {
        if (res.data?.success) {
          clearPendingPaymentReference()
          setStatus('success')
          setPlan(res.data?.plan || '')
          if (res.data?.reference) setReference(res.data.reference)
          return
        }

        const pending =
          typeof res.data?.message === 'string' &&
          res.data.message.toLowerCase().includes('still processing')
        if (pending && attempt < 4) {
          window.setTimeout(() => verify(ref, attempt + 1), 2000)
          return
        }

        if (getBusinessToken()) {
          tryRecover(ref)
          return
        }

        setStatus('failed')
        setMessage(res.data?.message || 'Payment was not successful')
      })
      .catch((err: { response?: { data?: { message?: string } } }) => {
        if (getBusinessToken()) {
          tryRecover(ref)
          return
        }
        setStatus('failed')
        setMessage(err.response?.data?.message || 'Failed to verify payment')
      })
  }, [tryRecover])

  useEffect(() => {
    const run = (): void => {
      const ref =
        resolvePaymentReference(searchParams, 'subscription') ||
        readPaymentReferenceFromLocation()
      if (ref) {
        setReference(ref)
        verify(ref)
        return
      }
      tryRecover()
    }
    run()
    window.addEventListener('pageshow', run)
    return () => window.removeEventListener('pageshow', run)
  }, [searchParams, verify, tryRecover])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <PaperPlaneLoader size="md" />
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="min-h-screen bg-[#f5f5f5] py-8 px-4 flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-md w-full">
          <div className="w-14 h-14 rounded-xl bg-zuri-orange/15 flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-zuri-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-zuri-black text-center mb-2">Upgrade successful</h1>
          <p className="text-gray-500 text-sm text-center mb-8">
            Your plan is now <strong className="text-zuri-black">{plan ? plan.replace('_', ' ') : ''}</strong>.
            {' '}Billing renews automatically each period until you cancel from Payment &amp; pricing.
          </p>
          {reference ? (
            <div className="space-y-3 mb-8">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Reference</span>
                <span className="font-semibold text-zuri-black">{reference.slice(0, 12)}…</span>
              </div>
            </div>
          ) : null}
          <Link
            to="/"
            className="block w-full bg-zuri-orange text-white py-2.5 rounded-xl font-semibold text-sm text-center hover:bg-zuri-orange-dark transition"
          >
            Back to home
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] py-8 px-4 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-md w-full">
        <div className="w-14 h-14 rounded-xl bg-red-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-xl font-bold text-zuri-black text-center mb-2">Payment failed</h1>
        <p className="text-gray-500 text-sm text-center mb-8">{message}</p>
        <Link
          to="/"
          className="block w-full bg-zuri-black text-white py-2.5 rounded-xl font-semibold text-sm text-center hover:bg-gray-800 transition"
        >
          Back to home
        </Link>
      </div>
    </div>
  )
}

export default UpgradeDone
