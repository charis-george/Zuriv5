import { Link } from 'react-router-dom'
import { organizationJsonLd, usePageSeo } from '../lib/seo'

function ZuriTapPage(): JSX.Element {
  usePageSeo({
    title: 'Zuri Tap | Fast Customer Payments Without QR Scans',
    description: 'Zuri Tap lets customers pay a business with a short code and saved card, while businesses send payment requests from their ZURI dashboard.',
    path: '/zuri-tap',
    jsonLd: [
      organizationJsonLd,
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'Zuri Tap',
        url: 'https://zuriqo.com/zuri-tap',
        description: 'Pay ZURI businesses with a short Tap code without scanning a QR code.',
        primaryImageOfPage: 'https://zuriqo.com/ZURI.png'
      }
    ]
  })

  return (
    <div className="min-h-screen bg-[#fefbf5]">
      <header className="sticky top-0 z-50 bg-transparent">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
          <div className="flex items-center justify-between h-10">
            <Link to="/" className="flex items-center gap-2">
              <img src="/ZURI.png" alt="ZURI logo" className="h-8 w-auto object-contain" />
              <span className="text-[11px] tracking-[0.32em] text-zuri-black uppercase">Z U R I</span>
            </Link>
            <nav className="hidden md:flex items-center gap-6 text-sm text-gray-600">
              <Link to="/scan" className="hover:text-zuri-orange transition-colors">How it works</Link>
              <Link to="/zuri-tap" className="text-zuri-orange">Zuri Tap</Link>
              <Link to="/business/login" className="hover:text-zuri-orange transition-colors">For Businesses</Link>
              <Link to="/business/login" className="text-zuri-black hover:text-gray-600">Log in</Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="text-center mb-12">
          <h1 className="text-3xl md:text-4xl text-zuri-black mb-3">Zuri Tap</h1>
          <p className="text-sm text-gray-600 max-w-lg mx-auto">
            Pay a business with a short code—no QR scan. Uses your Zuri Tap account and saved card.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-10">
          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-lg text-zuri-black mb-4">For businesses</h2>
            <ul className="text-sm text-gray-600 space-y-2 list-disc pl-5">
              <li>Log in and turn on Zuri Tap in your dashboard.</li>
              <li>Show customers your 6-character Tap code.</li>
              <li>Send payment requests from your menu; payouts work like other Zuri orders.</li>
            </ul>
            <Link
              to="/business/login"
              className="inline-block mt-5 text-sm rounded-lg px-3 py-1.5 bg-zuri-orange text-white hover:bg-zuri-orange-dark transition-colors"
            >
              Open dashboard
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-6">
            <h2 className="text-lg text-zuri-black mb-4">For customers</h2>
            <ul className="text-sm text-gray-600 space-y-2 list-disc pl-5">
              <li>Sign in at Zuri Tap and enter the business code.</li>
              <li>When the business sends a request, open it and confirm.</li>
              <li>Enter your Tap password to pay with your saved card.</li>
            </ul>
            <Link
              to="/tap"
              className="inline-block mt-5 text-sm rounded-lg px-3 py-1.5 bg-zuri-black text-white hover:bg-gray-800 transition-colors"
            >
              Open Zuri Tap
            </Link>
          </div>
        </div>

        <p className="text-center text-sm text-gray-600 mb-4">
          Same payouts as the rest of Zuri—no extra bank setup for Tap alone.
        </p>
        <div className="text-center">
          <Link to="/" className="text-sm text-zuri-orange hover:text-zuri-orange-dark transition">
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  )
}

export default ZuriTapPage
