import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiUrl } from '../lib/apiBase'

function DemoPage(): JSX.Element {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')
  const [role, setRole] = useState('')
  const [teamSize, setTeamSize] = useState('')
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
    try {
      const details = [
        fullName && `Full name: ${fullName}`,
        company && `Company: ${company}`,
        role && `Role: ${role}`,
        teamSize && `Team size: ${teamSize}`,
        message && `Notes: ${message}`,
      ].filter(Boolean).join('\n')

      const res = await fetch(apiUrl('/api/contact'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), source: 'demo', message: details }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data?.success) {
        setSuccess('Thanks for booking a demo. We will reach out shortly.')
        setFullName(''); setCompany(''); setRole(''); setTeamSize(''); setMessage('')
      } else {
        setError(data?.error || 'Something went wrong. Please try again.')
      }
    } catch {
      setError('Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#fefbf5]">
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-5xl mx-auto px-3 sm:px-4 lg:px-6 h-12 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 h-full py-1">
            <img src="/ZURI.png" alt="ZURI" className="h-full w-auto object-contain scale-[1.07]" />
            <span className="text-sm font-bold tracking-[0.18em] text-zuri-black">ZURI</span>
          </Link>
          <a href="/business/login" target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-zuri-black hover:text-gray-600 transition-colors">
            Log in
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
        <section className="mb-12 md:mb-16 text-center">
          <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] font-medium bg-zuri-yellow/20 text-zuri-black mb-4">
            Book a product walkthrough
          </span>
          <h1 className="text-3xl md:text-4xl font-semibold text-zuri-black mb-3">See how Zuri works for your business</h1>
          <p className="text-sm md:text-base text-gray-600 max-w-2xl mx-auto">
            Share a few details and we&apos;ll schedule a short session to show you how Zuri handles menus, orders, and payments end‑to‑end.
          </p>
        </section>

        <section className="grid md:grid-cols-[minmax(0,1.4fr),minmax(0,1fr)] gap-8 items-start">
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 p-6 md:p-8 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Full name" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Work email" />
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Business name" />
              <input type="text" value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" placeholder="Role" />
            </div>
            <select value={teamSize} onChange={(e) => setTeamSize(e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
              <option value="">Team size</option>
              <option value="1-5">1–5 people</option>
              <option value="6-20">6–20 people</option>
              <option value="21-50">21–50 people</option>
              <option value="51+">51+ people</option>
            </select>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" placeholder="Anything specific you want to see?" />
            {error && <p className="text-xs text-red-600">{error}</p>}
            {success && <p className="text-xs text-green-600">{success}</p>}
            <button type="submit" disabled={submitting} className="inline-flex items-center justify-center bg-zuri-orange text-white font-semibold text-[13px] leading-none rounded-lg px-3 py-2 hover:bg-zuri-orange-dark transition-colors disabled:opacity-60">
              {submitting ? 'Sending…' : 'Submit demo request'}
            </button>
          </form>
          <aside className="space-y-4 text-sm text-gray-600">
            <div className="bg-white rounded-2xl border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-zuri-black mb-2">What we&apos;ll cover</h2>
              <ul className="space-y-1.5">
                <li>• How guests scan, order, and pay</li>
                <li>• How Zuri routes payouts to your bank</li>
                <li>• How Zuri Tap works for remote payments</li>
              </ul>
            </div>
          </aside>
        </section>
      </main>
    </div>
  )
}

export default DemoPage
