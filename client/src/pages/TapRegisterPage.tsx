import { useState, FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import axios from 'axios'
import { Link } from 'react-router-dom'

function TapRegisterPage(): JSX.Element {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const redirect = searchParams.get('redirect') || '/zuri-tap'

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await axios.post<{ user: { id: string; email: string }; token: string }>('/api/tap-auth/register', {
        email,
        password,
        name: name.trim() || undefined
      })
      localStorage.setItem('zuri_tap_token', res.data.token)
      navigate(redirect)
      window.location.reload()
    } catch (err) {
      setError(axios.isAxiosError(err) ? (err.response?.data?.error || 'Registration failed') : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#fefbf5]">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-lg border border-gray-100 p-6">
        <Link to="/zuri-tap" className="block mb-4">
          <img src="/ZURI.png" alt="ZURI" className="h-8 w-auto" />
        </Link>
        <h1 className="text-xl font-bold text-zuri-black">Create Zuri Tap account</h1>
        <p className="text-sm text-gray-500 mt-1">Sign up once, pay in one tap at any Zuri business</p>

        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Name (optional)</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50"
              placeholder="Your name"
            />
          </div>
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
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50"
              placeholder="••••••••"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-zuri-orange text-white py-3 rounded-xl font-semibold disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-gray-500">
          Already have an account?{' '}
          <Link to={`/tap/login?redirect=${encodeURIComponent(redirect)}`} className="font-semibold text-zuri-orange hover:underline">
            Sign in
          </Link>
        </p>
        <Link to="/zuri-tap" className="mt-4 block text-center text-xs text-gray-400 hover:text-zuri-orange">← Back to Zuri Tap</Link>
      </div>
    </div>
  )
}

export default TapRegisterPage
