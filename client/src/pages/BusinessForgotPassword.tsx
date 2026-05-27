import { useState, FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { formatUserFacingError } from '../lib/formatApiError'

function BusinessForgotPassword(): JSX.Element {
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect')
  const loginHref = redirect ? `/business/login?redirect=${encodeURIComponent(redirect)}` : '/business/login'
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [resetLink, setResetLink] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setLoading(true)
    setSent(false)
    setResetLink(null)
    try {
      const { data } = await axios.post<{ success: boolean; message?: string; resetLink?: string }>(
        '/api/business/forgot-password',
        { email: email.trim() }
      )
      setSent(true)
      if (data.resetLink) setResetLink(data.resetLink)
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Unable to send reset link. Please try again.')
          : 'Unable to send reset link. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen w-full bg-zuri-black text-white flex flex-col md:flex-row">
        <div className="relative flex-1 flex items-center justify-center px-8 py-10">
          <div className="absolute inset-0 opacity-90">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,189,89,0.18),_transparent_55%)]" />
          </div>
          <div className="relative max-w-sm w-full space-y-3">
            <img src="/ZURI.png" alt="ZURI" className="h-9 w-auto object-contain mb-2" />
            <h1 className="text-2xl font-semibold">Check your email</h1>
            <p className="text-zuri-light/80 text-sm">
              If an account exists for that email, we’ve sent instructions to reset your password.
            </p>
            {resetLink && (
              <p className="text-sm text-zuri-light/90 pt-2">
                <span className="text-zuri-light/60 block mb-1">Or use this link (for testing):</span>
                <a href={resetLink} className="text-zuri-orange hover:underline break-all">
                  Reset password
                </a>
              </p>
            )}
            <Link to={loginHref} className="inline-block mt-4 text-sm font-semibold text-zuri-orange hover:underline">
              ← Back to log in
            </Link>
          </div>
        </div>
        <div className="w-full md:w-[420px] bg-white text-zuri-black flex items-center justify-center px-6 py-10">
          <p className="text-sm text-gray-500 text-center">
            Didn’t get an email? Check spam or{' '}
            <button type="button" onClick={() => { setSent(false); setResetLink(null) }} className="font-semibold text-zuri-orange hover:underline">
              try again
            </button>
            .
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-zuri-black text-white flex flex-col md:flex-row">
      <div className="relative flex-1 flex items-center justify-center px-8 py-10">
        <div className="absolute inset-0 opacity-90">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,189,89,0.18),_transparent_55%)]" />
        </div>
        <div className="relative max-w-sm w-full space-y-3">
          <img src="/ZURI.png" alt="ZURI" className="h-9 w-auto object-contain mb-2" />
          <h1 className="text-2xl font-semibold">Forgot password?</h1>
          <p className="text-zuri-light/80 text-sm">
            Enter your business account email and we’ll send you a link to reset your password.
          </p>
        </div>
      </div>
      <div className="w-full md:w-[420px] bg-white text-zuri-black flex items-center justify-center px-6 py-10 md:px-8">
        <div className="w-full max-w-sm">
          <h2 className="text-xl md:text-2xl font-semibold">Reset password</h2>
          <p className="text-gray-500 text-xs mt-1 mb-5">We’ll send a reset link to your email.</p>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 px-3 py-2 rounded-lg mb-3 text-xs">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Work email</label>
              <input
                type="email"
                placeholder="hi@yourbusiness.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange placeholder:text-gray-400"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-zuri-orange text-white py-2.5 rounded-lg font-semibold text-[13px] leading-none hover:bg-zuri-orange-dark transition-colors disabled:opacity-60"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <Link to={loginHref} className="mt-4 block text-center text-xs text-gray-400 hover:text-zuri-orange transition-colors">
            ← Back to log in
          </Link>
        </div>
      </div>
    </div>
  )
}

export default BusinessForgotPassword
