import { useEffect, useState, FormEvent } from 'react'

import { useNavigate, Link, useSearchParams } from 'react-router-dom'

import axios from 'axios'

import { apiUrl } from '../lib/apiBase'

import {

  clearBusinessAuth,

  getBusinessId,

  getBusinessToken,

  isBusinessLoggedIn,

  setBusinessSession

} from '../lib/businessAuthStorage'

import { formatApiErrorBody, formatUserFacingError } from '../lib/formatApiError'

import { organizationJsonLd, usePageSeo } from '../lib/seo'

import { Business, BusinessFormData } from '../types'

import { NoticeModal, type NoticeVariant } from '../components/NoticeModal'



function BusinessLogin(): JSX.Element {

  usePageSeo({

    title: 'ZURI Business Login | Restaurant Dashboard',

    description: 'Log in or create a ZURI business account to manage QR ordering, digital menus, payments, reservations, and Zuri Assist (Scale) insights.',

    path: '/business/login',

    jsonLd: [

      organizationJsonLd,

      {

        '@context': 'https://schema.org',

        '@type': 'WebPage',

        name: 'ZURI Business Login',

        url: 'https://zuriqo.com/business/login',

        description: 'Business login and registration page for the ZURI restaurant ordering dashboard.'

      }

    ]

  })



  const [searchParams] = useSearchParams()

  const redirectTo = searchParams.get('redirect') || ''



  const [isLogin, setIsLogin] = useState<boolean>(true)

  const [formData, setFormData] = useState<BusinessFormData>({

    name: '',

    email: '',

    password: '',

    phone: '',

    address: '',

    contactName: ''

  })

  const [acceptedTerms, setAcceptedTerms] = useState<boolean>(false)

  const [registerBusinessMode, setRegisterBusinessMode] = useState<'menu' | 'ticketing' | 'shop'>('menu')

  const [error, setError] = useState<string>('')

  const [loading, setLoading] = useState<boolean>(false)

  const [notice, setNotice] = useState<{ open: boolean; message: string; variant?: NoticeVariant }>({ open: false, message: '' })

  const [loggedInBusiness, setLoggedInBusiness] = useState<{ businessId: string; label: string } | null>(null)

  const navigate = useNavigate()



  const isScanRedirect = (path: string): boolean => {

    if (!path.startsWith('/') || path.startsWith('//')) return false

    return path === '/scan' || path.startsWith('/scan?') || path.startsWith('/scan/')

  }



  useEffect(() => {

    if (!isBusinessLoggedIn()) {

      setLoggedInBusiness(null)

      return

    }

    const businessId = getBusinessId()

    const token = getBusinessToken()

    if (!businessId || !token) return

    setLoggedInBusiness({ businessId, label: 'your business' })

    let cancelled = false

    void axios

      .get<Business>(apiUrl(`/api/business/${businessId}`), {

        headers: { Authorization: `Bearer ${token}` }

      })

      .then((res) => {

        if (cancelled) return

        const label = res.data?.name?.trim() || res.data?.email?.trim() || 'your business'

        setLoggedInBusiness({ businessId, label })

      })

      .catch(() => {})

    return () => {

      cancelled = true

    }

  }, [])



  const afterAuth = (businessId: string, business?: Business): void => {

    if (redirectTo.startsWith('/') && !redirectTo.startsWith('//')) {

      navigate(redirectTo, { replace: true })

      return

    }

    if (redirectTo && isScanRedirect(redirectTo)) {

      navigate(redirectTo, { replace: true })

      return

    }

    const label = business?.name?.trim() || business?.email?.trim() || formData.email.trim() || 'your business'

    setLoggedInBusiness({ businessId, label })

    const onboardingDone = localStorage.getItem('zuri_onboarding_done_' + businessId) === '1'

    navigate(onboardingDone ? `/business/dashboard/${businessId}` : `/business/onboarding/${businessId}`, { replace: true })

  }



  const handleLogout = (): void => {

    clearBusinessAuth()

    setLoggedInBusiness(null)

    setFormData({ name: '', email: '', password: '', phone: '', address: '' })

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

        const response = await axios.post<Business & { token?: string }>(apiUrl('/api/business/login'), {

          email: formData.email,

          password: formData.password

        })

        const businessId = response.data?.id

        if (!businessId || typeof businessId !== 'string') {

          setError('Login response was invalid. Please try again or contact support.')

          return

        }

        const token = response.data.token

        if (!token) {

          setError('Login response was invalid. Please try again or contact support.')

          return

        }

        const stored = setBusinessSession(token, businessId)

        if (!stored) {

          setError('Signed in, but we could not keep your session in this browser. Please try again.')

          return

        }

        afterAuth(businessId, response.data)

      } else {

        await axios.post<Business>('/api/business/register', {

          name: formData.name,

          email: formData.email,

          password: formData.password,

          phone: formData.phone || undefined,

          address: formData.address || undefined,

          contactName: formData.contactName || undefined,

          businessMode: registerBusinessMode

        })

        setNotice({ open: true, message: 'Registration successful! Please log in now.', variant: 'success' })

        setIsLogin(true)

        setFormData({ name: '', email: '', password: '', phone: '', address: '' })

        setAcceptedTerms(false)

        setRegisterBusinessMode('menu')

      }

    } catch (err) {

      if (axios.isAxiosError(err)) {

        const apiErr = formatApiErrorBody(err.response?.data)

        if (apiErr) {

          setError(formatUserFacingError(apiErr, 'Unable to continue right now. Please try again.'))

        } else if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {

          setError('Unable to connect right now. Please check your internet and try again.')

        } else if (err.response?.status === 404) {

          setError('We could not complete login right now. Please try again shortly.')

        } else if (err.response?.status === 405) {

          setError('We could not complete login right now. Please try again shortly.')

        } else {

          setError(formatUserFacingError(err.response?.data, 'An error occurred. Please try again.'))

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

    <div className="min-h-[100dvh] bg-white lg:grid lg:grid-cols-[42%_58%]">

          {/* Left: form panel */}

          <div className="bg-white px-6 py-7 sm:px-10 sm:py-10 lg:px-12 lg:py-12 flex flex-col border-b border-zuri-orange/10 lg:border-b-0 lg:border-r lg:border-zuri-orange/10 lg:min-h-[100dvh]">

            <Link to="/" className="inline-flex items-center gap-2 mb-6 opacity-90 hover:opacity-100 transition-opacity">

              <img src="/ZURI.png" alt="ZURI logo" className="h-8 w-auto object-contain" />

              <span className="text-[11px] tracking-[0.32em] uppercase text-zuri-black/90">Z U R I</span>

            </Link>



            <div className="max-w-sm w-full">

              <h1 className="text-2xl sm:text-[28px] font-semibold tracking-tight text-zuri-black mb-1">

                {isLogin ? 'Welcome back' : 'Start your free trial'}

              </h1>

              <p className="text-sm text-zuri-black/55 mb-7">

                {isLogin ? 'Log in to manage orders, tickets, and your storefront.' : 'No credit card required. Cancel anytime.'}

              </p>



              {error && (

                <div className="bg-red-50 border border-red-100 text-red-700 px-3 py-2 rounded-lg mb-4 text-sm">

                  {error}

                </div>

              )}



              {loggedInBusiness ? (

                <div className="rounded-2xl border border-green-200 bg-green-50/80 p-4 space-y-4">

                  <div>

                    <p className="text-sm font-semibold text-zuri-black">You&apos;re logged in</p>

                    <p className="text-sm text-zuri-black/60 mt-1">

                      Signed in as <span className="font-medium text-zuri-black">{loggedInBusiness.label}</span>.

                    </p>

                  </div>

                  <Link

                    to={`/business/dashboard/${loggedInBusiness.businessId}`}

                    className="inline-flex items-center justify-center w-full py-2.5 rounded-lg text-sm font-medium bg-zuri-orange text-white hover:bg-zuri-orange-dark transition-colors"

                  >

                    Open dashboard

                  </Link>

                  <Link

                    to="/scan"

                    className="inline-flex items-center justify-center w-full py-2.5 rounded-lg text-sm font-medium border border-zuri-orange text-zuri-orange bg-white hover:bg-zuri-orange/5 transition-colors"

                  >

                    Ticket scanner

                  </Link>

                  <button

                    type="button"

                    onClick={handleLogout}

                    className="w-full py-2 rounded-lg text-sm font-medium border border-gray-200 text-zuri-black/70 hover:border-zuri-orange/40 hover:text-zuri-orange transition-colors"

                  >

                    Log out on this device

                  </button>

                  <Link to="/" className="block text-center text-sm text-zuri-black/45 hover:text-zuri-orange transition">

                    {'<-'} Back to home

                  </Link>

                </div>

              ) : (

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

                  {!isLogin && (
                    <div>
                      <label className="block text-xs font-medium text-zuri-black mb-1">Contact name</label>
                      <input
                        type="text"
                        placeholder="Primary contact person"
                        value={formData.contactName || ''}
                        onChange={(e) => setFormData({ ...formData, contactName: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-1 focus:ring-zuri-orange focus:border-zuri-orange placeholder:text-gray-400 bg-white"
                      />
                    </div>
                  )}

                  {!isLogin && (
                    <div>
                      <label className="block text-xs font-medium text-zuri-black mb-1">Phone</label>
                      <input
                        type="tel"
                        placeholder="Business phone number"
                        value={formData.phone || ''}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
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

                      autoComplete="email"

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

                      autoComplete={isLogin ? 'current-password' : 'new-password'}

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

                  {!isLogin && (

                    <div className="rounded-lg border border-gray-200 p-3 mt-1">

                      <p className="text-xs font-medium text-zuri-black mb-2">I am setting up ZURI for</p>

                      <div className="grid grid-cols-3 gap-2 text-xs">

                        <button

                          type="button"

                          onClick={() => setRegisterBusinessMode('menu')}

                          className={`rounded-md border px-2 py-2 font-semibold transition ${

                            registerBusinessMode === 'menu'

                              ? 'border-zuri-orange bg-zuri-orange/10 text-zuri-orange'

                              : 'border-gray-200 text-zuri-black/70 hover:border-zuri-orange/40'

                          }`}

                        >

                          Menus

                        </button>

                        <button

                          type="button"

                          onClick={() => setRegisterBusinessMode('shop')}

                          className={`rounded-md border px-2 py-2 font-semibold transition ${

                            registerBusinessMode === 'shop'

                              ? 'border-zuri-orange bg-zuri-orange/10 text-zuri-orange'

                              : 'border-gray-200 text-zuri-black/70 hover:border-zuri-orange/40'

                          }`}

                        >

                          Shops

                        </button>

                        <button

                          type="button"

                          onClick={() => setRegisterBusinessMode('ticketing')}

                          className={`rounded-md border px-2 py-2 font-semibold transition ${

                            registerBusinessMode === 'ticketing'

                              ? 'border-zuri-orange bg-zuri-orange/10 text-zuri-orange'

                              : 'border-gray-200 text-zuri-black/70 hover:border-zuri-orange/40'

                          }`}

                        >

                          Tickets

                        </button>

                      </div>

                    </div>

                  )}



                  <button

                    type="submit"

                    disabled={loading}

                    className="w-full mt-1 py-2 rounded-lg text-sm font-medium border-2 border-zuri-orange text-zuri-orange bg-transparent hover:border-zuri-orange-dark hover:text-zuri-orange-dark transition-colors disabled:opacity-50"

                  >

                    {loading ? 'Please wait…' : (isLogin ? 'Log in' : 'Create account')}

                  </button>

                </form>

              )}



              {!loggedInBusiness && (

                <>

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

                            setRegisterBusinessMode('menu')

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

                            setRegisterBusinessMode('menu')

                          }}

                          className="text-zuri-orange hover:underline font-medium"

                        >

                          Sign in

                        </button>

                      </>

                    )}

                  </p>



                  <Link

                    to="/scan"

                    className="mt-4 inline-flex items-center justify-center w-full py-2 rounded-lg text-sm font-medium border border-gray-200 text-zuri-black/70 hover:border-zuri-orange/40 hover:text-zuri-orange transition-colors"

                  >

                    Ticket scanner

                  </Link>



                  <Link to="/" className="mt-4 inline-block text-sm text-zuri-black/45 hover:text-zuri-orange transition">

                    {'<-'} Back to home

                  </Link>

                </>

              )}

            </div>

          </div>



          {/* Right: visual panel */}

          <div className="hidden lg:block relative min-h-[100dvh] overflow-hidden bg-zuri-black">

            <img

              src="/Order Page (Phone).png"

              alt=""

              className="absolute inset-0 h-full w-full object-cover object-center"

              decoding="async"

              aria-hidden

            />

            <div className="absolute inset-0 bg-gradient-to-br from-zuri-orange/30 via-zuri-black/50 to-zuri-black/90" aria-hidden />

            <div

              className="absolute inset-0 bg-[radial-gradient(circle_at_25%_15%,rgba(255,205,28,0.2),transparent_45%),radial-gradient(circle_at_75%_35%,rgba(255,189,89,0.28),transparent_50%)]"

              aria-hidden

            />



            <div className="relative z-10 flex min-h-[100dvh] items-center justify-center p-10">

              <div className="w-full max-w-md rounded-[26px] border border-white/20 bg-white/10 backdrop-blur-xl p-6 text-white shadow-[0_24px_60px_rgba(0,0,0,0.35)]">

                <p className="text-sm leading-relaxed">

                  “You don&apos;t need more, you need less to manage. ZURI gives your team one clean flow for orders, payments, and growth.”

                </p>

                <p className="text-xs text-zuri-yellow/90 mt-3">ZURI • Built for modern businesses</p>

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


