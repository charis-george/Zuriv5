import { Link } from 'react-router-dom'
import { useState, FormEvent } from 'react'
import { PLAN_PRICES, PLAN_PRICES_YEARLY_AS_MONTHLY, YEARLY_DISCOUNT_PCT, type BillingInterval } from '../types'

const CONTACT_EMAIL = 'info@zuriqo.com'

function Home(): JSX.Element {
  const [showBetaForm, setShowBetaForm] = useState<boolean>(false)
  const [formSource, setFormSource] = useState<'beta' | 'enterprise'>('beta')
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly')
  const [email, setEmail] = useState<string>('')
  const [sending, setSending] = useState<boolean>(false)
  const [submitMessage, setSubmitMessage] = useState<string | null>(null)

  const openBetaForm = (source: 'beta' | 'enterprise') => {
    setFormSource(source)
    setSubmitMessage(null)
    setShowBetaForm(true)
  }

  const handleBetaSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setSending(true)
    setSubmitMessage(null)
    try {
      const res = await fetch('/api/contact', {
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
      <div className="min-h-screen bg-[#fefbf5]">
      {/* Header - Fintech clean */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center h-full py-2">
              <img src="/ZURI.png" alt="ZURI" className="h-full w-auto object-contain scale-[1.07]" />
            </Link>
            <nav className="hidden md:flex items-center gap-8">
              <Link to="/scan" className="text-sm font-medium text-gray-600 hover:text-zuri-orange transition-colors">
                How it works
              </Link>
              <Link to="/zuri-tap" className="text-sm font-medium text-gray-600 hover:text-zuri-orange transition-colors">
                Zuri Tap
              </Link>
              <Link to="/business/login" className="text-sm font-medium text-gray-600 hover:text-zuri-orange transition-colors">
                For Businesses
              </Link>
              <a href="#pricing" className="text-sm font-medium text-gray-600 hover:text-zuri-orange transition-colors">
                Pricing
              </a>
            </nav>
            <div className="flex items-center gap-4">
              <Link
                to="/business/login"
                className="text-sm font-medium text-zuri-black hover:text-gray-600 transition-colors hidden sm:block"
              >
                Log in
              </Link>
              <button
                onClick={() => openBetaForm('beta')}
                className="bg-zuri-orange text-white text-sm font-semibold rounded-full px-4 py-2 hover:bg-zuri-orange-dark transition-all"
              >
                Sign up
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero - Orange/yellow branded, alive */}
      <section className="relative pt-16 pb-24 md:pt-20 md:pb-32 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-zuri-light via-orange-50/50 to-amber-50/80" />
        <div className="absolute inset-0 bg-[length:64px_64px] bg-[linear-gradient(to_right,rgba(249,115,22,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(249,115,22,0.06)_1px,transparent_1px)]" />
        <div className="absolute top-20 right-0 w-72 h-72 bg-zuri-orange/10 rounded-full blur-3xl -translate-y-1/2" />
        <div className="absolute bottom-20 left-0 w-96 h-96 bg-zuri-yellow/20 rounded-full blur-3xl translate-y-1/2" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-zuri-black tracking-tight leading-[1.1] mb-6">
              One QR. All your orders. Get paid.
            </h1>
            <p className="text-lg md:text-xl text-gray-700 mb-10 leading-relaxed">
              Open a free account in minutes. Let guests scan, order, and pay from their phone—you get paid straight to your bank.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/business/login"
                className="bg-zuri-orange text-white font-semibold text-sm rounded-full px-5 py-2 hover:bg-zuri-orange-dark transition-all shadow-lg shadow-orange-200/50 hover:shadow-orange-300/50"
              >
                Get started
              </Link>
              <a
                href="#pricing"
                className="inline-flex items-center gap-1.5 font-semibold text-sm rounded-full px-5 py-2 bg-white text-zuri-black border-2 border-zuri-orange hover:bg-zuri-orange hover:text-white transition-all"
              >
                View pricing
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </a>
            </div>
          </div>
          {/* Hero visual: phone + QR scan + order/payment */}
          <div className="mt-16 md:mt-20 flex justify-center">
            <div className="relative w-full max-w-2xl flex flex-col md:flex-row items-center justify-center gap-8 md:gap-12">
              <div className="relative">
                <div className="w-44 md:w-52 h-[280px] md:h-[320px] rounded-[2.5rem] bg-zuri-black border-[10px] border-zuri-black shadow-2xl shadow-zuri-black/30 flex flex-col overflow-hidden">
                  <div className="h-8 bg-zuri-black flex items-end justify-center pb-2">
                    <div className="w-20 h-1.5 rounded-full bg-gray-700" />
                  </div>
                  <div className="flex-1 bg-gradient-to-b from-zuri-orange/90 to-zuri-orange-dark p-4 flex flex-col items-center justify-center">
                    <div className="w-20 h-20 rounded-2xl bg-white/95 flex items-center justify-center mb-3 shadow-inner">
                      <svg className="w-10 h-10 text-zuri-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                      </svg>
                    </div>
                    <p className="text-white font-bold text-sm text-center">Scan to order</p>
                    <p className="text-white/80 text-xs">No app needed</p>
                  </div>
                </div>
                <div className="absolute -top-2 -right-2 w-16 h-16 rounded-2xl bg-zuri-yellow flex items-center justify-center shadow-lg border-2 border-white transform rotate-12">
                  <svg className="w-8 h-8 text-zuri-black" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                </div>
              </div>
              <div className="flex flex-col gap-4">
                <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/80 border-2 border-zuri-yellow/40 p-5 transform rotate-[-2deg] hover:rotate-0 transition-transform">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-zuri-yellow to-zuri-orange flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                    </div>
                    <div>
                      <p className="font-bold text-zuri-black">Digital menu & orders</p>
                      <p className="text-xs text-gray-500">Scan QR · Order · Pay</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-orange-50 rounded-xl p-3 border border-orange-100">
                      <p className="text-xs text-gray-500 uppercase">Today</p>
                      <p className="text-xl font-bold text-zuri-orange">₦0</p>
                      <p className="text-xs text-gray-500">Orders</p>
                    </div>
                    <div className="bg-zuri-light rounded-xl p-3 border-2 border-zuri-yellow/50">
                      <p className="text-xs text-gray-500 uppercase">Payout</p>
                      <p className="text-sm font-bold text-zuri-black">Bank account</p>
                      <p className="text-xs text-green-600 font-medium">Ready</p>
                    </div>
                  </div>
                </div>
                <div className="bg-zuri-black rounded-2xl p-4 flex items-center gap-3 transform rotate-[1deg]">
                  <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-zuri-yellow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Pay by card or saved card</p>
                    <p className="text-gray-400 text-xs">You get the order in real time</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Everyday needs - Orange accent */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-medium text-zuri-orange uppercase tracking-wider text-center mb-3">For your business</p>
          <h2 className="text-3xl md:text-4xl font-bold text-zuri-black text-center mb-4">
            Run operations smarter every day
          </h2>
          <p className="text-lg text-gray-600 text-center max-w-2xl mx-auto">
            Track orders and payments in one place. Get payouts to your bank—no payment gateway setup required.
          </p>
        </div>
      </section>

      {/* Feature cards - Orange/yellow, slim CTAs */}
      <section className="py-12 md:py-16 bg-gradient-to-b from-orange-50/50 to-zuri-light">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 bg-white rounded-2xl p-8 border-2 border-orange-100 shadow-sm hover:shadow-lg hover:border-zuri-orange/30 transition-all">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-zuri-yellow to-zuri-orange flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-zuri-black mb-2">Orders & payments in one place</h3>
              <p className="text-gray-600 mb-6">
                Guests scan your QR, browse the menu, and pay from their phone. You see every order and payment in your dashboard—no extra hardware.
              </p>
              <Link to="/scan" className="inline-flex items-center gap-1.5 font-semibold text-sm rounded-full px-4 py-2 bg-zuri-orange text-white hover:bg-zuri-orange-dark transition-colors w-fit">
                How it works
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </Link>
            </div>
            <div className="bg-gradient-to-br from-zuri-black to-gray-900 text-white rounded-2xl p-8 border border-zuri-orange/20 shadow-lg">
              <div className="w-12 h-12 rounded-xl bg-zuri-orange/90 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-2">Analytics & insights</h3>
              <p className="text-gray-300 text-sm">
                Sales trends, popular items, peak hours—so you can run your business with data, not guesswork.
              </p>
            </div>
            <div className="bg-white rounded-2xl p-8 border-2 border-zuri-yellow/40 shadow-sm hover:shadow-lg hover:border-zuri-yellow/70 transition-all">
              <div className="w-12 h-12 rounded-xl bg-zuri-yellow/80 flex items-center justify-center mb-6">
                <svg className="w-6 h-6 text-zuri-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v2m9 0V7a2 2 0 01-2 2H9a2 2 0 01-2-2V9a2 2 0 012-2h2a2 2 0 012 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-zuri-black mb-2">Plans that scale</h3>
              <p className="text-gray-600 text-sm">
                From free to Pro and Zuri AI. Simple pricing, no lock-in. Upgrade when you’re ready.
              </p>
              <a href="#pricing" className="inline-flex items-center gap-1.5 font-semibold text-sm rounded-full px-4 py-2 bg-zuri-orange text-white hover:bg-zuri-orange-dark transition-colors w-fit mt-4">
                View pricing
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
              </a>
            </div>
          </div>
          <div className="mt-6 bg-gradient-to-r from-zuri-orange/10 to-zuri-yellow/10 rounded-2xl p-6 md:p-8 border-2 border-orange-100">
            <h3 className="text-lg font-bold text-zuri-black mb-2">No POS. No fintech devices. No physical menus.</h3>
            <p className="text-gray-700 text-sm">
              We've solved all that. One QR code gives you a digital menu, orders, and payments. Your guests use their phones—you get paid to your bank. No extra hardware, no printed menus to reorder.
            </p>
          </div>
        </div>
      </section>

      {/* Trust strip - Orange accent */}
      <section className="py-10 bg-white border-y border-orange-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-zuri-orange mb-6">Perfect for</p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-gray-700 text-sm font-medium">
            <span>Restaurants</span>
            <span className="text-zuri-orange">·</span>
            <span>Cafés</span>
            <span className="text-zuri-orange">·</span>
            <span>Bars</span>
            <span className="text-zuri-orange">·</span>
            <span>Hotels</span>
            <span className="text-zuri-orange">·</span>
            <span>Fast food</span>
            <span className="text-zuri-orange">·</span>
            <span>Bakeries</span>
          </div>
        </div>
      </section>

      {/* How It Works - Orange/yellow steps */}
      <section className="py-20 md:py-24 bg-gradient-to-b from-white to-orange-50/30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-medium text-zuri-orange uppercase tracking-wider text-center mb-3">Simple flow</p>
          <h2 className="text-3xl md:text-4xl font-bold text-zuri-black text-center mb-4">
            How it works
          </h2>
          <p className="text-lg text-gray-600 text-center max-w-xl mx-auto mb-16">
            Three steps from scan to served.
          </p>
          <div className="grid md:grid-cols-3 gap-10">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-zuri-yellow to-zuri-orange flex items-center justify-center mx-auto mb-5 shadow-lg shadow-orange-200/40">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-zuri-orange uppercase tracking-wider">Step 1</span>
              <h3 className="text-xl font-bold text-zuri-black mt-2 mb-3">Scan</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Guests scan your QR code—no app download. Your digital menu opens instantly.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-zuri-yellow to-zuri-orange flex items-center justify-center mx-auto mb-5 shadow-lg shadow-orange-200/40">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-zuri-orange uppercase tracking-wider">Step 2</span>
              <h3 className="text-xl font-bold text-zuri-black mt-2 mb-3">Order & pay</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Browse menu, add to cart, pay by card or saved card. You get the order in real time.
              </p>
            </div>
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-zuri-yellow to-zuri-orange flex items-center justify-center mx-auto mb-5 shadow-lg shadow-orange-200/40">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <span className="text-xs font-semibold text-zuri-orange uppercase tracking-wider">Step 3</span>
              <h3 className="text-xl font-bold text-zuri-black mt-2 mb-3">Enjoy</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                You focus on food and service. Payouts go to your bank—no payment gateway setup.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing - Orange accent */}
      <section id="pricing" className="py-20 md:py-24 bg-gradient-to-b from-orange-50/30 to-zuri-light">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <p className="text-sm font-medium text-zuri-orange uppercase tracking-wider mb-3">Plans</p>
            <h2 className="text-3xl md:text-4xl font-bold text-zuri-black mb-4">
              Simple, transparent pricing
            </h2>
            <p className="text-lg text-gray-600 max-w-xl mx-auto">
              Choose the plan that fits your business. No hidden fees.
            </p>
            {/* Monthly / Yearly toggle */}
            <div className="flex items-center justify-center gap-4 mt-6">
              <span className={`text-sm font-semibold ${billingInterval === 'monthly' ? 'text-zuri-black' : 'text-gray-400'}`}>Monthly</span>
              <button
                type="button"
                role="switch"
                aria-checked={billingInterval === 'yearly'}
                onClick={() => setBillingInterval(billingInterval === 'monthly' ? 'yearly' : 'monthly')}
                className={`relative inline-flex h-7 w-12 flex-shrink-0 rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-zuri-orange focus:ring-offset-2 ${billingInterval === 'yearly' ? 'bg-zuri-orange' : 'bg-gray-200'}`}
              >
                <span className={`pointer-events-none inline-block h-6 w-5 transform rounded-full bg-white shadow ring-0 transition ${billingInterval === 'yearly' ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className={`text-sm font-semibold ${billingInterval === 'yearly' ? 'text-zuri-black' : 'text-gray-400'}`}>Yearly</span>
              {billingInterval === 'yearly' && (
                <span className="text-sm text-green-600 font-medium">Save {YEARLY_DISCOUNT_PCT}%</span>
              )}
            </div>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-6 gap-6">
            {/* Free */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200 flex flex-col">
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-zuri-black">Free</h3>
                <p className="text-2xl font-bold text-zuri-black mt-2">₦0</p>
                <p className="text-sm text-gray-500 mt-1">Forever</p>
              </div>
              <ul className="space-y-3 text-sm text-gray-700 flex-1">
                <li className="flex items-start">
                  <span className="text-zuri-yellow mr-2">✓</span>
                  QR code & digital menu
                </li>
                <li className="flex items-start">
                  <span className="text-zuri-yellow mr-2">✓</span>
                  Orders management
                </li>
                <li className="flex items-start text-gray-400">
                  <span className="mr-2">✗</span>
                  No deep analytics
                </li>
                <li className="flex items-start text-gray-400">
                  <span className="mr-2">✗</span>
                  No menu images
                </li>
                <li className="flex items-start text-gray-400">
                  <span className="mr-2">✗</span>
                  No Zuri Tap
                </li>
              </ul>
              <Link to="/business/login" className="mt-6 flex justify-center">
                <span className="bg-gray-100 text-zuri-black py-2.5 rounded-full font-semibold text-sm hover:bg-gray-200 transition px-6 inline-block">Get Started</span>
              </Link>
            </div>

            {/* Starter – green */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-green-400 flex flex-col">
              <div className="text-center mb-6">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500 mb-2" aria-hidden />
                <h3 className="text-xl font-bold text-zuri-black">Starter</h3>
                <p className="text-2xl font-bold text-zuri-black mt-2">
                  {billingInterval === 'monthly' ? PLAN_PRICES.starter : PLAN_PRICES_YEARLY_AS_MONTHLY.starter}
                </p>
                <p className="text-sm text-gray-500 mt-1">/month</p>
              </div>
              <ul className="space-y-3 text-sm text-gray-700 flex-1">
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  Basic storefront
                </li>
                <li className="flex items-start">
                  <span className="text-green-500 mr-2">✓</span>
                  Orders
                </li>
                <li className="flex items-start text-gray-400">
                  <span className="mr-2">✗</span>
                  No deep analytics
                </li>
                <li className="flex items-start text-gray-400">
                  <span className="mr-2">✗</span>
                  Limited uploads
                </li>
                <li className="flex items-start text-gray-400">
                  <span className="mr-2">✗</span>
                  No Zuri Tap
                </li>
              </ul>
              <div className="mt-4 flex justify-center">
                <Link
                  to={`/subscribe/starter?interval=${billingInterval}`}
                  className="bg-green-600 text-white py-2.5 rounded-full font-semibold text-sm hover:bg-green-700 transition px-6"
                >
                  Get Starter
                </Link>
              </div>
            </div>

            {/* Growth – blue */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-blue-400 flex flex-col">
              <div className="text-center mb-6">
                <span className="inline-block w-3 h-3 rounded-full bg-blue-500 mb-2" aria-hidden />
                <h3 className="text-xl font-bold text-zuri-black">Growth</h3>
                <p className="text-2xl font-bold text-zuri-black mt-2">
                  {billingInterval === 'monthly' ? PLAN_PRICES.growth : PLAN_PRICES_YEARLY_AS_MONTHLY.growth}
                </p>
                <p className="text-sm text-gray-500 mt-1">/month</p>
              </div>
              <ul className="space-y-3 text-sm text-gray-700 flex-1">
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">✓</span>
                  Full analytics
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">✓</span>
                  Menu images
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">✓</span>
                  Order management
                </li>
                <li className="flex items-start">
                  <span className="text-blue-500 mr-2">✓</span>
                  Zuri Tap
                </li>
              </ul>
              <div className="mt-4 flex justify-center">
                <Link
                  to={`/subscribe/growth?interval=${billingInterval}`}
                  className="bg-blue-600 text-white py-2.5 rounded-full font-semibold text-sm hover:bg-blue-700 transition px-6"
                >
                  Get Growth
                </Link>
              </div>
            </div>

            {/* Pro – purple, Recommended */}
            <div className="bg-zuri-black text-white rounded-2xl shadow-xl p-6 border-2 border-purple-400 flex flex-col relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-zuri-yellow text-zuri-black text-xs font-bold px-3 py-1 rounded-full">
                Recommended
              </div>
              <div className="text-center mb-6">
                <span className="inline-block w-3 h-3 rounded-full bg-purple-400 mb-2" aria-hidden />
                <h3 className="text-xl font-bold">Pro</h3>
                <p className="text-2xl font-bold text-zuri-yellow mt-2">
                  {billingInterval === 'monthly' ? PLAN_PRICES.pro : PLAN_PRICES_YEARLY_AS_MONTHLY.pro}
                </p>
                <p className="text-sm text-gray-400 mt-1">/month</p>
              </div>
              <ul className="space-y-3 text-sm text-gray-300 flex-1">
                <li className="flex items-start">
                  <span className="text-purple-300 mr-2">✓</span>
                  Premium analytics
                </li>
                <li className="flex items-start">
                  <span className="text-purple-300 mr-2">✓</span>
                  Ticketing fee options
                </li>
                <li className="flex items-start">
                  <span className="text-purple-300 mr-2">✓</span>
                  Advanced reporting
                </li>
                <li className="flex items-start">
                  <span className="text-purple-300 mr-2">✓</span>
                  Zuri Tap
                </li>
              </ul>
              <div className="mt-4 flex justify-center">
                <Link
                  to={`/subscribe/pro?interval=${billingInterval}`}
                  className="bg-zuri-yellow text-zuri-black py-2.5 rounded-full font-semibold text-sm hover:bg-yellow-400 transition px-6"
                >
                  Get Pro
                </Link>
              </div>
            </div>

            {/* Zuri AI – red */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border-2 border-red-400 flex flex-col">
              <div className="text-center mb-6">
                <span className="inline-block w-3 h-3 rounded-full bg-red-500 mb-2" aria-hidden />
                <h3 className="text-xl font-bold text-zuri-black">Zuri AI</h3>
                <p className="text-2xl font-bold text-zuri-black mt-2">
                  {billingInterval === 'monthly' ? PLAN_PRICES.zuri_plus : PLAN_PRICES_YEARLY_AS_MONTHLY.zuri_plus}
                </p>
                <p className="text-sm text-gray-500 mt-1">/month</p>
              </div>
              <ul className="space-y-3 text-sm text-gray-700 flex-1">
                <li className="flex items-start">
                  <span className="text-red-500 mr-2">✓</span>
                  AI insights
                </li>
                <li className="flex items-start">
                  <span className="text-red-500 mr-2">✓</span>
                  Optimization
                </li>
                <li className="flex items-start">
                  <span className="text-red-500 mr-2">✓</span>
                  Forecasting
                </li>
                <li className="flex items-start">
                  <span className="text-red-500 mr-2">✓</span>
                  Storefront intelligence
                </li>
                <li className="flex items-start">
                  <span className="text-red-500 mr-2">✓</span>
                  Zuri Tap
                </li>
              </ul>
              <div className="mt-4 flex justify-center">
                <Link
                  to={`/subscribe/zuri_plus?interval=${billingInterval}`}
                  className="bg-red-600 text-white py-2.5 rounded-full font-semibold text-sm hover:bg-red-700 transition px-6"
                >
                  Get Zuri AI
                </Link>
              </div>
            </div>

            {/* Enterprise */}
            <div className="bg-white rounded-2xl shadow-lg p-6 border border-gray-200 flex flex-col">
              <div className="text-center mb-6">
                <h3 className="text-xl font-bold text-zuri-black">Enterprise</h3>
                <p className="text-2xl font-bold text-zuri-black mt-2">Custom</p>
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
              <div className="mt-6 flex justify-center"><button onClick={() => openBetaForm('enterprise')} className="bg-zuri-black text-white py-2.5 rounded-full font-semibold text-sm hover:bg-gray-800 transition px-6">Get in touch</button></div>
            </div>
          </div>
          <p className="text-center text-gray-500 text-sm mt-10">
            A 2.5% transaction fee applies on every customer purchase.
          </p>
        </div>
      </section>

      {/* FAQ - Clean cards */}
      <section className="py-20 md:py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-sm font-medium text-zuri-orange uppercase tracking-wider text-center mb-3">Support</p>
          <h2 className="text-3xl md:text-4xl font-bold text-zuri-black text-center mb-14">
            Frequently asked questions
          </h2>
          <div className="space-y-4">
            <div className="bg-orange-50/50 rounded-xl p-6 border border-orange-100">
              <h3 className="text-lg font-bold text-zuri-black mb-2">What is ZURI?</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                ZURI is a QR-based ordering and payments platform. Guests scan a code to open your menu, order, and pay from their phone. You get orders in real time and payouts to your bank.
              </p>
            </div>
            <div className="bg-orange-50/50 rounded-xl p-6 border border-orange-100">
              <h3 className="text-lg font-bold text-zuri-black mb-2">Do customers need to download an app?</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                No. They scan the QR code with their phone camera and the menu opens in the browser. No app required.
              </p>
            </div>
            <div className="bg-orange-50/50 rounded-xl p-6 border border-orange-100">
              <h3 className="text-lg font-bold text-zuri-black mb-2">How do I get paid?</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Add your Nigerian bank account in your dashboard. We verify the account name and pay out to you—no Paystack or gateway setup required.
              </p>
            </div>
            <div className="bg-orange-50/50 rounded-xl p-6 border border-orange-100">
              <h3 className="text-lg font-bold text-zuri-black mb-2">Can I customize my menu?</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Yes. Update items, prices, photos (on paid plans), and categories anytime from your dashboard.
              </p>
            </div>
            <div className="bg-orange-50/50 rounded-xl p-6 border border-orange-100">
              <h3 className="text-lg font-bold text-zuri-black mb-2">Who is ZURI for?</h3>
              <p className="text-gray-600 text-sm leading-relaxed">
                Restaurants, cafés, bars, hotels, fast food, bakeries—any business that wants simple QR ordering and payments with minimal setup.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA - Orange gradient strip */}
      <section className="py-20 md:py-24 bg-gradient-to-r from-zuri-orange via-orange-500 to-zuri-orange-dark text-white relative overflow-hidden">
        <div className="absolute inset-0 bg-[length:48px_48px] bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)]" />
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            Ready to get started?
          </h2>
          <p className="text-white/90 mb-8">
            Join businesses already using ZURI for orders and payments.
          </p>
          <Link
            to="/business/login"
            className="inline-block bg-white text-zuri-orange font-semibold text-sm rounded-full px-6 py-2.5 hover:bg-zuri-light transition-all shadow-lg"
          >
            Get started
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#0a0a0a] text-white py-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-10 mb-12">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <img src="/ZURI.png" alt="ZURI" className="h-9 w-auto object-contain" />
                <span className="text-lg font-bold">ZURI</span>
              </div>
              <p className="text-gray-500 text-sm">
                Orders and payments for modern businesses.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Product</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><Link to="/scan" className="hover:text-zuri-yellow transition">How It Works</Link></li>
                <li><a href="#pricing" className="hover:text-zuri-yellow transition">Pricing</a></li>
                <li><a href="#" className="hover:text-zuri-yellow transition">Features</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#" className="hover:text-zuri-yellow transition">About</a></li>
                <li><a href="#" className="hover:text-zuri-yellow transition">Blog</a></li>
                <li><a href="#" className="hover:text-zuri-yellow transition">Careers</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                <li><a href="#" className="hover:text-zuri-yellow transition">Terms of Service</a></li>
                <li><a href="#" className="hover:text-zuri-yellow transition">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-zuri-yellow transition">Contact Us</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center">
            <p className="text-gray-400 text-sm">© 2025 ZURI. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Beta / Contact Form Modal */}
      {showBetaForm && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn"
          onClick={() => setShowBetaForm(false)}
        >
          <div 
            className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl transform animate-scaleIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-zuri-black">
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
            <p className="text-gray-700 mb-6">
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
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl font-semibold hover:bg-gray-50 transition disabled:opacity-70"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending}
                  className="flex-1 px-4 py-3 bg-zuri-black text-white rounded-xl font-semibold hover:bg-gray-800 transition shadow-lg disabled:opacity-70"
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
