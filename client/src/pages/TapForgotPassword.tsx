import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import axios from 'axios'

function TapForgotPassword(): JSX.Element {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [resetLink, setResetLink] = useState<string | null>(null)
  const [error, setError] = useState('')

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setLoading(true)
    setSent(false)
    setResetLink(null)
    try {
      const { data } = await axios.post<{ success: boolean; message?: string; resetLink?: string }>(
        '/api/tap-auth/forgot-password',
        { email: email.trim() }
      )
      setSent(true)
      if (data.resetLink) setResetLink(data.resetLink)
    } catch (err) {
      setError(axios.isAxiosError(err) ? (err.response?.data?.error || 'Something went wrong') : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#fefbf5]">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-6">
          <Link to="/zuri-tap" className="block mb-4">
            <img src="/ZURI.png" alt="ZURI" className="h-8 w-auto" />
          </Link>
          <h1 className="text-xl font-bold text-zuri-black">Check your email</h1>
          <p className="text-sm text-gray-500 mt-2">
            If an account exists for that email, we’ve sent instructions to reset your password.
          </p>
          {resetLink && <p className="text-sm text-gray-600 mt-4"><a href={resetLink} className="text-zuri-orange hover:underline break-all">Reset password</a></p>}
          <Link to="/tap/login" className="mt-6 block text-center text-sm font-semibold text-zuri-orange hover:underline">← Back to sign in</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#fefbf5]">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-6">
        <Link to="/zuri-tap" className="block mb-4">
          <img src="/ZURI.png" alt="ZURI" className="h-8 w-auto" />
        </Link>
        <h1 className="text-xl font-bold text-zuri-black">Forgot password?</h1>
        <p className="text-sm text-gray-500 mt-1">Enter your Zuri Tap email and we’ll send a reset link.</p>
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50"
              placeholder="you@example.com"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-zuri-black text-white py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <Link to="/tap/login" className="mt-4 block text-center text-sm text-gray-500 hover:text-zuri-orange">
          ← Back to sign in
        </Link>
      </div>
    </div>
  )
}

export default TapForgotPassword
