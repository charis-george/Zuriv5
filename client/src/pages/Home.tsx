import { Link, useLocation } from 'react-router-dom'
import { useState, FormEvent, useEffect, useRef } from 'react'
import { apiUrl } from '../lib/apiBase'
import { organizationJsonLd, usePageSeo, websiteJsonLd } from '../lib/seo'
import { PLAN_PRICES, PLAN_PRICES_YEARLY_AS_MONTHLY, YEARLY_DISCOUNT_PCT, type BillingInterval } from '../types'
import { LazyImage } from '../components/LazyImage'
import { HomeKeyFeatures } from '../components/landing/HomeKeyFeatures'
import { TRANSACTION_FEE_SUMMARY_COPY } from '../lib/transactionFees'

const CONTACT_EMAIL = 'info@zuriqo.com'

function Home(): JSX.Element {
  const location = useLocation()
  const isPricingPage = location.pathname === '/pricing'
  const [showBetaForm, setShowBetaForm] = useState<boolean>(false)
  const [formSource] = useState<'beta' | 'enterprise'>('beta')
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly')
  const [email, setEmail] = useState<string>('')
  const [sending, setSending] = useState<boolean>(false)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)
  const [headerHidden, setHeaderHidden] = useState<boolean>(false)

  const PERFECT_FOR_WORDS = ['Restaurants', 'Concerts', 'Hotels', 'Food halls', 'Pop-ups', 'You']
  const [perfectForIndex, setPerfectForIndex] = useState<number>(0)
  const [perfectForFading, setPerfectForFading] = useState<boolean>(false)
  const perfectForTimeoutRef = useRef<number | null>(null)

  usePageSeo({
    title: isPricingPage
      ? 'ZURI Pricing | AI Menus, Ordering & Ticketing for Venues'
      : 'ZURI | AI-Personalised Menus, Ordering & Ticketing for African Venues',
    description: isPricingPage
      ? 'Compare ZURI plans for AI-assisted menus and storefronts, personalised ordering, events ticketing, Zuri Tap, and Naira payouts for hospitality across Africa.'
      : 'ZURI is the AI-personalised menu, ordering, and ticketing platform for restaurants, hotels, and events in Africa — less guest friction, faster service, payouts to your bank.',
    path: isPricingPage ? '/pricing' : '/',
    jsonLd: [
      organizationJsonLd,
      websiteJsonLd,
      {
        '@context': 'https://schema.org',
        '@type': 'SoftwareApplication',
        name: 'ZURI Quick Order',
        applicationCategory: 'BusinessApplication',
        operatingSystem: 'Web',
        url: 'https://zuriqo.com/',
        image: 'https://zuriqo.com/ZURI.png',
        description: 'AI-personalised menus and storefronts, QR and Tap ordering, events ticketing, payments, and live AI operations for hospitality businesses in Africa.',
        publisher: {
          '@type': 'Organization',
          name: 'ZURI',
          logo: 'https://zuriqo.com/ZURI.png'
        },
        offers: {
          '@type': 'OfferCatalog',
          name: 'ZURI pricing plans',
          itemListElement: [
            { '@type': 'Offer', name: 'Free', price: '0', priceCurrency: 'NGN' },
            { '@type': 'Offer', name: 'Starter', price: '9900', priceCurrency: 'NGN' },
            { '@type': 'Offer', name: 'Growth', price: '24900', priceCurrency: 'NGN' },
            { '@type': 'Offer', name: 'Scale', price: '59900', priceCurrency: 'NGN' }
          ]
        }
      }
    ]
  })

  useEffect(() => {
    if (!isPricingPage) return
    const id = window.setTimeout(() => {
      document.getElementById('pricing')?.scrollIntoView({ block: 'start' })
    }, 0)
    return () => window.clearTimeout(id)
  }, [isPricingPage])

  useEffect(() => {
    const onScroll = (): void => {
      setHeaderHidden(window.scrollY > 56)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const tick = (): void => {
      setPerfectForFading(true)
      if (perfectForTimeoutRef.current) window.clearTimeout(perfectForTimeoutRef.current)
      perfectForTimeoutRef.current = window.setTimeout(() => {
        setPerfectForIndex(i => (i + 1) % PERFECT_FOR_WORDS.length)
        setPerfectForFading(false)
      }, 350)
    }

    const id = window.setInterval(tick, 2200)
    return () => {
      window.clearInterval(id)
      if (perfectForTimeoutRef.current) window.clearTimeout(perfectForTimeoutRef.current)
    }
  }, [])

  const howItWorksRef = useRef<HTMLDivElement>(null)
  const HOW_IT_WORKS_TOTAL_STEPS = 3 as const
  const HOW_IT_WORKS_STEP_MS = 2600 as const
  /** User must have the section in view (~28% visible) and hold for this long before auto-advance starts */
  const HOW_IT_WORKS_DWELL_MS = 1700 as const
  const HOW_IT_WORKS_ENGAGED_RATIO = 0.28 as const
  const howItWorksAutoProgressRef = useRef(0)
  const howItWorksReadyRef = useRef(false)
  const [howItWorksReadyForAuto, setHowItWorksReadyForAuto] = useState(false)
  const [howItWorksAutoStep, setHowItWorksAutoStep] = useState<number>(0)
  const [howItWorksAutoDone, setHowItWorksAutoDone] = useState<boolean>(false)

  useEffect(() => {
    const el = howItWorksRef.current
    if (!el) return

    let dwellTimer: ReturnType<typeof window.setTimeout> | null = null
    const clearDwell = (): void => {
      if (dwellTimer !== null) {
        window.clearTimeout(dwellTimer)
        dwellTimer = null
      }
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (howItWorksReadyRef.current) return
        const engaged = entry.isIntersecting && entry.intersectionRatio >= HOW_IT_WORKS_ENGAGED_RATIO
        if (engaged) {
          if (dwellTimer === null) {
            dwellTimer = window.setTimeout(() => {
              dwellTimer = null
              howItWorksReadyRef.current = true
              setHowItWorksReadyForAuto(true)
            }, HOW_IT_WORKS_DWELL_MS)
          }
        } else {
          clearDwell()
        }
      },
      {
        root: null,
        rootMargin: '0px',
        threshold: [0, 0.1, 0.15, 0.2, 0.25, 0.28, 0.32, 0.38, 0.45, 0.55, 0.7, 1]
      }
    )

    observer.observe(el)
    return () => {
      observer.disconnect()
      clearDwell()
    }
  }, [])

  useEffect(() => {
    if (!howItWorksReadyForAuto) return
    if (howItWorksAutoDone) return

    setHowItWorksAutoStep(0)
    howItWorksAutoProgressRef.current = 0

    let step = 0
    const id = window.setInterval(() => {
      step += 1
      if (step >= HOW_IT_WORKS_TOTAL_STEPS) {
        window.clearInterval(id)
        setHowItWorksAutoDone(true)
        const pricingEl = document.getElementById('pricing')
        if (pricingEl) pricingEl.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
      setHowItWorksAutoStep(step)
    }, HOW_IT_WORKS_STEP_MS)

    return () => window.clearInterval(id)
  }, [howItWorksReadyForAuto, howItWorksAutoDone])

  const howItWorksSteps = [
    {
      label: 'Step 1',
      title: 'Scan',
      description: 'Guests scan your QR code from their table. The experience opens instantly in browser with no app download.',
      image: '/QR (Laptop).png',
      alt: 'QR code view on a laptop screen',
      phone: true
    },
    {
      label: 'Step 2',
      title: 'Browse your AI-ready menu',
      description: 'Guests see a fast, visual menu or ticket flow — personalised layout, photos on paid plans, and instant updates from your dashboard.',
      image: '/Menu (Laptop).png',
      alt: 'Zuri menu page shown on a laptop',
      phone: true
    },
    {
      label: 'Step 3',
      title: 'Order & pay',
      description: 'Customers confirm payment on their phone while your dashboard receives the order instantly. You focus on service, and payouts go to your bank.',
      image: '/Order Page (Phone).png',
      alt: 'Order submitted page on a phone screen',
      phone: true
    }
  ] as const
  const activeHowItWorksStep = Math.min(HOW_IT_WORKS_TOTAL_STEPS - 1, howItWorksAutoStep)
  const activeHowItWorks = howItWorksSteps[activeHowItWorksStep]

  const howItWorksProgressHeight = `${Math.round(((activeHowItWorksStep + 1) / HOW_IT_WORKS_TOTAL_STEPS) * 100)}%`

  useEffect(() => {
    const nextIdx = (activeHowItWorksStep + 1) % HOW_IT_WORKS_TOTAL_STEPS
    const img = new Image()
    img.src = howItWorksSteps[nextIdx].image
  }, [activeHowItWorksStep])

  const handleBetaSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setSending(true)
    setSubmitMessage(null)
    try {
      const res = await fetch(apiUrl('/api/contact'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: formSource })
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.success) {
        setSubmitMessage('Thanks for your interest! We\'ll be in touch soon.')
        setEmail('')
        setTimeout(() => { setShowBetaForm(false); setSubmitMessage(null) }, 2000)
        return
      }
      if (res.status === 503 && data.fallbackMailto) {
        const subject = encodeURIComponent(data.subject || `ZURI ${formSource === 'enterprise' ? 'Get in touch' : 'Beta Waitlist'}: ${email}`)
        const body = encodeURIComponent(`Email: ${email}\nSource: ${formSource}`)
        window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
        setSubmitMessage('Your email client will open to send the message to us. Thanks!')
        setEmail('')
        setTimeout(() => { setShowBetaForm(false); setSubmitMessage(null) }, 3000)
        return
      }
      setSubmitMessage(data.error || 'Something went wrong. Please try again.')
    } catch {
      const subject = encodeURIComponent(`ZURI ${formSource === 'enterprise' ? 'Get in touch' : 'Beta Waitlist'}: ${email}`)
      const body = encodeURIComponent(`Email: ${email}\nSource: ${formSource}`)
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
      setSubmitMessage('Your email client will open to send the message to us. Thanks!')
      setEmail('')
      setTimeout(() => { setShowBetaForm(false); setSubmitMessage(null) }, 3000)
    } finally {
      setSending(false)
    }
  }

  return (
      <div className="min-h-screen bg-zuri-light text-zuri-black font-normal antialiased">
      <header className="sticky top-0 z-50 bg-transparent">
        <div
          className={`max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 transition-opacity duration-300 ease-out ${
            headerHidden ? 'opacity-0 pointer-events-none' : 'opacity-100'
          }`}
        >
          <div className="flex items-center justify-between h-10">
            <Link to="/" className="flex items-center gap-2.5 shrink-0">
              <img src="/ZURI.png" alt="ZURI logo" className="h-8 w-auto object-contain" width={120} height={32} decoding="async" fetchPriority="high" />
              <span className="text-[11px] tracking-[0.32em] text-zuri-black uppercase">Z U R I</span>
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              <a
                href="https://api.zuriqo.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-600 hover:text-zuri-orange transition-colors"
              >
                Zuri API
              </a>
              <Link to="/zuri-tap" className="text-sm text-gray-600 hover:text-zuri-orange transition-colors">
                Zuri Tap
              </Link>
              <Link to="/business/login" className="text-sm text-gray-600 hover:text-zuri-orange transition-colors">
                For Businesses
              </Link>
              <Link to="/pricing" className="text-sm text-gray-600 hover:text-zuri-orange transition-colors">
                Pricing
              </Link>
            </nav>
            <div className="flex items-center gap-1.5">
              <a
                href="/business/login"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-zuri-black hover:text-zuri-orange transition-colors px-2 py-1 rounded-md"
              >
                Log in
              </a>
              <Link
                to="/demo"
                className="bg-white text-zuri-black text-[11px] leading-none rounded-md px-2 py-1 border border-zuri-orange hover:bg-zuri-orange hover:text-white transition-colors w-fit whitespace-nowrap"
              >
                Book a Demo
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero — Tsenta-style headline rhythm: eyebrow → stacked lines → one-liner subcopy */}
      <section className="relative pt-20 pb-20 md:pt-28 md:pb-28 overflow-hidden">
        <div className="absolute inset-0 bg-zuri-light" />
        <div className="absolute inset-0 bg-[length:72px_72px] bg-[linear-gradient(to_right,rgba(0,0,0,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.025)_1px,transparent_1px)]" aria-hidden />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[min(90vw,42rem)] h-48 bg-zuri-orange/[0.07] blur-[80px] rounded-full pointer-events-none" aria-hidden />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-[42rem] md:max-w-[48rem] mx-auto">
            <p className="text-[13px] sm:text-sm text-gray-500 font-medium tracking-wide mb-8 md:mb-10">
              AI menus · Smart ordering · Events ticketing
            </p>
            <h1 className="text-zuri-black font-medium tracking-[-0.045em] leading-[1.02] text-[2.75rem] sm:text-6xl md:text-7xl lg:text-8xl lg:leading-[0.98]">
              <span className="block">Personalise every guest journey,</span>
              <span className="block mt-1 sm:mt-2 md:mt-3 text-zuri-orange">from menu to payout.</span>
            </h1>
            <p className="mt-10 md:mt-12 text-base sm:text-lg md:text-xl text-gray-600 font-normal leading-relaxed max-w-md md:max-w-lg mx-auto">
              ZURI pairs AI-assisted menus and storefronts with lightning-fast ordering and ticketing
            </p>
            <div className="mt-12 md:mt-14 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/business/login"
                className="inline-flex items-center justify-center bg-zuri-black text-white text-sm font-medium rounded-full px-7 py-3 hover:bg-neutral-800 transition-colors"
              >
                Get started
              </Link>
              <Link
                to="/pricing"
                className="inline-flex items-center gap-2 text-sm font-medium rounded-full px-7 py-3 text-zuri-black border border-gray-300 bg-white/80 hover:border-zuri-orange hover:text-zuri-orange transition-colors"
              >
                View pricing
                <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>
          </div>
          {/* Hero visual: phone + QR scan + order/payment */}
          <div className="mt-20 md:mt-24 lg:mt-28 flex justify-center">
            <div className="relative w-full max-w-2xl flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12">
              <div className="relative">
                <div className="w-44 md:w-52 h-[280px] md:h-[320px] rounded-[2.5rem] bg-zuri-black border-[10px] border-zuri-black flex flex-col overflow-hidden">
                  <div className="h-8 bg-zuri-black flex items-end justify-center pb-2">
                    <div className="w-20 h-1.5 rounded-full bg-gray-700" />
                  </div>
                  <div className="flex-1 bg-gradient-to-b from-zuri-orange/90 to-zuri-orange-dark p-4 flex flex-col items-center justify-center">
                    <div className="w-20 h-20 rounded-2xl bg-white/95 flex items-center justify-center mb-3 shadow-inner">
                      <svg className="w-10 h-10 text-zuri-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                    </div>
                    <p className="text-white font-medium text-sm text-center">Open · Order · Tickets</p>
                    <p className="text-white/80 text-xs">AI-ready guest link</p>
                  </div>
                </div>
                <div className="absolute -top-2 -right-2 w-16 h-16 rounded-2xl bg-zuri-yellow flex items-center justify-center border border-white transform rotate-12">
                  <svg className="w-8 h-8 text-zuri-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <div className="bg-white rounded-2xl border border-gray-200/90 p-5 shadow-sm">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0">
                      <img
                        src="/ZURI.png"
                        alt=""
                        className="h-6 w-auto max-h-6 object-contain"
                        aria-hidden
                      />
                    </div>
                    <div>
                      <p className="font-medium text-zuri-black text-sm">Smart storefront</p>
                      <p className="text-xs text-gray-500">Menu or ticketing · One link</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-zuri-orange/10 rounded-xl p-3 border border-zuri-orange/20">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Assist</p>
                      <p className="text-xl font-medium text-zuri-orange tabular-nums">On</p>
                      <p className="text-xs text-gray-500">Signals</p>
                    </div>
                    <div className="bg-zuri-light rounded-xl p-3 border border-zuri-yellow/40">
                      <p className="text-xs text-gray-500 uppercase tracking-wide">Payout</p>
                      <p className="text-sm font-medium text-zuri-black leading-tight">Bank account</p>
                      <p className="text-xs text-green-700 font-medium">Ready</p>
                    </div>
                  </div>
                </div>
                <div className="bg-zuri-black rounded-2xl p-4 flex items-center gap-3 border border-white/10">
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-zuri-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                  </div>
                  <div>
                    <p className="text-white font-medium text-sm">Zuri Tap + cards</p>
                    <p className="text-gray-400 text-xs">Guests check out in seconds</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Intro — same rhythm as hero */}
      <section className="relative py-20 md:py-28 bg-white overflow-hidden">
        <div className="absolute inset-0 bg-[length:72px_72px] bg-[linear-gradient(to_right,rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.02)_1px,transparent_1px)] pointer-events-none" aria-hidden />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative">
          <p className="text-[13px] sm:text-sm text-gray-500 font-medium tracking-wide mb-8 md:mb-10">
            For your business
          </p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium text-zuri-black tracking-[-0.035em] leading-[1.08] mb-8 md:mb-10">
            <span className="block">Less friction at the table,</span>
            <span className="block mt-1 sm:mt-2 md:mt-3 text-zuri-orange">more flow at the back.</span>
          </h2>
          <p className="text-base sm:text-lg text-gray-600 font-normal leading-relaxed max-w-xl mx-auto">
            Bring the polish of global hospitality tech to your venue — with local payouts, ticketing, and AI copilots your
            team can trust.
          </p>
        </div>
      </section>

      <HomeKeyFeatures />

      {/* Feature cards — operations */}
      <section className="relative py-16 md:py-24 bg-zuri-light overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[min(90vw,40rem)] h-40 bg-zuri-orange/[0.06] blur-[72px] rounded-full pointer-events-none" aria-hidden />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="grid md:grid-cols-2 gap-5 md:gap-6">
            <div className="bg-white rounded-2xl p-8 md:p-10 border border-gray-200/90 shadow-sm">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-zuri-yellow/90 to-zuri-orange flex items-center justify-center mb-6">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <h3 className="text-lg md:text-xl font-medium text-zuri-black tracking-tight mb-3">One hub for orders &amp; payouts</h3>
              <p className="text-gray-600 text-sm md:text-base leading-relaxed mb-6 font-normal">
                QR, Tap, or ticketing — every basket lands in the same operations view with real-time status and Naira-ready
                settlement workflows.
              </p>
              <Link to="/scan" className="inline-flex items-center gap-2 text-sm font-medium rounded-full bg-zuri-black text-white px-6 py-2.5 hover:bg-neutral-800 transition-colors">
                See the guest flow
                <svg className="w-4 h-4 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>
            <div className="bg-zuri-black text-white rounded-2xl p-8 md:p-10 border border-white/10">
              <div className="w-11 h-11 rounded-xl bg-white/10 flex items-center justify-center mb-6">
                <svg className="w-5 h-5 text-zuri-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 13H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium tracking-tight mb-3">Built for Africa&apos;s front-of-house reality</h3>
              <p className="text-gray-400 text-sm leading-relaxed font-normal">
                Peak-hour noise, shared tables, events with thousands of guests — ZURI is designed for the pace of African
                cities while keeping reconciliation simple for finance teams.
              </p>
            </div>
          </div>
          <div className="mt-5 rounded-2xl border border-gray-200/90 bg-white/80 px-6 py-6 md:px-8 md:py-7 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h3 className="text-base md:text-lg font-medium text-zuri-black tracking-tight mb-1">Plans that scale with your AI ambition</h3>
              <p className="text-gray-600 text-sm leading-relaxed font-normal">
                From free menus to analytics and Zuri Assist — upgrade to Scale when you want full ops AI and a guest menu tuned for African languages and local taste.
              </p>
            </div>
            <Link to="/pricing" className="shrink-0 inline-flex items-center gap-2 text-sm font-medium rounded-full border border-gray-300 text-zuri-black px-6 py-2.5 hover:border-zuri-orange hover:text-zuri-orange transition-colors">
              View pricing
              <svg className="w-4 h-4 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Perfect for */}
      <section className="py-16 md:py-24 bg-white border-y border-gray-200/80">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-[13px] sm:text-sm text-gray-500 font-medium tracking-wide mb-10 md:mb-12">Built for</p>
          <p className="leading-[1.05] tracking-[-0.03em]">
            <span className="text-zuri-black font-medium text-4xl sm:text-5xl md:text-6xl lg:text-7xl">
              Perfect for{' '}
            </span>
            <span
              className={`text-zuri-orange font-medium text-4xl sm:text-5xl md:text-6xl lg:text-7xl inline-block transition-all duration-300 ${
                perfectForFading ? 'opacity-0 translate-y-1' : 'opacity-100 translate-y-0'
              }`}
            >
              {PERFECT_FOR_WORDS[perfectForIndex]}
            </span>
          </p>
        </div>
      </section>

      {/* How It Works - Screenshot-led story */}
      <section ref={howItWorksRef} className="relative py-20 md:py-28 bg-zuri-light overflow-hidden">
        <div className="absolute inset-0 bg-[length:72px_72px] bg-[linear-gradient(to_right,rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.02)_1px,transparent_1px)] pointer-events-none" aria-hidden />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-2xl mx-auto text-center mb-16 md:mb-20">
            <p className="text-[13px] sm:text-sm text-gray-500 font-medium tracking-wide mb-8 md:mb-10">Simple flow</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium text-zuri-black tracking-[-0.035em] leading-[1.08] mb-6 md:mb-8">
              How it works
            </h2>
            <p className="text-base sm:text-lg text-gray-600 font-normal leading-relaxed">
              Three steps from guest link to payout — menu or tickets.
            </p>
          </div>
          <div className="relative">
            <div className="hidden md:grid md:grid-cols-[minmax(0,1fr),minmax(0,1.08fr)] gap-10">
              <div className="relative">
                <div className="pr-6">
                  <div className="absolute left-0 top-0 bottom-0 w-px bg-zuri-orange/20" />
                  <div
                    className="absolute left-0 top-0 w-px bg-zuri-orange transition-[height] duration-300"
                    style={{ height: howItWorksProgressHeight }}
                  />
                  <div className="space-y-20 md:space-y-24 pl-6">
                    {howItWorksSteps.map((step, idx) => {
                      const isActive = idx === activeHowItWorksStep
                      return (
                        <div
                          key={step.title}
                          className={`transition-all duration-500 ${
                            isActive ? 'opacity-100 translate-y-0' : 'opacity-40 translate-y-2'
                          }`}
                        >
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{step.label}</span>
                          <h3 className="text-xl md:text-2xl font-medium text-zuri-black tracking-tight mt-2 mb-3">{step.title}</h3>
                          <p className="text-gray-600 text-sm md:text-base leading-relaxed font-normal">{step.description}</p>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="relative">
                <div className="relative h-[420px] lg:h-[480px] rounded-3xl overflow-hidden sticky top-24">
                  <div className="absolute inset-0 flex items-center justify-center p-4">
                    <LazyImage
                      key={activeHowItWorks.image}
                      src={activeHowItWorks.image}
                      alt={activeHowItWorks.alt}
                      className="w-auto max-h-[380px] lg:max-h-[440px] object-contain mx-auto drop-shadow-[0_20px_34px_rgba(0,0,0,0.22)]"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="md:hidden space-y-7">
              {howItWorksSteps.map((step) => (
                <article key={step.title} className="bg-white border border-gray-200/90 rounded-2xl p-6 shadow-sm">
                  <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{step.label}</span>
                  <h3 className="text-xl font-medium text-zuri-black tracking-tight mt-2 mb-3">{step.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed mb-4 font-normal">{step.description}</p>
                  <div className="overflow-hidden rounded-xl">
                    <LazyImage
                      src={step.image}
                      alt={step.alt}
                      className="w-auto max-h-[340px] mx-auto object-contain"
                    />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Pricing - Orange accent with staggered cards */}
      <section
        id="pricing"
        className="relative py-20 md:py-28 bg-white overflow-hidden scroll-mt-24"
      >
        <div className="absolute inset-0 bg-[length:72px_72px] bg-[linear-gradient(to_right,rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.02)_1px,transparent_1px)] pointer-events-none" aria-hidden />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="max-w-2xl mx-auto text-center mb-14 md:mb-16">
            <p className="text-[13px] sm:text-sm text-gray-500 font-medium tracking-wide mb-8 md:mb-10">Plans</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium text-zuri-black tracking-[-0.035em] leading-[1.08] mb-6 md:mb-8">
              Simple, transparent pricing
            </h2>
            <p className="text-base sm:text-lg text-gray-600 font-normal leading-relaxed">
              Choose what fits your business. No hidden fees.
            </p>
            <div className="flex justify-center mt-10">
              <div
                className="inline-flex rounded-full border border-gray-200 bg-zuri-light/80 p-1 gap-1"
                role="group"
                aria-label="Billing period"
              >
                <button
                  type="button"
                  onClick={() => setBillingInterval('monthly')}
                  className={`px-5 py-2 text-sm font-medium rounded-full transition-colors ${
                    billingInterval === 'monthly'
                      ? 'bg-zuri-black text-white'
                      : 'text-gray-500 hover:text-zuri-black'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingInterval('yearly')}
                  className={`px-5 py-2 text-sm font-medium rounded-full transition-colors ${
                    billingInterval === 'yearly'
                      ? 'bg-zuri-black text-white'
                      : 'text-gray-500 hover:text-zuri-black'
                  }`}
                >
                  Yearly
                  <span className="ml-1.5 text-xs opacity-80">({YEARLY_DISCOUNT_PCT}% off)</span>
                </button>
              </div>
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
            {/* Free */}
            <div
              className="bg-white rounded-2xl p-6 border border-gray-200 flex flex-col"
              style={{ transitionDelay: '40ms' }}
            >
              <div className="text-center mb-6">
                <h3 className="text-lg font-medium text-zuri-black">Free</h3>
                <p className="text-2xl font-medium text-zuri-black mt-2 tabular-nums tracking-tight">₦0</p>
                <p className="text-sm text-gray-500 mt-1">Forever</p>
              </div>
              <ul className="space-y-3 text-sm text-gray-700 flex-1">
                <li className="flex items-start">
                  <span className="text-zuri-yellow mr-2">✓</span>
                  QR code &amp; text menu — guests order in browser
                </li>
                <li className="flex items-start">
                  <span className="text-zuri-yellow mr-2">✓</span>
                  Orders &amp; payments to your bank
                </li>
                <li className="flex items-start text-gray-400">
                  <span className="mr-2">✗</span>
                  No business logo or menu photos
                </li>
                <li className="flex items-start text-gray-400">
                  <span className="mr-2">✗</span>
                  No analytics dashboard
                </li>
                <li className="flex items-start text-gray-400">
                  <span className="mr-2">✗</span>
                  No Zuri Tap or storefront themes
                </li>
              </ul>
              <Link to="/business/login" className="mt-6 flex justify-center">
                <span className="bg-white text-zuri-black py-1.5 rounded-md text-xs border border-zuri-orange hover:bg-zuri-orange hover:text-white transition px-3 inline-block">
                  Get Started
                </span>
              </Link>
            </div>

            {/* Starter */}
            <div
              className="bg-white rounded-2xl p-6 border border-green-400 flex flex-col"
              style={{ transitionDelay: '120ms' }}
            >
              <div className="text-center mb-6">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500 mb-2" aria-hidden />
                <h3 className="text-lg font-medium text-zuri-black">Starter</h3>
                <p className="text-2xl font-medium text-zuri-black mt-2 tabular-nums tracking-tight">
                  {billingInterval === 'monthly' ? PLAN_PRICES.starter : PLAN_PRICES_YEARLY_AS_MONTHLY.starter}
                </p>
                <p className="text-sm text-gray-500 mt-1">/month</p>
              </div>
              <ul className="space-y-3 text-sm text-gray-700 flex-1">
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  Menu item photos &amp; business logo
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  QR ordering, orders &amp; payouts (same as Free)
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  Default customer storefront (no theme editor)
                </li>
                <li className="flex items-start text-gray-400">
                  <span className="mr-2">✗</span>
                  No analytics dashboard
                </li>
                <li className="flex items-start text-gray-400">
                  <span className="mr-2">✗</span>
                  No Zuri Tap, customizer, or CSV import
                </li>
              </ul>
              <div className="mt-4 flex justify-center">
                <Link
                  to={`/subscribe/starter?interval=${billingInterval}&autopay=1`}
                  className="bg-white text-zuri-black py-1.5 rounded-md text-xs border border-zuri-orange hover:bg-zuri-orange hover:text-white transition px-3"
                >
                  Get Starter
                </Link>
              </div>
            </div>

            {/* Growth */}
            <div className="bg-white rounded-2xl p-6 border border-blue-400 flex flex-col">
              <div className="text-center mb-6">
                <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mb-2" aria-hidden />
                <h3 className="text-lg font-medium text-zuri-black">Growth</h3>
                <p className="text-2xl font-medium text-zuri-black mt-2 tabular-nums tracking-tight">
                  {billingInterval === 'monthly' ? PLAN_PRICES.growth : PLAN_PRICES_YEARLY_AS_MONTHLY.growth}
                </p>
                <p className="text-sm text-gray-500 mt-1">/month</p>
              </div>
              <ul className="space-y-3 text-sm text-gray-700 flex-1">
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">✓</span>
                  Analytics: sales, trends, popular items &amp; peak hours
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">✓</span>
                  Profit margins (when you add item costs)
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">✓</span>
                  Storefront customizer (layout, colours, hero)
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">✓</span>
                  Zuri Tap — pay-by-code for saved-card customers
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">✓</span>
                  Zuri Assist on the guest menu — trending, upsells, taste sort, Hausa · Yorùbá · Igbo
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">✓</span>
                  Everything in Starter (photos, logo, QR orders)
                </li>
              </ul>
              <div className="mt-4 flex justify-center">
                <Link
                  to={`/subscribe/growth?interval=${billingInterval}&autopay=1`}
                  className="bg-white text-zuri-black py-1.5 rounded-md text-xs border border-zuri-orange hover:bg-zuri-orange hover:text-white transition px-3"
                >
                  Get Growth
                </Link>
              </div>
            </div>

            {/* Scale flagship tier */}
            <div
              className="bg-zuri-black text-white rounded-2xl p-6 border border-purple-400 flex flex-col relative scale-[1.02]"
              style={{ transitionDelay: '280ms' }}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-zuri-yellow text-zuri-black text-xs font-semibold px-2.5 py-0.5 rounded-lg">
                Recommended
              </div>
              <div className="text-center mb-6">
                <span className="inline-block w-3 h-3 rounded-full bg-purple-400 mb-2" aria-hidden />
                <h3 className="text-lg font-medium">Scale</h3>
                <p className="text-2xl font-medium text-zuri-yellow mt-2 tabular-nums tracking-tight">
                  {billingInterval === 'monthly' ? PLAN_PRICES.scale : PLAN_PRICES_YEARLY_AS_MONTHLY.scale}
                </p>
                <p className="text-sm text-gray-400 mt-1">/month</p>
              </div>
              <ul className="space-y-3 text-sm text-gray-300 flex-1">
                <li className="flex items-start">
                  <span className="text-purple-300 mr-2">✓</span>
                  Everything in Growth — including guest AI menu controls
                </li>
                <li className="flex items-start">
                  <span className="text-purple-300 mr-2">✓</span>
                  Zuri Assist — revenue insights, forecasts, promo ideas, CSV import
                </li>
                <li className="flex items-start">
                  <span className="text-purple-300 mr-2">✓</span>
                  Market intelligence — anonymous Zuri network benchmarks
                </li>
                <li className="flex items-start">
                  <span className="text-purple-300 mr-2">✓</span>
                  Live ops — daily briefing, rush signals, slow hours, low-stock flags
                </li>
                <li className="flex items-start">
                  <span className="text-purple-300 mr-2">✓</span>
                  AI storefront regenerations without Growth caps
                </li>
              </ul>
              <div className="mt-4 flex justify-center">
                <Link
                  to={`/subscribe/scale?interval=${billingInterval}&autopay=1`}
                  className="bg-white text-zuri-black py-1.5 rounded-md text-xs border border-zuri-orange hover:bg-zuri-orange hover:text-white transition px-3"
                >
                  Get Scale
                </Link>
              </div>
            </div>

            {/* Enterprise */}            <div
              className="bg-white rounded-2xl p-6 border border-gray-200 flex flex-col"
              style={{ transitionDelay: '360ms' }}
            >
              <div className="text-center mb-6">
                <h3 className="text-lg font-medium text-zuri-black">Enterprise</h3>
                <p className="text-2xl font-medium text-zuri-black mt-2 tracking-tight">Custom</p>
                <p className="text-sm text-gray-500 mt-1">Book a demo</p>
              </div>
              <ul className="space-y-3 text-sm text-gray-700 flex-1">
                <li className="flex items-start">
                  <span className="text-zuri-yellow mr-2">✓</span>
                  Tailored to your business
                </li>
                <li className="flex items-start">
                  <span className="text-zuri-yellow mr-2">✓</span>
                  Dedicated support
                </li>
                <li className="flex items-start">
                  <span className="text-zuri-yellow mr-2">✓</span>
                  Custom integrations
                </li>
                <li className="flex items-start">
                  <span className="text-zuri-yellow mr-2">✓</span>
                  Zuri Tap
                </li>
              </ul>
              <div className="mt-6 flex justify-center">
                <Link
                  to="/demo"
                  className="bg-white text-zuri-black py-1.5 rounded-md text-xs border border-zuri-orange hover:bg-zuri-orange hover:text-white transition px-3"
                >
                  Book a Demo
                </Link>
              </div>
            </div>
          </div>
          <p className="text-center text-gray-500 text-sm font-normal mt-12 max-w-md mx-auto leading-relaxed">
            {TRANSACTION_FEE_SUMMARY_COPY}
          </p>
        </div>
      </section>

      {/* FAQ - Clean cards with soft reveal */}
      <section className="relative py-20 md:py-28 bg-zuri-light overflow-hidden">
        <div className="absolute inset-0 bg-[length:72px_72px] bg-[linear-gradient(to_right,rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.02)_1px,transparent_1px)] pointer-events-none" aria-hidden />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center mb-14 md:mb-16">
            <p className="text-[13px] sm:text-sm text-gray-500 font-medium tracking-wide mb-8 md:mb-10">Support</p>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium text-zuri-black tracking-[-0.035em] leading-[1.08]">
              Frequently asked questions
            </h2>
          </div>
          <div className="space-y-3">
            <div
              className="bg-white rounded-2xl p-6 md:p-7 border border-gray-200/90 shadow-sm"
              style={{ transitionDelay: '40ms' }}
            >
              <h3 className="text-base font-medium text-zuri-black mb-2 tracking-tight">What is ZURI?</h3>
              <p className="text-gray-600 text-sm leading-relaxed font-normal">
                ZURI is an AI-personalised menu, ordering, and ticketing platform for hospitality and events. Guests open your
                link to order food or buy tickets; you operate from one dashboard with payouts to your Nigerian bank.
              </p>
            </div>
            <div
              className="bg-white rounded-2xl p-6 md:p-7 border border-gray-200/90 shadow-sm"
              style={{ transitionDelay: '120ms' }}
            >
              <h3 className="text-base font-medium text-zuri-black mb-2 tracking-tight">Do customers need to download an app?</h3>
              <p className="text-gray-600 text-sm leading-relaxed font-normal">
                No. They scan the QR code with their phone camera and the menu opens in the browser. No app required.
              </p>
            </div>
            <div
              className="bg-white rounded-2xl p-6 md:p-7 border border-gray-200/90 shadow-sm"
              style={{ transitionDelay: '200ms' }}
            >
              <h3 className="text-base font-medium text-zuri-black mb-2 tracking-tight">How do I get paid?</h3>
              <p className="text-gray-600 text-sm leading-relaxed font-normal">
                Add your Nigerian bank account in your dashboard. We verify the account name and pay out to you—no Paystack or gateway setup required.
              </p>
            </div>
            <div
              className="bg-white rounded-2xl p-6 md:p-7 border border-gray-200/90 shadow-sm"
              style={{ transitionDelay: '280ms' }}
            >
              <h3 className="text-base font-medium text-zuri-black mb-2 tracking-tight">Can I customize my menu?</h3>
              <p className="text-gray-600 text-sm leading-relaxed font-normal">
                Yes. Update items, prices, photos (on paid plans), and categories anytime from your dashboard.
              </p>
            </div>
            <div
              className="bg-white rounded-2xl p-6 md:p-7 border border-gray-200/90 shadow-sm"
              style={{ transitionDelay: '360ms' }}
            >
              <h3 className="text-base font-medium text-zuri-black mb-2 tracking-tight">Who is ZURI for?</h3>
              <p className="text-gray-600 text-sm leading-relaxed font-normal">
                Restaurants, cafés, hotels, fast food, bakeries—and you. Simple QR ordering and payments with minimal setup.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="relative py-20 md:py-28 bg-zuri-black text-white overflow-hidden">
        <div className="absolute inset-0 bg-[length:72px_72px] bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] opacity-60" aria-hidden />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(100%,28rem)] h-48 bg-zuri-orange/20 blur-[90px] rounded-full pointer-events-none" aria-hidden />
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <p className="text-[13px] sm:text-sm text-gray-400 font-medium tracking-wide mb-8 md:mb-10">ZURI</p>
          <h2 className="text-3xl sm:text-4xl md:text-5xl font-medium tracking-[-0.035em] leading-[1.08] mb-6 md:mb-8">
            Ready when you are.
          </h2>
          <p className="text-gray-400 text-base sm:text-lg font-normal leading-relaxed mb-10 md:mb-12 max-w-md mx-auto">
            Join venues using ZURI to personalise menus, launch ticketing, and move service lines faster across Africa.
          </p>
          <Link
            to="/business/login"
            className="inline-flex items-center justify-center gap-2 bg-white text-zuri-black text-sm font-medium rounded-full px-8 py-3.5 hover:bg-zuri-yellow transition-colors"
          >
            Get started
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#080808] text-white py-16 md:py-20 border-t border-white/[0.06]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-10 md:gap-12 mb-14">
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-white/10">
                  <img src="/ZURI.png" alt="ZURI logo" className="h-6 w-auto object-contain" />
                </span>
                <span className="text-base font-medium tracking-wide">ZURI</span>
              </div>
              <p className="text-gray-500 text-sm font-normal leading-relaxed">
                Orders and payments for modern businesses.
              </p>
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Product</h4>
              <ul className="space-y-2.5 text-gray-400 text-sm font-normal">
                <li>
                  <a
                    href="https://api.zuriqo.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors"
                  >
                    Zuri API
                  </a>
                </li>
                <li><Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link></li>
                <li><Link to="/waitlist" className="hover:text-white transition-colors">Waitlist</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Company</h4>
              <ul className="space-y-2.5 text-gray-400 text-sm font-normal">
                <li><a href="#" className="hover:text-white transition-colors">About</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Blog</a></li>
                <li><a href="#" className="hover:text-white transition-colors">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-4">Legal</h4>
              <ul className="space-y-2.5 text-gray-400 text-sm font-normal">
                <li><Link to="/privacy" className="hover:text-white transition-colors">Terms &amp; Privacy</Link></li>
                <li><a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white transition-colors">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-white/[0.08] pt-8 text-center">
            <p className="text-gray-500 text-sm font-normal">© 2026 ZURI TECHNOLOGIES LIMITED. All rights reserved.</p>
          </div>
        </div>
      </footer>


      {showBetaForm && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setShowBetaForm(false)}
        >
          <div
            className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full transform animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-medium text-zuri-black tracking-tight">
                {formSource === 'enterprise' ? 'Get in touch' : 'Join the Beta'}
              </h3>
              <button
                onClick={() => setShowBetaForm(false)}
                className="text-gray-400 hover:text-zuri-black transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-gray-600 text-sm leading-relaxed mb-6 font-normal">
              {formSource === 'enterprise'
                ? 'Tell us about your business and we\'ll get back to you.'
                : 'Be among the first businesses to try ZURI. We\'ll be in touch soon!'}
            </p>
            {submitMessage && (
              <p className="mb-4 text-sm text-green-700 bg-green-50 p-3 rounded-lg">{submitMessage}</p>
            )}
            <form onSubmit={handleBetaSubmit}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                disabled={sending}
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-zuri-yellow focus:border-transparent transition disabled:opacity-70"
              />
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => setShowBetaForm(false)}
                  disabled={sending}
                  className="flex-1 px-3 py-2.5 border border-gray-300 rounded-full text-sm font-medium text-gray-700 hover:bg-gray-50 transition disabled:opacity-70"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 px-3 py-2.5 bg-zuri-black text-white rounded-full text-sm font-medium hover:bg-neutral-800 transition disabled:opacity-70"
                >
                  {sending ? 'Sending…' : (formSource === 'enterprise' ? 'Send' : 'Join')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .animate-scaleIn {
          animation: scaleIn 0.2s ease-out;
        }
        .bg-grid-pattern {
          background-image: 
            linear-gradient(to right, rgba(0,0,0,0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0,0,0,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
        }
      `}</style>
    </div>
  )
}

export default Home
