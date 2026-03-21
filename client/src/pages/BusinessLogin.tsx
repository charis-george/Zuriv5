import { useState, FormEvent } from 'react'
import { useNavigate, Link, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { API_BASE_URL } from '../lib/apiBase'
import { Business, BusinessFormData } from '../types'
import { NoticeModal, type NoticeVariant } from '../components/NoticeModal'

function BusinessLogin(): JSX.Element {
  const [searchParams] = useSearchParams()
  const redirectTo = searchParams.get('redirect') || ''

  const [isLogin, setIsLogin] = useState<boolean>(true)
  const [formData, setFormData] = useState<BusinessFormData>({
    name: '',
    email: '',
    password: '',
    phone: '',
    address: ''
  })
  const [acceptedTerms, setAcceptedTerms] = useState<boolean>(false)
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const [notice, setNotice] = useState<{ open: boolean; message: string; variant?: NoticeVariant }>({ open: false, message: '' })
  const navigate = useNavigate()

  const afterAuth = (businessId: string): void => {
    if (redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {
      navigate(redirectTo, { replace: true })
      return
    }
    navigate(`/business/onboarding/${businessId}`, { replace: true })
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setError('')
    if (!isLogin && !acceptedTerms) {
      setError('Please accept the Privacy Policy and Terms of Service to create an account.')
      return
    }
    setLoading(true)
    try {
      if (isLogin) {
        const response = await axios.post<Business & { token?: string }>('/api/business/login', {
          email: formData.email,
          password: formData.password
        })
        const token = response.data.token
        if (token) localStorage.setItem('zuri_business_token', token)
        if (response.data.id) localStorage.setItem('zuri_business_id', response.data.id)
        afterAuth(response.data.id)
      } else {
        await axios.post<Business>('/api/business/register', {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          phone: formData.phone || undefined,
          address: formData.address || undefined
        })
        setNotice({ open: true, message: 'Registration successful! Please log in now.', variant: 'success' })
        setIsLogin(true)
        setFormData({ name: '', email: '', password: '', phone: '', address: '' })
        setAcceptedTerms(false)
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const apiErr = err.response?.data && typeof err.response.data === 'object' && 'error' in err.response.data
          ? String((err.response.data as { error: unknown }).error)
          : ''
        if (apiErr) {
          setError(apiErr)
        } else if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
          setError(
            API_BASE_URL
              ? 'Cannot reach the API. Check that the backend is running and CORS allows this site.'
              : 'Cannot reach the API. If you use a hosted frontend (e.g. Vercel), set VITE_API_URL to your backend URL in the project environment variables.'
          )
        } else if (err.response?.status === 404) {
          setError(
            API_BASE_URL
              ? 'Login API returned 404. Check VITE_API_URL and backend routes.'
              : 'Login API not found. Deploy the Node server or set VITE_API_URL to where it is hosted.'
          )
        } else if (err.response?.status === 405) {
          setError(
            API_BASE_URL
              ? 'The server rejected POST (405). Check that VITE_API_URL is your Node API origin, not a static file host.'
              : '405 Method Not Allowed: the browser posted to this site instead of your API. In Vercel, set VITE_API_URL to your backend URL (e.g. https://your-api.railway.app), redeploy, and do not use your frontend URL as the API.'
          )
        } else {
          setError(err.message || 'An error occurred')
        }
      } else {
        setError('An error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  const loginSuffix = redirectTo ? `?redirect=${encodeURIComponent(redirectTo)}` : ''

  return (
    <div className="min-h-screen min-h-[100dvh] bg-white">
      <div className="min-h-screen w-full overflow-hidden">
        <div className="h-full flex flex-col lg:flex-row">
          {/* Left: form panel */}
          <div className="lg:w-[42%] bg-white px-6 py-7 sm:px-10 sm:py-10 lg:px-12 lg:py-12 flex flex-col border-b border-zuri-orange/10 lg:border-b-0 lg:border-r lg:border-zuri-orange/10">
            <Link to="/" className="inline-flex items-center gap-2 mb-6 opacity-90 hover:opacity-100 transition-opacity">
              <img src="/ZURI.png" alt="" className="h-8 w-auto object-contain" />
              <span className="text-[11px] tracking-[0.32em] uppercase text-zuri-black/90">Z U R I</span>
            </Link>

            <div className="max-w-sm w-full">
              <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-zuri-black mb-1">
                {isLogin ? 'Welcome back' : 'Start your free trial'}
              </h1>
              <p className="text-sm text-zuri-black/55 mb-7">
                {isLogin ? 'Log in to continue managing your business with less effort.' : 'No credit card required. Cancel anytime.'}
              </p>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-700 px-3 py-2 rounded-lg mb-4 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3 w-full">
                {!isLogin && (
                  <div>
                    <label className="block text-xs font-medium text-zuri-black mb-1">Business name</label>
                    <input
                      type="text"
                      placeholder="Your business name"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zuri-orange focus:border-zuri-orange placeholder:text-gray-400 bg-white"
                    />
                  </div>
                )}
                <div>
                  <label className="block text-xs font-medium text-zuri-black mb-1">Email</label>
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zuri-orange focus:border-zuri-orange placeholder:text-gray-400 bg-white"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <label className="block text-xs font-medium text-zuri-black">Password</label>
                    {isLogin && (
                      <Link
                        to={`/business/forgot-password${loginSuffix}`}
                        className="text-xs text-zuri-orange hover:underline"
                      >
                        Forgot password?
                      </Link>
                    )}
                  </div>
                  <input
                    type="password"
                    placeholder={isLogin ? 'Enter your password' : 'Choose a password'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zuri-orange focus:border-zuri-orange placeholder:text-gray-400 bg-white"
                  />
                </div>

                {!isLogin && (
                  <label className="flex items-start gap-2 text-xs text-zuri-black/65 cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={(e) => setAcceptedTerms(e.target.checked)}
                      className="mt-0.5 rounded border-gray-300 text-zuri-orange focus:ring-zuri-orange"
                    />
                    <span>
                      I agree to the{' '}
                      <Link to="/privacy" className="text-zuri-orange hover:underline">
                        Privacy Policy
                      </Link>{' '}
                      and{' '}
                      <Link to="/privacy" className="text-zuri-orange hover:underline">
                        Terms of Service
                      </Link>
                      .
                    </span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full mt-1 py-2 rounded-lg text-sm font-medium border-2 border-zuri-orange text-zuri-orange bg-transparent hover:border-zuri-orange-dark hover:text-zuri-orange-dark transition-colors disabled:opacity-50"
                >
                  {loading ? 'Please wait…' : (isLogin ? 'Log in' : 'Create account')}
                </button>
              </form>

              <div className="mt-6 flex items-center gap-3">
                <div className="h-px bg-zuri-orange/15 flex-1" />
                <span className="text-xs text-zuri-black/40">or</span>
                <div className="h-px bg-zuri-orange/15 flex-1" />
              </div>

              <p className="mt-5 text-sm text-zuri-black/55">
                {isLogin ? (
                  <>
                    No account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setIsLogin(false)
                        setError('')
                        setFormData({ name: '', email: '', password: '', phone: '', address: '' })
                      }}
                      className="text-zuri-orange hover:underline font-medium"
                    >
                      Create account
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setIsLogin(true)
                        setError('')
                        setFormData({ name: '', email: '', password: '', phone: '', address: '' })
                        setAcceptedTerms(false)
                      }}
                      className="text-zuri-orange hover:underline font-medium"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>

              <Link to="/" className="mt-4 inline-block text-sm text-zuri-black/45 hover:text-zuri-orange transition">
                {'<-'} Back to home
              </Link>
            </div>
          </div>

          {/* Right: visual panel */}
          <div className="hidden lg:flex lg:w-[58%] relative bg-zuri-black">
            <div className="absolute inset-0 bg-gradient-to-br from-zuri-orange/25 via-zuri-black to-zuri-black" />
            <div className="absolute top-0 left-0 right-0 h-full bg-[radial-gradient(circle_at_25%_15%,rgba(255,205,28,0.18),transparent_45%),radial-gradient(circle_at_75%_35%,rgba(255,189,89,0.35),transparent_50%),linear-gradient(155deg,rgba(0,0,0,0.2),rgba(0,0,0,0.75))]" />

            <div className="relative flex-1 flex items-center justify-center p-10">
              <div className="w-full max-w-md rounded-[26px] border border-zuri-orange/30 bg-zuri-black/35 backdrop-blur-md p-6 text-white shadow-[0_20px_50px_rgba(255,189,89,0.10)]">
                <p className="text-sm leading-relaxed">
                  “You don&apos;t need more, you need less to manage. ZURI gives your team one clean flow for orders, payments, and growth.”
                </p>
                <p className="text-xs text-zuri-yellow/90 mt-3">ZURI • Built for modern businesses</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <NoticeModal
        open={notice.open}
        message={notice.message}
        variant={notice.variant}
        onClose={() => setNotice((s) => ({ ...s, open: false }))}
      />
    </div>
  )
}

export default BusinessLogin
