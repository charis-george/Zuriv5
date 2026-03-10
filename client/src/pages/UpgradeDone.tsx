import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import axios from 'axios'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'

function UpgradeDone(): JSX.Element {
  const [searchParams] = useSearchParams()
  const reference = searchParams.get('reference')
  const [status, setStatus] = useState<'loading' | 'success' | 'failed'>('loading')
  const [message, setMessage] = useState<string>('')
  const [plan, setPlan] = useState<string>('')

  useEffect(() => {
    if (!reference) {
      setStatus('failed')
      setMessage('Missing payment reference')
      return
    }
    axios
      .get(`/api/subscription/verify/${reference}`)
      .then((res) => {
        if (res.data?.success) {
          setStatus('success')
          setPlan(res.data?.plan || '')
        } else {
          setStatus('failed')
          setMessage(res.data?.message || 'Payment was not successful')
        }
      })
      .catch(() => {
        setStatus('failed')
        setMessage('Failed to verify payment')
      })
  }, [reference])

  if (status === 'loading') {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
        <PaperPlaneLoader size="md" label="Verifying..." />
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
            Your plan is now <strong className="text-zuri-black">{plan ? plan.replace('_', ' ') : ''}</strong>. You can use all features.
          </p>
          <div className="space-y-3 mb-8">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Reference</span>
              <span className="font-semibold text-zuri-black">{reference?.slice(0, 12)}…</span>
            </div>
          </div>
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
