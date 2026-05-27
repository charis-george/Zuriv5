const TAP_TOKEN_KEY = 'zuri_tap_token'
let inMemoryToken: string | null = null

function getStorageSafe(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

function readTapCookie(): string | null {
  if (typeof document === 'undefined') return null
  const key = `${TAP_TOKEN_KEY}=`
  const parts = document.cookie ? document.cookie.split(';') : []
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.startsWith(key)) return decodeURIComponent(trimmed.slice(key.length))
  }
  return null
}

function writeTapCookie(token: string): boolean {
  if (typeof document === 'undefined') return false
  try {
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${TAP_TOKEN_KEY}=${encodeURIComponent(token)}; Path=/; SameSite=Lax${secure}; Max-Age=2592000`
    return readTapCookie() === token
  } catch {
    return false
  }
}

export function getTapToken(): string | null {
  if (typeof window === 'undefined') return null
  const local = getStorageSafe('local')
  const session = getStorageSafe('session')
  return local?.getItem(TAP_TOKEN_KEY) || session?.getItem(TAP_TOKEN_KEY) || readTapCookie() || inMemoryToken
}

export function setTapToken(token: string): boolean {
  if (typeof window === 'undefined') return false
  inMemoryToken = token
  const local = getStorageSafe('local')
  if (local) {
    try {
      local.setItem(TAP_TOKEN_KEY, token)
      return true
    } catch {
      // Safari private mode or storage quota can throw.
    }
  }
  const session = getStorageSafe('session')
  if (session) {
    try {
      session.setItem(TAP_TOKEN_KEY, token)
      return true
    } catch {
      return false
    }
  }
  if (writeTapCookie(token)) return true
  return inMemoryToken === token
}

export function clearTapToken(): void {
  if (typeof window === 'undefined') return
  inMemoryToken = null
  getStorageSafe('local')?.removeItem(TAP_TOKEN_KEY)
  getStorageSafe('session')?.removeItem(TAP_TOKEN_KEY)
  if (typeof document !== 'undefined') {
    document.cookie = `${TAP_TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax`
  }
}
