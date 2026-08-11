import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../lib/apiBase'
import { formatUserFacingError } from '../lib/formatApiError'
import { CustomDropdown } from '../components/CustomDropdown'
import { organizationJsonLd, usePageSeo } from '../lib/seo'

const CONTACT_EMAIL = 'info@zuriqo.com'

const VENUE_TYPES = [
  { value: 'restaurant', label: 'Restaurant / Café' },
  { value: 'hotel', label: 'Hotel / Resort' },
  { value: 'events', label: 'Events / Ticketing' },
  { value: 'food-hall', label: 'Food hall / Pop-up' },
  { value: 'other', label: 'Other' },
] as const

function WaitlistPage(): JSX.Element {
  usePageSeo({
    title: 'Join the ZURI Waitlist | Early Access for Venues',
    description:
      'Join the ZURI waitlist for early access to AI-personalised menus, QR ordering, events ticketing, and Naira payouts built for hospitality venues.',
    path: '/waitlist',
    jsonLd: [
      organizationJsonLd,
      {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: 'ZURI Waitlist',
        url: 'https://zuriqo.com/waitlist',
        description: 'Sign up for early access to the ZURI hospitality platform.',
      },
    ],
  })

  const [email, setEmail] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [venueType, setVenueType] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    if (!email.trim()) return setError('Email is required')
    setSubmitting(true)
    setSuccess(null)
    setError(null)

    const venueLabel = VENUE_TYPES.find((v) => v.value === venueType)?.label
    const details = [
      businessName && `Business: ${businessName}`,
      venueLabel && `Venue type: ${venueLabel}`,
      message && `Notes: ${message}`,
    ]
      .filter(Boolean)
      .join('\n')

    try {
      const { data } = await axios.post<{
        success?: boolean
        error?: string
      }>(apiUrl('/api/contact'), {
        email: email.trim(),
        source: 'waitlist',
        message: details || undefined,
      })
      if (data?.success) {
        setSuccess("You're on the list! We'll reach out with early-access details soon.")
        setEmail('')
        setBusinessName('')
        setVenueType('')
        setMessage('')
      } else {
        setError(data?.error || 'Something went wrong. Please try again.')
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 503) {
        const d = err.response.data as { fallbackMailto?: boolean; subject?: string }
        if (d?.fallbackMailto) {
          const subject = encodeURIComponent(d.subject || `ZURI Waitlist: ${email.trim()}`)
          const body = encodeURIComponent(
            `Email: ${email.trim()}\nSource: waitlist${details ? `\n${details}` : ''}`,
          )
          window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
          setSuccess('Your email app will open so you can send your request. Thanks!')
          return
        }
      }
      if (axios.isAxiosError(err) && err.response?.data && typeof (err.response.data as { error?: string }).error === 'string') {
        setError(formatUserFacingError(err.response.data, 'We could not submit your request right now. Please try again.'))
        return
      }
      const subject = encodeURIComponent(`ZURI Waitlist: ${email.trim()}`)
      const body = encodeURIComponent(`Email: ${email.trim()}\nSource: waitlist${details ? `\n${details}` : ''}`)
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${subject}&body=${body}`
      setSuccess('Your email app will open so you can send your request. Thanks!')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-zuri-light text-zuri-black font-normal antialiased">
      <header className="sticky top-0 z-30 border-b border-gray-200/80 bg-zuri-light/90 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <img src="/ZURI.png" alt="ZURI logo" className="h-8 w-auto object-contain" width={120} height={32} decoding="async" />
            <span className="text-[11px] tracking-[0.32em] text-zuri-black uppercase hidden sm:inline">Z U R I</span>
          </Link>
          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/demo"
              className="text-xs sm:text-sm font-medium bg-zuri-black text-white px-3.5 py-2 rounded-full hover:bg-neutral-800 transition-colors"
            >
              Book a demo
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative pt-16 pb-12 md:pt-24 md:pb-16 overflow-hidden">
          <div
            className="absolute inset-0 bg-[length:72px_72px] bg-[linear-gradient(to_right,rgba(0,0,0,0.025)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,0,0,0.025)_1px,transparent_1px)] pointer-events-none"
            aria-hidden
          />
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[min(90vw,36rem)] h-40 bg-zuri-orange/[0.08] blur-[80px] rounded-full pointer-events-none" aria-hidden />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 relative">
            <div className="max-w-2xl mx-auto text-center mb-12 md:mb-14">
              <p className="text-[13px] sm:text-sm text-gray-500 font-medium tracking-wide mb-6 md:mb-8">Early access</p>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-medium text-zuri-black tracking-[-0.035em] leading-[1.08] mb-5 md:mb-6">
                Join the <span className="text-zuri-orange">ZURI waitlist</span>
              </h1>
              <p className="text-base sm:text-lg text-gray-600 font-normal leading-relaxed max-w-lg mx-auto">
                Be among the first venues to launch AI-personalised menus, smart ordering, and ticketing — with payouts straight to your bank.
              </p>
            </div>

            <section className="grid lg:grid-cols-[minmax(0,1.35fr),minmax(0,1fr)] gap-8 lg:gap-12 items-start max-w-5xl mx-auto">
              <form
                onSubmit={handleSubmit}
                className="bg-white rounded-2xl border border-gray-200/90 shadow-sm p-6 md:p-8 space-y-4"
              >
                <div>
                  <label htmlFor="waitlist-email" className="block text-xs font-medium text-gray-500 mb-1.5">
                    Work email <span className="text-zuri-orange">*</span>
                  </label>
                  <input
                    id="waitlist-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={submitting}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-yellow focus:border-transparent transition disabled:opacity-70"
                    placeholder="you@venue.com"
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="waitlist-business" className="block text-xs font-medium text-gray-500 mb-1.5">
                      Business name
                    </label>
                    <input
                      id="waitlist-business"
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      disabled={submitting}
                      className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-yellow focus:border-transparent transition disabled:opacity-70"
                      placeholder="Your venue"
                    />
                  </div>
                  <div>
                    <span id="waitlist-venue-type-label" className="block text-xs font-medium text-gray-500 mb-1.5">
                      Venue type
                    </span>
                    <CustomDropdown
                      options={[...VENUE_TYPES]}
                      value={venueType}
                      onChange={(val) => setVenueType(val)}
                      placeholder="Select type"
                      size="md"
                      disabled={submitting}
                      className="w-full"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="waitlist-notes" className="block text-xs font-medium text-gray-500 mb-1.5">
                    Anything else? <span className="text-gray-400 font-normal">(optional)</span>
                  </label>
                  <textarea
                    id="waitlist-notes"
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    disabled={submitting}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zuri-yellow focus:border-transparent transition disabled:opacity-70"
                    placeholder="Tell us about your service style or launch timeline"
                  />
                </div>
                {error && (
                  <p className="text-sm text-red-700 bg-red-50 px-3 py-2 rounded-lg" role="alert">
                    {error}
                  </p>
                )}
                {success && (
                  <p className="text-sm text-green-800 bg-green-50 px-3 py-2 rounded-lg" role="status">
                    {success}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full sm:w-auto inline-flex items-center justify-center bg-zuri-black text-white text-sm font-medium rounded-full px-8 py-3.5 hover:bg-neutral-800 transition-colors disabled:opacity-70"
                >
                  {submitting ? 'Joining…' : 'Join the waitlist'}
                </button>
                <p className="text-xs text-gray-500 leading-relaxed">
                  By joining, you agree we may contact you about ZURI. No spam — unsubscribe anytime.
                </p>
              </form>

              <aside className="space-y-4">
                <div className="bg-white rounded-2xl border border-gray-200/90 shadow-sm p-6 md:p-7">
                  <h2 className="text-base font-medium text-zuri-black mb-4 tracking-tight">What you get</h2>
                  <ul className="space-y-3 text-sm text-gray-600 leading-relaxed">
                    <li className="flex gap-3">
                      <span className="text-zuri-orange font-bold shrink-0">✓</span>
                      <span>Early access to AI menus and guest personalisation</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-zuri-orange font-bold shrink-0">✓</span>
                      <span>Priority onboarding when your market opens</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-zuri-orange font-bold shrink-0">✓</span>
                      <span>QR ordering, Zuri Tap, and events ticketing in one stack</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="text-zuri-orange font-bold shrink-0">✓</span>
                      <span>Naira payouts to your bank via Paystack</span>
                    </li>
                  </ul>
                </div>
                <div className="rounded-2xl border border-zuri-orange/25 bg-zuri-orange/[0.06] p-6 text-sm text-gray-600 leading-relaxed">
                  <p className="font-medium text-zuri-black mb-1">Prefer a walkthrough?</p>
                  <p>
                    <Link to="/demo" className="text-zuri-orange hover:underline font-medium">
                      Book a demo
                    </Link>{' '}
                    and we&apos;ll show you menus, orders, and payouts live.
                  </p>
                </div>
              </aside>
            </section>
          </div>
        </section>

        <footer className="border-t border-gray-200 py-10 bg-white/60">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <p>© {new Date().getFullYear()} ZURI TECHNOLOGIES LIMITED</p>
            <div className="flex flex-wrap justify-center gap-6">
              <Link to="/" className="hover:text-zuri-orange transition-colors">
                Home
              </Link>
              <Link to="/privacy" className="hover:text-zuri-orange transition-colors">
                Privacy
              </Link>
              <Link to="/business/login" className="hover:text-zuri-orange transition-colors">
                Business login
              </Link>
            </div>
          </div>
        </footer>
      </main>
    </div>
  )
}

export default WaitlistPage


