import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Business, BusinessFormData } from '../types'

function BusinessLogin(): JSX.Element {
  const [isLogin, setIsLogin] = useState<boolean>(true)
  const [formData, setFormData] = useState<BusinessFormData>({
    name: '',
    email: '',
    password: '',
    phone: '',
    address: ''
  })
  const [error, setError] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (isLogin) {
        const response = await axios.post<Business & { token?: string }>('/api/business/login', {
          email: formData.email,
          password: formData.password
        })
        const token = response.data.token
        if (token) localStorage.setItem('zuri_business_token', token)
        if (response.data.id) localStorage.setItem('zuri_business_id', response.data.id)
        navigate(`/business/dashboard/${response.data.id}`)
      } else {
        await axios.post<Business>('/api/business/register', {
          name: formData.name,
          email: formData.email,
          password: formData.password,
          phone: formData.phone || undefined,
          address: formData.address || undefined
        })
        alert('Registration successful! Please login.')
        setIsLogin(true)
        setFormData({ name: '', email: '', password: '', phone: '', address: '' })
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        setError(err.response?.data?.error || 'An error occurred')
      } else {
        setError('An error occurred')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-8 px-4 bg-black">
      <div className="w-full max-w-4xl">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col md:flex-row min-h-[480px]">
          {/* Left panel – dark with motivational message and subtle orange shapes */}
          <div className="md:w-[42%] bg-gradient-to-b from-zuri-black to-gray-900 relative overflow-hidden rounded-t-2xl md:rounded-tr-none md:rounded-l-2xl flex items-center p-6 md:p-8">
            <div className="absolute inset-0 opacity-90">
              <div className="absolute bottom-0 left-0 right-0 h-3/4 bg-gradient-to-t from-zuri-orange/20 via-transparent to-transparent" />
              <div className="absolute inset-0 bg-[length:32px_100%] bg-[linear-gradient(90deg,rgba(249,115,22,0.04)_1px,transparent_1px)]" />
            </div>
            {/* Subtle vertical gradient bars */}
            <div className="absolute bottom-0 left-0 right-0 h-2/3 flex items-end justify-around gap-2 px-6 pb-8 opacity-60">
              {[40, 56, 72, 48, 64, 52, 36].map((h, i) => (
                <div
                  key={i}
                  className="w-2 rounded-full bg-gradient-to-t from-zuri-orange/80 to-transparent flex-shrink-0"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
            <p className="relative text-white text-lg md:text-xl font-medium leading-tight max-w-[240px]">
              Turn your ideas into a successful business.
            </p>
          </div>

          {/* Right panel – form */}
          <div className="md:w-[58%] bg-white p-6 md:p-8 flex flex-col justify-center rounded-b-2xl md:rounded-bl-none md:rounded-r-2xl">
            <img src="/ZURI.png" alt="ZURI" className="h-10 w-auto object-contain mb-4" />
            <h1 className="text-xl md:text-2xl font-bold text-zuri-black">
              {isLogin ? 'Log in' : 'Get started'}
            </h1>
            <p className="text-gray-500 text-xs mt-0.5 mb-4">
              {isLogin ? 'Welcome back to ZURI' : "Welcome to ZURI — Let's get started."}
            </p>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 px-3 py-2 rounded-lg mb-3 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              {!isLogin && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-0.5">Business name</label>
                  <input
                    type="text"
                    placeholder="Your business name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange placeholder:text-gray-400 text-zuri-black"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">
                  {isLogin ? 'Email' : 'Your email'}
                </label>
                <input
                  type="email"
                  placeholder="hi@yourbusiness.com"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange placeholder:text-gray-400 text-zuri-black"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-0.5">
                  {isLogin ? 'Password' : 'Create new password'}
                </label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  required
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange placeholder:text-gray-400 text-zuri-black"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-zuri-orange text-white py-2 rounded-full font-semibold text-sm hover:bg-zuri-orange-dark transition disabled:opacity-50 mt-1"
              >
                {loading ? 'Processing…' : (isLogin ? 'Log in' : 'Create new account')}
              </button>
            </form>

            <p className="mt-4 text-center text-xs text-gray-500">
              {isLogin ? (
                <>
                  No account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setIsLogin(false)
                      setError('')
                      setFormData({ name: '', email: '', password: '', phone: '', address: '' })
                    }}
                    className="font-semibold text-zuri-orange hover:underline"
                  >
                    Register
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setIsLogin(true)
                      setError('')
                      setFormData({ name: '', email: '', password: '', phone: '', address: '' })
                    }}
                    className="font-semibold text-zuri-orange hover:underline"
                  >
                    Log in
                  </button>
                </>
              )}
            </p>

            <a href="/" className="mt-4 block text-center text-xs text-gray-400 hover:text-zuri-orange transition">
              ← Back to home
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BusinessLogin
