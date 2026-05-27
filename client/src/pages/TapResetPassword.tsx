import { useState, FormEvent, useEffect } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { apiUrl } from '../lib/apiBase'
import { formatUserFacingError } from '../lib/formatApiError'

function TapResetPassword(): JSX.Element {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const token = searchParams.get('token') || ''
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) setError('Missing reset link. Request a new one from the sign-in page.')
  }, [token])

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) return setError('Passwords do not match')
    if (newPassword.length < 6) return setError('Password must be at least 6 characters')
    setLoading(true)
    try {
      await axios.post(apiUrl('/api/tap-auth/reset-password'), { token, newPassword })
      setSuccess(true)
      setTimeout(() => navigate('/tap/login'), 2000)
    } catch (err) {
      setError(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Unable to update password. Please try again.')
          : 'Unable to update password. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[#fefbf5]">
        <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 p-6 text-center">
          <img src="/ZURI.png" alt="ZURI" className="h-8 w-auto mx-auto mb-4" />
          <h1 className="text-xl font-bold text-zuri-black">Password updated</h1>
          <p className="text-sm text-gray-500 mt-2">Redirecting you to sign in…</p>
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
        <h1 className="text-xl font-bold text-zuri-black">Set new password</h1>
        <p className="text-sm text-gray-500 mt-1">Choose a new password for your Zuri Tap account (at least 6 characters).</p>
        {error && (
          <div className="mt-4 p-3 bg-red-50 border border-red-100 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}
        {!token ? (
          <Link to="/tap/forgot-password" className="mt-4 inline-block text-sm font-semibold text-zuri-orange hover:underline">Request a new reset link</Link>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">New password</label>
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50" placeholder="••••••••" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Confirm password</label>
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6} className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50" placeholder="••••••••" />
            </div>
            <button type="submit" disabled={loading} className="w-full bg-zuri-black text-white py-3 rounded-xl font-semibold disabled:opacity-50">
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </form>
        )}
        <Link to="/tap/login" className="mt-4 block text-center text-sm text-gray-500 hover:text-zuri-orange">
          ← Back to sign in
        </Link>
      </div>
    </div>
  )
}

export default TapResetPassword
