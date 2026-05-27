import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import App from './App'
import { API_BASE_URL } from './lib/apiBase'
import './index.css'
import './styles/paystack-zuri.css'
import { configureResilientHttp } from './lib/networkResilience'

configureResilientHttp()

if (API_BASE_URL) {
  axios.defaults.baseURL = API_BASE_URL
} else if (import.meta.env.PROD && typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
  console.warn(
    '[ZURI] VITE_API_URL was not set at build time. Hosted frontends must set it to your API origin (e.g. Railway URL) or API calls will hit the wrong host.'
  )
}

const el = document.getElementById('root')
if (!el) throw new Error('Root element #root not found')

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>
)
