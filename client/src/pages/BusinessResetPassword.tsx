import { useState, FormEvent, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'

function BusinessResetPassword(): JSX.Element {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) setError('Missing reset link. Request a new one from the login page.')
  }, [token])

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) return setError('Passwords do not match')
    if (newPassword.length < 6) return setError('Password must be at least 6 characters')
    setLoading(true)
    try {
      await axios.post('/api/business/reset-password', { token, newPassword })
      setSuccess(true)
      setTimeout(() => navigate('/business/login'), 2000)
    } catch (err) {
      setError(axios.isAxiosError(err) ? (err.response?.data?.error || 'Something went wrong') : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen w-full bg-zuri-black text-white flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <img src="/ZURI.png" alt="ZURI" className="h-9 w-auto object-contain mx-auto mb-4" />
          <h1 className="text-xl font-semibold mb-2">Password updated</h1>
          <p className="text-zuri-light/80 text-sm">Redirecting you to log in…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-zuri-black text-white flex flex-col md:flex-row">
      <div className="relative flex-1 flex items-center justify-center px-8 py-10">
        <div className="absolute inset-0 opacity-90">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,189,89,0.18),_transparent_55%)]" />
        </div>
        <div className="relative max-w-sm w-full space-y-3">
          <img src="/ZURI.png" alt="ZURI" className="h-9 w-auto object-contain mb-2" />
          <h1 className="text-2xl font-semibold">Set new password</h1>
          <p className="text-zuri-light/80 text-sm">
            Choose a new password for your ZURI business account.
          </p>
        </div>
      </div>
      <div className="w-full md:w-[420px] bg-white text-zuri-black flex items-center justify-center px-6 py-10 md:px-8">
        <div className="w-full max-w-sm">
          <h2 className="text-xl md:text-2xl font-semibold">New password</h2>
          <p className="text-gray-500 text-xs mt-1 mb-5">At least 6 characters.</p>

          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 px-3 py-2 rounded-lg mb-3 text-xs">
              {error}
            </div>
          )}

          {!token ? (
            <Link to="/business/forgot-password" className="text-sm text-zuri-orange hover:underline">
              Request a new reset link
            </Link>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">New password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange placeholder:text-gray-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Confirm password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange placeholder:text-gray-400"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-zuri-orange text-white py-2.5 rounded-lg font-semibold text-[13px] leading-none hover:bg-zuri-orange-dark transition-colors disabled:opacity-60"
              >
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}

          <Link to="/business/login" className="mt-4 block text-center text-xs text-gray-400 hover:text-zuri-orange transition-colors">
            ← Back to log in
          </Link>
        </div>
      </div>
    </div>
  )
}

export default BusinessResetPassword
