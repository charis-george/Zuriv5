const GUEST_TOKEN_KEY = 'zuri_guest_token'
const CROSS_VENUE_OPT_IN_KEY = 'zuri_cross_venue_opt_in'

function randomToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `zgt_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`
}

export function getOrCreateGuestToken(): string {
  if (typeof window === 'undefined') return ''
  let t = localStorage.getItem(GUEST_TOKEN_KEY)
  if (!t || t.length < 8) {
    t = randomToken()
    localStorage.setItem(GUEST_TOKEN_KEY, t)
  }
  return t
}

export function getCrossVenueOptIn(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(CROSS_VENUE_OPT_IN_KEY) === '1'
}

export function setCrossVenueOptIn(value: boolean): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(CROSS_VENUE_OPT_IN_KEY, value ? '1' : '0')
}
