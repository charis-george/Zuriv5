import { Link } from 'react-router-dom'
import { useState, FormEvent } from 'react'

function Home(): JSX.Element {
  const [showBetaForm, setShowBetaForm] = useState<boolean>(false)
  const [email, setEmail] = useState<string>('')

  const handleBetaSubmit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    alert('Thanks for your interest! We\'ll be in touch soon.')
    setEmail('')
    setShowBetaForm(false)
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Header - Sticky */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <Link to="/" className="flex items-center space-x-3 group">
              <img 
                src="/zuri-logo.png" 
                alt="ZURI Logo" 
                className="h-[120px] w-auto transform group-hover:scale-105 transition-transform duration-300"
              />
            </Link>
            <nav className="hidden md:flex items-center space-x-8">
              <Link to="/scan" className="text-gray-700 hover:text-zuri-black font-medium transition-colors">
                How It Works
              </Link>
              <Link to="/business/login" className="text-gray-700 hover:text-zuri-black font-medium transition-colors">
                For Businesses
              </Link>
              <Link 
                to="/scan" 
                className="bg-zuri-black text-white px-6 py-2.5 rounded-lg font-semibold hover:bg-gray-800 transition-all shadow-md hover:shadow-lg"
              >
                Scan QR Code
              </Link>
              <button
                onClick={() => setShowBetaForm(true)}
                className="bg-zuri-yellow text-zuri-black px-6 py-2.5 rounded-lg font-semibold hover:bg-yellow-400 transition-all shadow-md hover:shadow-lg"
              >
                Join Beta
              </button>
            </nav>
            <div className="md:hidden">
              <button
                onClick={() => setShowBetaForm(true)}
                className="bg-zuri-yellow text-zuri-black px-4 py-2 rounded-lg font-semibold text-sm"
              >
                Join Beta
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-br from-zuri-light via-white to-zuri-light pt-20 pb-32">
        <div className="absolute inset-0 bg-grid-pattern opacity-5"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <div className="inline-block mb-6">
                <span className="bg-zuri-yellow/20 text-zuri-black px-4 py-2 rounded-full text-sm font-semibold">
                  The QR POS system for Modern hospitality
                </span>
              </div>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold text-zuri-black mb-6 leading-tight">
                Turn any table into a{' '}
                <span className="relative inline-block">
                  <span className="relative z-10">digital point of sale</span>
                  <span className="absolute bottom-2 left-0 right-0 h-4 bg-zuri-yellow/40 -rotate-1"></span>
                </span>
              </h1>
              <p className="text-xl md:text-2xl text-gray-600 mb-8 leading-relaxed max-w-2xl mx-auto lg:mx-0">
                Let guests scan a QR code, browse your menu, and order right from their phone.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <button
                  onClick={() => setShowBetaForm(true)}
                  className="bg-zuri-black text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-gray-800 transition-all shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5"
                >
                  Join Beta
                </button>
                <Link
                  to="/scan"
                  className="bg-white text-zuri-black border-2 border-zuri-black px-8 py-4 rounded-xl font-semibold text-lg hover:bg-zuri-light transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                >
                  Try It Now
                </Link>
              </div>
            </div>
            <div className="relative">
              <div className="relative z-10">
                {/* Phone Mockup */}
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-[3rem] p-4 shadow-2xl transform rotate-3 hover:rotate-0 transition-transform duration-500">
                  <div className="bg-white rounded-[2.5rem] overflow-hidden">
                    <div className="bg-zuri-yellow h-12 flex items-center justify-center">
                      <div className="w-32 h-32 bg-white rounded-2xl shadow-lg flex items-center justify-center mx-auto my-4">
                        <svg className="w-16 h-16 text-zuri-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                        </svg>
                      </div>
                    </div>
                    <div className="p-6 space-y-3">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                      <div className="grid grid-cols-2 gap-3 mt-4">
                        <div className="h-24 bg-gray-100 rounded-lg"></div>
                        <div className="h-24 bg-gray-100 rounded-lg"></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              {/* Decorative elements */}
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-zuri-yellow/20 rounded-full blur-3xl"></div>
              <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-zuri-yellow/10 rounded-full blur-3xl"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Business Types */}
      <section className="py-12 bg-white border-y border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-center gap-8 text-gray-600">
            <span className="font-semibold text-zuri-black">Perfect for:</span>
            <span className="hover:text-zuri-black transition">Restaurants</span>
            <span className="text-gray-300">•</span>
            <span className="hover:text-zuri-black transition">Bars</span>
            <span className="text-gray-300">•</span>
            <span className="hover:text-zuri-black transition">Cafés</span>
            <span className="text-gray-300">•</span>
            <span className="hover:text-zuri-black transition">Hotels</span>
            <span className="text-gray-300">•</span>
            <span className="hover:text-zuri-black transition">Pizzerias</span>
            <span className="text-gray-300">•</span>
            <span className="hover:text-zuri-black transition">Coffee shops</span>
            <span className="text-gray-300">•</span>
            <span className="hover:text-zuri-black transition">Bakeries</span>
            <span className="text-gray-300">•</span>
            <span className="hover:text-zuri-black transition">Fast food restaurants</span>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-zuri-black mb-4">
              How It Works
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Learn how ZURI works
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 lg:gap-12">
            <div className="text-center group">
              <div className="relative mb-8">
                <div className="w-24 h-24 bg-gradient-to-br from-zuri-yellow to-yellow-400 rounded-2xl flex items-center justify-center mx-auto transform group-hover:scale-110 transition-transform duration-300 shadow-lg">
                  <svg className="w-12 h-12 text-zuri-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-zuri-black text-white rounded-full flex items-center justify-center font-bold text-sm">
                  1
                </div>
              </div>
              <h3 className="text-2xl font-bold text-zuri-black mb-4">Scan</h3>
              <p className="text-gray-600 leading-relaxed">
                No downloads, no hassle. Guests simply scan a QR code at the table to instantly open your digital menu.
              </p>
            </div>
            <div className="text-center group">
              <div className="relative mb-8">
                <div className="w-24 h-24 bg-gradient-to-br from-zuri-yellow to-yellow-400 rounded-2xl flex items-center justify-center mx-auto transform group-hover:scale-110 transition-transform duration-300 shadow-lg">
                  <svg className="w-12 h-12 text-zuri-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-zuri-black text-white rounded-full flex items-center justify-center font-bold text-sm">
                  2
                </div>
              </div>
              <h3 className="text-2xl font-bold text-zuri-black mb-4">Order & Pay</h3>
              <p className="text-gray-600 leading-relaxed">
                With a few taps, customers browse your menu and place their order directly from their phone.
              </p>
            </div>
            <div className="text-center group">
              <div className="relative mb-8">
                <div className="w-24 h-24 bg-gradient-to-br from-zuri-yellow to-yellow-400 rounded-2xl flex items-center justify-center mx-auto transform group-hover:scale-110 transition-transform duration-300 shadow-lg">
                  <svg className="w-12 h-12 text-zuri-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="absolute -top-2 -right-2 w-8 h-8 bg-zuri-black text-white rounded-full flex items-center justify-center font-bold text-sm">
                  3
                </div>
              </div>
              <h3 className="text-2xl font-bold text-zuri-black mb-4">Enjoy</h3>
              <p className="text-gray-600 leading-relaxed">
                Guests enjoy a seamless experience while you save time on orders — letting you focus on great food and service.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="py-24 bg-gradient-to-b from-white to-zuri-light">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-zuri-black mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              No hidden fees, no long-term contracts. Pay only for what you use with our straightforward pricing.
            </p>
          </div>
          <div className="max-w-md mx-auto">
            <div className="bg-white rounded-3xl shadow-2xl p-10 border-2 border-zuri-yellow/50 transform hover:scale-105 transition-transform duration-300">
              <div className="text-center mb-8">
                <div className="text-6xl font-bold text-zuri-black mb-2">Free</div>
                <div className="text-gray-600 text-lg mb-6">During Beta</div>
                <div className="inline-block bg-zuri-yellow/20 text-zuri-black px-4 py-2 rounded-full text-sm font-semibold">
                  Limited Time Offer
                </div>
              </div>
              <ul className="space-y-4 mb-8">
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-zuri-yellow mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Unlimited orders</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-zuri-yellow mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Real-time analytics dashboard</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-zuri-yellow mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Digital receipts</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-zuri-yellow mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">24/7 customer support</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-6 h-6 text-zuri-yellow mr-3 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-gray-700">Menu customization</span>
                </li>
              </ul>
              <button
                onClick={() => setShowBetaForm(true)}
                className="w-full bg-zuri-black text-white py-4 rounded-xl font-semibold text-lg hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
              >
                Get Started
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold text-zuri-black mb-4">
              Frequently Asked Questions
            </h2>
          </div>
          <div className="space-y-6">
            <div className="bg-zuri-light rounded-2xl p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-zuri-black mb-3">What is ZURI?</h3>
              <p className="text-gray-700 leading-relaxed">
                ZURI is a QR code based POS system that allows guests to scan a code, browse your digital menu, and place their order directly from their phone.
              </p>
            </div>
            <div className="bg-zuri-light rounded-2xl p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-zuri-black mb-3">Do my customers need to download an app?</h3>
              <p className="text-gray-700 leading-relaxed">
                No. Guests simply scan a QR code with their smartphone and the digital menu opens instantly in their browser.
              </p>
            </div>
            <div className="bg-zuri-light rounded-2xl p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-zuri-black mb-3">Can I customize the digital menu?</h3>
              <p className="text-gray-700 leading-relaxed">
                Yes. You can easily update your menu, change prices, add photos, and highlight promotions in real time.
              </p>
            </div>
            <div className="bg-zuri-light rounded-2xl p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-zuri-black mb-3">Do I need new hardware?</h3>
              <p className="text-gray-700 leading-relaxed">
                No special hardware is required. ZURI works with any smartphone and can be connected to your existing POS setup.
              </p>
            </div>
            <div className="bg-zuri-light rounded-2xl p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-zuri-black mb-3">Is ZURI suitable for my type of business?</h3>
              <p className="text-gray-700 leading-relaxed">
                Absolutely. Restaurants, cafés, bars, fast food outlets, brasseries, and even hotels can benefit from QR ordering.
              </p>
            </div>
            <div className="bg-zuri-light rounded-2xl p-6 hover:shadow-lg transition-shadow">
              <h3 className="text-xl font-bold text-zuri-black mb-3">Can customers pay directly from their phone?</h3>
              <p className="text-gray-700 leading-relaxed">
                Yes. Depending on your payment provider, you can enable mobile payments so guests can order and pay in one step.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-gradient-to-r from-zuri-black to-gray-900 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            We're opening beta spots soon
          </h2>
          <p className="text-xl text-gray-300 mb-8">
            Be among the first restaurants to try ZURI.
          </p>
          <button
            onClick={() => setShowBetaForm(true)}
            className="bg-zuri-yellow text-zuri-black px-8 py-4 rounded-xl font-semibold text-lg hover:bg-yellow-400 transition-all shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5"
          >
            Join the Beta
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-zuri-black text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-12">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                <img 
                  src="/zuri-logo.png" 
                  alt="ZURI Logo" 
                  className="h-[104px] w-auto"
                />
              </div>
              <p className="text-gray-400 text-sm">
                The QR POS system for modern hospitality.
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

      {/* Beta Form Modal */}
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
              <h3 className="text-2xl font-bold text-zuri-black">Join the Beta</h3>
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
              Be among the first businesses to try ZURI. We'll be in touch soon!
            </p>
            <form onSubmit={handleBetaSubmit}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl mb-4 focus:outline-none focus:ring-2 focus:ring-zuri-yellow focus:border-transparent transition"
              />
              <div className="flex space-x-4">
                <button
                  type="button"
                  onClick={() => setShowBetaForm(false)}
                  className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-xl font-semibold hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-zuri-black text-white rounded-xl font-semibold hover:bg-gray-800 transition shadow-lg"
                >
                  Join
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
