/**
 * Production: set VITE_API_URL in Vercel (or .env) to your backend origin, e.g. https://zuri-api.railway.app
 * Dev: leave unset so /api is proxied by Vite to localhost:3000
 */
export const API_BASE_URL = (() => {
  const raw = import.meta.env.VITE_API_URL
  if (typeof raw !== 'string' || !raw.trim()) return ''
  return raw.trim().replace(/\/$/, '')
})()

/** Full URL for a path starting with /api/... */
export function apiUrl(path: string): string {
  const p = path.startsWith('/') ? path : `/${path}`
  return API_BASE_URL ? `${API_BASE_URL}${p}` : p
}
