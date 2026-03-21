import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import axios from 'axios'
import App from './App'
import { API_BASE_URL } from './lib/apiBase'
import './index.css'

if (API_BASE_URL) {
  axios.defaults.baseURL = API_BASE_URL
}

const el = document.getElementById('root')
if (!el) throw new Error('Root element #root not found')

createRoot(el).render(
  <StrictMode>
    <App />
  </StrictMode>
)
