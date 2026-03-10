import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { PLAN_LABELS, type PlanId } from '../types'

const ONBOARDING_KEY = 'zuri_onboarding_done'

type UseCase = 'team' | 'business' | 'side'
type BusinessSize = 'solo' | 'small' | 'medium' | 'large'

const useCases: { id: UseCase; title: string; description: string }[] = [
  { id: 'team', title: 'For my team', description: 'Collaborate on orders, menu, and daily operations together.' },
  { id: 'business', title: 'For my business', description: 'Run your storefront, track orders, and get paid.' },
  { id: 'side', title: 'For a side project', description: 'Keep it simple — one place for menu and payments.' }
]

const businessSizes: { id: BusinessSize; title: string; description: string }[] = [
  { id: 'solo', title: 'Just me', description: 'Solo owner or freelancer' },
  { id: 'small', title: '2–10 people', description: 'Small team or café' },
  { id: 'medium', title: '11–50 people', description: 'Growing business' },
  { id: 'large', title: '50+ people', description: 'Larger operation' }
]

const dashboardHighlights: { title: string; description: string }[] = [
  { title: 'Orders', description: 'See every order in real time and update status as you prepare.' },
  { title: 'Menu', description: 'Add categories and items, set prices, and toggle availability.' },
  { title: 'QR Code', description: 'Download your QR so customers can scan and order from their phone.' },
  { title: 'Payment & pricing', description: 'Add your bank account for payouts and upgrade your plan when ready.' },
  { title: 'Profile', description: 'Business details, logo, Zuri Tap, and password — all in one place.' }
]

function getRecommendedPlan(useCase: UseCase | null, size: BusinessSize | null): PlanId {
  if (!size) return 'free'
  if (size === 'solo' || size === 'small') return 'starter'
  if (size === 'medium') return 'growth'
  return 'pro'
}

function BusinessOnboarding(): JSX.Element {
  const { businessId } = useParams<{ businessId: string }>()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [useCase, setUseCase] = useState<UseCase | null>(null)
  const [businessSize, setBusinessSize] = useState<BusinessSize | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [direction, setDirection] = useState<'in' | 'out'>('in')

  useEffect(() => {
    const token = localStorage.getItem('zuri_business_token')
    if (!token || !businessId) {
      navigate('/business/login', { replace: true })
      return
    }
    if (localStorage.getItem(`${ONBOARDING_KEY}_${businessId}`) === '1') {
      navigate(`/business/dashboard/${businessId}`, { replace: true })
    }
  }, [businessId, navigate])

  useEffect(() => {
    if (step !== 2) return
    const t = setInterval(() => {
      setHighlightIndex(i => (i + 1) % dashboardHighlights.length)
    }, 2200)
    return () => clearInterval(t)
  }, [step])

  const handleNext = (): void => {
    if (step < 4) {
      setDirection('out')
      setTimeout(() => {
        setStep(s => s + 1)
        setDirection('in')
      }, 200)
    } else {
      if (businessId) {
        localStorage.setItem(`${ONBOARDING_KEY}_${businessId}`, '1')
        navigate(`/business/dashboard/${businessId}`, { replace: true })
      }
    }
  }

  const handleBack = (): void => {
    if (step > 0) {
      setDirection('out')
      setTimeout(() => {
        setStep(s => s - 1)
        setDirection('in')
      }, 200)
    }
  }

  const recommendedPlan = getRecommendedPlan(useCase, businessSize)
  const canProceed = (step === 0 && useCase !== null) || (step === 1 && businessSize !== null) || step >= 2

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center py-12 px-4">
      <div
        className={`w-full max-w-2xl transition-all duration-300 ease-out ${
          direction === 'out' ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
        }`}
      >
        {/* Progress */}
        <div className="flex justify-center gap-1.5 mb-10">
          {[0, 1, 2, 3, 4].map(i => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i <= step ? 'w-8 bg-zuri-orange' : 'w-4 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Step 0: How are you planning to use ZURI? */}
        {step === 0 && (
          <div className="animate-fadeIn">
            <h1 className="text-2xl md:text-3xl font-bold text-zuri-black mb-2">
              How are you planning to use ZURI?
            </h1>
            <p className="text-gray-600 mb-8">We&apos;ll tailor your setup experience accordingly.</p>
            <div className="grid gap-4">
              {useCases.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setUseCase(opt.id)}
                  className={`text-left p-5 rounded-2xl border-2 transition-all duration-200 flex items-start gap-4 relative ${
                    useCase === opt.id
                      ? 'border-zuri-orange bg-white shadow-md shadow-orange-100'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-zuri-black">
                    {opt.id === 'team' && (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    )}
                    {opt.id === 'business' && (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    )}
                    {opt.id === 'side' && (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zuri-black">{opt.title}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{opt.description}</p>
                  </div>
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${useCase === opt.id ? 'border-zuri-orange bg-zuri-orange' : 'border-gray-300'}`}>
                    {useCase === opt.id && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Business size */}
        {step === 1 && (
          <div className="animate-fadeIn">
            <h1 className="text-2xl md:text-3xl font-bold text-zuri-black mb-2">
              What&apos;s your business size?
            </h1>
            <p className="text-gray-600 mb-8">We&apos;ll recommend a plan that fits.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              {businessSizes.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBusinessSize(opt.id)}
                  className={`text-left p-5 rounded-2xl border-2 transition-all duration-200 flex items-start gap-3 relative ${
                    businessSize === opt.id
                      ? 'border-zuri-orange bg-white shadow-md shadow-orange-100'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-zuri-black">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zuri-black">{opt.title}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{opt.description}</p>
                  </div>
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${businessSize === opt.id ? 'border-zuri-orange bg-zuri-orange' : 'border-gray-300'}`}>
                    {businessSize === opt.id && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Dashboard guide with live preview */}
        {step === 2 && (
          <div className="animate-fadeIn">
            <h1 className="text-2xl md:text-3xl font-bold text-zuri-black mb-2">
              Your dashboard at a glance
            </h1>
            <p className="text-gray-600 mb-8">See the main areas and how they work, in a live dashboard preview.</p>
            <div className="flex flex-col md:flex-row gap-6 items-stretch">
              <div className="space-y-3 md:w-2/5">
                {dashboardHighlights.map((item, i) => (
                  <div
                    key={item.title}
                    className={`p-4 rounded-2xl border-2 transition-all duration-300 ${
                      i === highlightIndex ? 'border-zuri-orange bg-white shadow-md shadow-orange-100' : 'border-gray-100 bg-white/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${
                        i === highlightIndex ? 'bg-zuri-orange text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-zuri-black">{item.title}</p>
                        <p className="text-sm text-gray-600">{item.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Large dashboard preview */}
              <div className="md:w-3/5 rounded-2xl border border-gray-200 bg-white shadow-md p-4 md:p-6 min-h-[260px] md:min-h-[340px] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Demo restaurant</p>
                    <p className="text-[11px] text-gray-500">ZURI dashboard preview</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="w-2 h-2 rounded-full bg-yellow-400" />
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 overflow-hidden bg-white flex-1 flex flex-col">
                  <div className="flex text-[11px] font-medium border-b border-gray-200">
                    {['Orders', 'Analytics', 'Menu', 'QR Code', 'Payment', 'Profile'].map(label => {
                      const isActive =
                        (label === 'Orders' && dashboardHighlights[highlightIndex].title === 'Orders') ||
                        (label === 'Menu' && dashboardHighlights[highlightIndex].title === 'Menu') ||
                        (label === 'QR Code' && dashboardHighlights[highlightIndex].title === 'QR Code') ||
                        (label === 'Payment' && dashboardHighlights[highlightIndex].title === 'Payment & pricing') ||
                        (label === 'Profile' && dashboardHighlights[highlightIndex].title === 'Profile') ||
                        (label === 'Analytics' && dashboardHighlights[highlightIndex].title === 'Analytics')

                      return (
                        <div
                          key={label}
                          className={`flex-1 px-2.5 py-1.5 text-center cursor-default transition-colors ${
                            isActive
                              ? 'bg-orange-50 text-zuri-orange border-b-2 border-zuri-orange'
                              : 'text-gray-500 hover:text-zuri-black'
                          }`}
                        >
                          {label}
                        </div>
                      )
                    })}
                  </div>
                  <div className="p-3 text-[11px] h-full flex flex-col gap-3">
                    <div className="space-y-2">
                      {/* Orders preview */}
                      <div
                        className={`rounded-lg border px-3 py-2 flex items-center justify-between ${
                          dashboardHighlights[highlightIndex].title === 'Orders'
                            ? 'border-zuri-orange bg-orange-50/60'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-zuri-black text-xs">Order #A24F</p>
                          <p className="text-[11px] text-gray-500">2 items · ₦4,200</p>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 font-medium">
                          preparing
                        </span>
                      </div>

                      {/* Menu preview */}
                      <div
                        className={`rounded-lg border px-3 py-2 flex items-center justify-between ${
                          dashboardHighlights[highlightIndex].title === 'Menu'
                            ? 'border-zuri-orange bg-orange-50/60'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-zuri-black text-xs">Grilled Chicken</p>
                          <p className="text-[11px] text-gray-500">₦3,500 · Available</p>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                          Menu
                        </span>
                      </div>
                    </div>

                    {/* QR / Payment / Profile row */}
                    <div className="grid grid-cols-3 gap-2 mt-auto">
                      <div
                        className={`rounded-lg border px-2 py-1.5 ${
                          dashboardHighlights[highlightIndex].title === 'QR Code'
                            ? 'border-zuri-orange bg-orange-50/60'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <p className="text-[10px] font-semibold text-zuri-black mb-0.5">QR Code</p>
                        <div className="w-10 h-10 bg-gray-200 rounded-md mx-auto" />
                      </div>
                      <div
                        className={`rounded-lg border px-2 py-1.5 ${
                          dashboardHighlights[highlightIndex].title === 'Payment & pricing'
                            ? 'border-zuri-orange bg-orange-50/60'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <p className="text-[10px] font-semibold text-zuri-black mb-0.5">Payment</p>
                        <p className="text-[10px] text-gray-500">Bank · Plans</p>
                      </div>
                      <div
                        className={`rounded-lg border px-2 py-1.5 ${
                          dashboardHighlights[highlightIndex].title === 'Profile'
                            ? 'border-zuri-orange bg-orange-50/60'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <p className="text-[10px] font-semibold text-zuri-black mb-0.5">Profile</p>
                        <p className="text-[10px] text-gray-500 truncate">Logo · Zuri Tap · password</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Pricing recommendation */}
        {step === 3 && (
          <div className="animate-fadeIn">
            <h1 className="text-2xl md:text-3xl font-bold text-zuri-black mb-2">
              Choose your plan
            </h1>
            <p className="text-gray-600 mb-8">
              Based on your answers we suggest <span className="font-semibold text-zuri-black">{PLAN_LABELS[recommendedPlan]}</span>. Or start with Free and upgrade when you&apos;re ready.
            </p>
            <div className="rounded-2xl border-2 border-gray-200 bg-white p-6 mb-6">
              <p className="text-sm text-gray-600 mb-4">Recommended for you: {PLAN_LABELS[recommendedPlan]}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!businessId) return
                    localStorage.setItem(`${ONBOARDING_KEY}_${businessId}`, '1')
                    navigate(`/business/dashboard/${businessId}`, { replace: true })
                  }}
                  className="px-5 py-2.5 rounded-xl font-semibold text-sm bg-zuri-orange text-white hover:bg-zuri-orange-dark transition"
                >
                  Start with Free for now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!businessId) return
                    localStorage.setItem(`${ONBOARDING_KEY}_${businessId}`, '1')
                    navigate(`/subscribe/${recommendedPlan}?interval=monthly`, { replace: true })
                  }}
                  className="px-5 py-2.5 rounded-xl font-semibold text-sm border-2 border-zuri-orange text-zuri-orange hover:bg-orange-50 transition"
                >
                  Go to {PLAN_LABELS[recommendedPlan]}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: You're all set */}
        {step === 4 && (
          <div className="animate-fadeIn text-center">
            <div className="w-16 h-16 rounded-2xl bg-zuri-orange/20 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-zuri-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-zuri-black mb-2">
              You&apos;re all set
            </h1>
            <p className="text-gray-600 mb-8">Head to your dashboard and start taking orders.</p>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between mt-10">
          <button
            type="button"
            onClick={handleBack}
            className={`text-sm font-medium text-gray-500 hover:text-zuri-orange transition ${step === 0 ? 'invisible' : ''}`}
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed && step < 2}
            className="px-6 py-2.5 rounded-xl font-semibold text-sm bg-zuri-orange text-white hover:bg-zuri-orange-dark transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {step === 4 ? 'Go to dashboard' : 'Continue'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.35s ease-out forwards;
        }
      `}</style>
    </div>
  )
}

export default BusinessOnboarding
