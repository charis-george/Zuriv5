import { Link } from 'react-router-dom'
import { useState } from 'react'
import {
  PLAN_PRICES,
  PLAN_PRICES_YEARLY_AS_MONTHLY,
  YEARLY_DISCOUNT_PCT,
  type BillingInterval
} from '../types'
import { organizationJsonLd, usePageSeo } from '../lib/seo'
import { formatModeTransactionFee } from '../lib/transactionFees'

type FaqItem = { q: string; a: string }

const FAQ_GENERAL: FaqItem[] = [
  {
    q: 'How do I create an account?',
    a: 'Go to Business login, choose sign up, and follow the steps. You can start on the Free plan and upgrade when you need photos, analytics, or a branded storefront.'
  },
  {
    q: 'Do you support menus, shops, and tickets?',
    a: 'Yes. When you set up your business you choose Menus, Shops (catalog), or Ticketing. You can switch modes from the dashboard; pricing stays on the same plan, while payout fees follow the mode (see comparison table).'
  },
  {
    q: 'What payment methods can my customers use?',
    a: 'Customers typically pay with card or bank through Paystack. Exact methods depend on your Paystack setup and region.'
  }
]

const FAQ_BILLING: FaqItem[] = [
  {
    q: 'Can I cancel my subscription?',
    a: 'Yes. Paid plans can be cancelled from your billing area; you keep access until the end of the current billing period. Free has nothing to cancel.'
  },
  {
    q: 'How do payout transaction fees work?',
    a: `For ticketing we apply ${formatModeTransactionFee('ticketing')}; for shops ${formatModeTransactionFee('shop')}; for menus ${formatModeTransactionFee('menu')}.`
  }
]

function CheckCell({ ok }: { ok: boolean }): JSX.Element {
  return ok ? <span className="text-zuri-yellow font-bold">✓</span> : <span className="text-gray-300">—</span>
}

function PricingPage(): JSX.Element {
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly')
  const [faqTab, setFaqTab] = useState<'general' | 'billing'>('general')
  const [openFaq, setOpenFaq] = useState<number>(0)

  usePageSeo({
    title: 'ZURI Pricing | Menus, Shops, Ticketing & Growth Plans',
    description:
      'Compare ZURI plans: QR menus, shop catalogs, and ticketing, payouts, storefront customizer, AI tools, and transparent fees. Monthly or yearly billing.',
    path: '/pricing',
    jsonLd: [organizationJsonLd]
  })

  const faqList = faqTab === 'general' ? FAQ_GENERAL : FAQ_BILLING

  return (
    <div className="min-h-screen bg-white text-zuri-black">
      <header className="border-b border-gray-200 bg-white sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="text-sm font-medium text-gray-600 hover:text-zuri-orange transition shrink-0">
            ← Home
          </Link>
          <span className="text-sm font-semibold text-zuri-black hidden sm:inline">Pricing</span>
          <div className="flex items-center gap-3 shrink-0">
            <Link to="/business/login" className="text-sm text-gray-600 hover:text-zuri-black transition">
              Log in
            </Link>
            <Link
              to="/business/login"
              className="text-xs sm:text-sm font-semibold bg-zuri-black text-white px-3 py-2 rounded-full hover:opacity-90 transition"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative py-16 md:py-24 overflow-hidden">
          <div
            className="absolute inset-0 bg-[length:72px_72px] bg-[linear-gradient(to_right,rgba(0,0,0,0.02)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.02)_1px,transparent_1px)] pointer-events-none"
            aria-hidden
          />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="max-w-2xl mx-auto text-center mb-12 md:mb-14">
              <p className="text-[13px] sm:text-sm text-gray-500 font-medium tracking-wide mb-6 md:mb-8">Plans</p>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium text-zuri-black tracking-[-0.035em] leading-[1.08] mb-5 md:mb-6">
                Simple, transparent pricing
              </h1>
              <p className="text-base sm:text-lg text-gray-600 font-normal leading-relaxed">
                Choose what fits your business. No hidden fees.
              </p>
              <div className="flex justify-center mt-8 md:mt-10">
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
              <div className="bg-white rounded-2xl p-6 border border-gray-200 flex flex-col">
                <div className="text-center mb-6">
                  <h2 className="text-lg font-medium text-zuri-black">Free</h2>
                  <p className="text-2xl font-medium text-zuri-black mt-2 tabular-nums tracking-tight">₦0</p>
                  <p className="text-sm text-gray-500 mt-1">Forever</p>
                </div>
                <ul className="space-y-3 text-sm text-gray-700 flex-1">
                  <li className="flex items-start">
                    <span className="text-zuri-yellow mr-2">✓</span>
                    QR code & text menu — guests order in browser
                  </li>
                  <li className="flex items-start">
                    <span className="text-zuri-yellow mr-2">✓</span>
                    Orders & payments to your bank
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
              <div className="bg-white rounded-2xl p-6 border border-green-400 flex flex-col">
                <div className="text-center mb-6">
                  <span className="inline-block w-3 h-3 rounded-full bg-green-500 mb-2" aria-hidden />
                  <h2 className="text-lg font-medium text-zuri-black">Starter</h2>
                  <p className="text-2xl font-medium text-zuri-black mt-2 tabular-nums tracking-tight">
                    {billingInterval === 'monthly' ? PLAN_PRICES.starter : PLAN_PRICES_YEARLY_AS_MONTHLY.starter}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">/month</p>
                </div>
                <ul className="space-y-3 text-sm text-gray-700 flex-1">
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    Menu item photos & business logo
                  </li>
                  <li className="flex items-start">
                    <span className="text-green-500 mr-2">✓</span>
                    QR ordering, orders & payouts (same as Free)
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
                  <h2 className="text-lg font-medium text-zuri-black">Growth</h2>
                  <p className="text-2xl font-medium text-zuri-black mt-2 tabular-nums tracking-tight">
                    {billingInterval === 'monthly' ? PLAN_PRICES.growth : PLAN_PRICES_YEARLY_AS_MONTHLY.growth}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">/month</p>
                </div>
                <ul className="space-y-3 text-sm text-gray-700 flex-1">
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">✓</span>
                    Analytics: sales, trends, popular items & peak hours
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">✓</span>
                    Profit margins (when you add item costs)
                  </li>
                  <li className="flex items-start">
                    <span className="text-blue-500 mr-2">✓</span>
                    Storefront customizer, catalog presets & themes (layout, colours, hero, banner photo)
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
                    Agentic AI storefront — one-time batch of 3–4 brand directions; regenerate on Scale
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

              {/* Scale */}
              <div className="bg-zuri-black text-white rounded-2xl p-6 border border-purple-400 flex flex-col relative lg:scale-[1.02]">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-zuri-yellow text-zuri-black text-xs font-semibold px-2.5 py-0.5 rounded-lg">
                  Recommended
                </div>
                <div className="text-center mb-6">
                  <span className="inline-block w-3 h-3 rounded-full bg-purple-400 mb-2" aria-hidden />
                  <h2 className="text-lg font-medium">Scale</h2>
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
                    Zuri Assist — insights, forecasts, promos, CSV import
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-300 mr-2">✓</span>
                    Market intelligence — anonymous Zuri network trends
                  </li>
                  <li className="flex items-start">
                    <span className="text-purple-300 mr-2">✓</span>
                    Live ops — briefing, rush signals, slow hours, low-stock flags
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

              {/* Enterprise */}
              <div className="bg-white rounded-2xl p-6 border border-gray-200 flex flex-col">
                <div className="text-center mb-6">
                  <h2 className="text-lg font-medium text-zuri-black">Enterprise</h2>
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
          </div>
        </section>

        {/* Comparison */}
        <section className="py-16 md:py-20 bg-zuri-light/50 border-t border-gray-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-2xl md:text-3xl font-medium text-zuri-black tracking-tight mb-2">Compare plans</h2>
            <p className="text-gray-600 text-sm md:text-base mb-8 max-w-2xl">
              Core limits and fees at a glance. Menu, shop, and ticketing modes use different customer-facing flows; payout fees reflect the active mode.
            </p>
            <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
              <table className="min-w-[720px] w-full text-sm text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50/80">
                    <th className="py-3 px-4 font-semibold text-gray-700 w-[28%]">Feature</th>
                    <th className="py-3 px-3 font-semibold text-gray-700 text-center">Free</th>
                    <th className="py-3 px-3 font-semibold text-gray-700 text-center">Starter</th>
                    <th className="py-3 px-3 font-semibold text-gray-700 text-center">Growth</th>
                    <th className="py-3 px-3 font-semibold text-gray-700 text-center">Scale</th>
                    <th className="py-3 px-3 font-semibold text-gray-700 text-center">Enterprise</th>
                  </tr>
                </thead>
                <tbody className="text-gray-700">
                  <tr className="bg-gray-100/90">
                    <td colSpan={6} className="py-2 px-4 text-xs font-bold uppercase tracking-wider text-gray-500">
                      Core
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4">QR storefront (menu, shop, or tickets)</td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4">Orders & payouts</td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4">Analytics dashboard</td>
                    <td className="py-3 px-3 text-center"><CheckCell ok={false} /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok={false} /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4">Storefront customizer and hero banner</td>
                    <td className="py-3 px-3 text-center"><CheckCell ok={false} /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok={false} /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                  </tr>
                  <tr className="bg-gray-100/90">
                    <td colSpan={6} className="py-2 px-4 text-xs font-bold uppercase tracking-wider text-gray-500">
                      Billings & payments
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4">Transaction fee — by storefront mode</td>
                    <td className="py-3 px-3 text-center text-xs font-medium" colSpan={5}>
                      Tickets: {formatModeTransactionFee('ticketing')} · Shops: {formatModeTransactionFee('shop')} · Menu:{' '}
                      {formatModeTransactionFee('menu')}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4">Subscription cancellation</td>
                    <td className="py-3 px-3 text-center text-xs" colSpan={5}>
                      Cancel paid plans anytime; access continues through the end of the billing period.
                    </td>
                  </tr>
                  <tr className="bg-gray-100/90">
                    <td colSpan={6} className="py-2 px-4 text-xs font-bold uppercase tracking-wider text-gray-500">
                      Growth & AI
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100">
                    <td className="py-3 px-4">Agentic AI storefront customizer</td>
                    <td className="py-3 px-3 text-center text-xs">—</td>
                    <td className="py-3 px-3 text-center text-xs">—</td>
                    <td className="py-3 px-3 text-center text-xs">One-time: 3–4 brand directions</td>
                    <td className="py-3 px-3 text-center text-xs">Regenerate anytime</td>
                    <td className="py-3 px-3 text-center text-xs">Custom</td>
                  </tr>
                  <tr>
                    <td className="py-3 px-4">Zuri Tap (saved cards)</td>
                    <td className="py-3 px-3 text-center"><CheckCell ok={false} /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok={false} /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                    <td className="py-3 px-3 text-center"><CheckCell ok /></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-16 md:py-24 border-t border-gray-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
            <p className="text-xs font-semibold text-zuri-orange uppercase tracking-widest mb-3">How to get started</p>
            <h2 className="text-2xl md:text-4xl font-medium text-zuri-black tracking-tight mb-10 md:mb-12">
              Frequently asked questions
            </h2>
            <div className="grid md:grid-cols-[220px_1fr] gap-10">
              <nav className="flex md:flex-col gap-2" aria-label="FAQ sections">
                <button
                  type="button"
                  onClick={() => {
                    setFaqTab('general')
                    setOpenFaq(0)
                  }}
                  className={`text-left px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${
                    faqTab === 'general'
                      ? 'border-zuri-orange bg-zuri-orange/10 text-zuri-black'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  General
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFaqTab('billing')
                    setOpenFaq(0)
                  }}
                  className={`text-left px-4 py-2.5 rounded-xl text-sm font-semibold border transition ${
                    faqTab === 'billing'
                      ? 'border-zuri-orange bg-zuri-orange/10 text-zuri-black'
                      : 'border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  Billing & payments
                </button>
              </nav>
              <div className="space-y-2">
                {faqList.map((item, idx) => {
                  const open = openFaq === idx
                  return (
                    <div key={item.q} className="border border-gray-200 rounded-2xl bg-white overflow-hidden">
                      <button
                        type="button"
                        className="w-full text-left px-5 py-4 flex items-center justify-between gap-4 hover:bg-gray-50/80 transition"
                        onClick={() => setOpenFaq(open ? -1 : idx)}
                      >
                        <span className="font-semibold text-zuri-black text-sm sm:text-base">{item.q}</span>
                        <span className="text-zuri-orange text-lg shrink-0">{open ? '−' : '+'}</span>
                      </button>
                      {open ? (
                        <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed border-t border-gray-100 pt-3">
                          {item.a}
                        </div>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </section>

        <footer className="border-t border-gray-200 py-10 bg-white">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <p>© {new Date().getFullYear()} ZURI. All rights reserved.</p>
            <div className="flex gap-6">
              <Link to="/privacy" className="hover:text-zuri-orange transition">
                Privacy
              </Link>
              <Link to="/business/login" className="hover:text-zuri-orange transition">
                Business login
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}

export default PricingPage
