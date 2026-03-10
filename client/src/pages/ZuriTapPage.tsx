import { Link } from 'react-router-dom'

function ZuriTapPage(): JSX.Element {
  return (
    <div className="min-h-screen bg-[#fefbf5]">
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
              <Link to="/zuri-tap" className="text-sm font-medium text-zuri-orange">
                Zuri Tap
              </Link>
              <Link to="/business/login" className="text-sm font-medium text-gray-600 hover:text-zuri-orange transition-colors">
                For Businesses
              </Link>
              <Link to="/business/login" className="text-sm font-medium text-zuri-black hover:text-gray-600">
                Log in
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h1 className="text-4xl md:text-5xl font-bold text-zuri-black mb-4">
            Zuri Tap
          </h1>
          <p className="text-xl text-gray-700 max-w-2xl mx-auto">
            Instant payment when a Zuri Business and a Zuri client connect. No app, no QR—enter the code from the business and pay with your password.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 mb-16">
          <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-zuri-orange/10 flex items-center justify-center mb-6">
              <span className="text-2xl" aria-hidden>🏪</span>
            </div>
            <h2 className="text-xl font-bold text-zuri-black mb-3">For Businesses</h2>
            <p className="text-gray-600 text-sm mb-6">
              Turn on Zuri Tap and show the 6-character code. Select items from your menu and send requests to any Zuri Tap customers who have joined that room — whether they&apos;re nearby or remote.
            </p>
            <Link
              to="/business/login"
              className="inline-block bg-zuri-orange text-white font-semibold text-sm rounded-full px-5 py-2.5 hover:bg-zuri-orange-dark transition"
            >
              Use Zuri Tap in dashboard
            </Link>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
            <div className="w-14 h-14 rounded-full bg-zuri-black/10 flex items-center justify-center mb-6">
              <span className="text-2xl" aria-hidden>👤</span>
            </div>
            <h2 className="text-xl font-bold text-zuri-black mb-3">For Customers</h2>
            <p className="text-gray-600 text-sm mb-6">
              Sign in and open the Zuri Tap screen. Enter the code from the business, then when they send a request you’ll see it—tap Open, enter your password, and pay. Card is saved from a previous order.
            </p>
            <Link
              to="/tap"
              className="inline-block bg-zuri-black text-white font-semibold text-sm rounded-full px-5 py-2.5 hover:bg-gray-800 transition"
            >
              Open Zuri Tap
            </Link>
          </div>
        </div>

        <div className="bg-zuri-light rounded-2xl border border-orange-100 p-8 text-center">
          <p className="text-sm text-gray-700 mb-4">
            Zuri Tap uses your existing Zuri business account. No new bank connections. Customers pay with a saved card—you get paid as usual.
          </p>
          <Link to="/" className="text-sm font-semibold text-zuri-orange hover:text-zuri-orange-dark transition">
            ← Back to home
          </Link>
        </div>
      </main>
    </div>
  )
}

export default ZuriTapPage
