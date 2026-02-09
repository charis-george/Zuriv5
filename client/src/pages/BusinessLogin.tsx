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
        const response = await axios.post<Business>('/api/business/login', {
          email: formData.email,
          password: formData.password
        })
        navigate(`/business/dashboard/${response.data.id}`)
      } else {
        await axios.post<Business>('/api/business/register', formData)
        alert('Registration successful! Please login.')
        setIsLogin(true)
        setFormData({ ...formData, name: '', phone: '', address: '' })
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
    <div className="min-h-screen bg-zuri-light flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <div className="w-12 h-12 bg-zuri-yellow rounded-lg flex items-center justify-center">
                <svg className="w-7 h-7 text-zuri-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </div>
              <span className="text-3xl font-bold text-zuri-black" style={{ fontFamily: 'brush script, cursive' }}>
                ZURI
              </span>
            </div>
            <h1 className="text-2xl font-bold text-zuri-black">
              {isLogin ? 'Business Login' : 'Business Registration'}
            </h1>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <input
                type="text"
                placeholder="Business Name *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                required
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
              />
            )}
            <input
              type="email"
              placeholder="Email *"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
            />
            <input
              type="password"
              placeholder="Password *"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
            />
            {!isLogin && (
              <>
                <input
                  type="tel"
                  placeholder="Phone Number"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                />
                <input
                  type="text"
                  placeholder="Address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                />
              </>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-zuri-black text-white py-3 rounded-lg font-semibold hover:bg-gray-800 transition disabled:opacity-50"
            >
              {loading ? 'Processing...' : (isLogin ? 'Login' : 'Register')}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => {
                setIsLogin(!isLogin)
                setError('')
                setFormData({ name: '', email: '', password: '', phone: '', address: '' })
              }}
              className="text-zuri-black hover:text-zuri-yellow transition"
            >
              {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
            </button>
          </div>

          <div className="mt-6 text-center">
            <a href="/" className="text-gray-600 hover:text-zuri-yellow transition">
              ← Back to Home
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BusinessLogin
