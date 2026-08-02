import { normalizeUuid } from './normalizeUuid'

const BUSINESS_TOKEN_KEY = 'zuri_business_token'
const BUSINESS_ID_KEY = 'zuri_business_id'

let inMemoryToken: string | null = null
let inMemoryId: string | null = null

function getStorageSafe(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

function readCookie(key: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${key}=`
  const parts = document.cookie ? document.cookie.split(';') : []
  for (const part of parts) {
    const trimmed = part.trim()
    if (trimmed.startsWith(prefix)) return decodeURIComponent(trimmed.slice(prefix.length))
  }
  return null
}

function writeCookie(key: string, value: string): boolean {
  if (typeof document === 'undefined') return false
  try {
    const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${key}=${encodeURIComponent(value)}; Path=/; SameSite=Lax${secure}; Max-Age=2592000`
    return readCookie(key) === value
  } catch {
    return false
  }
}

function clearCookie(key: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${key}=; Path=/; Max-Age=0; SameSite=Lax`
}

function readFromStorages(key: string): string | null {
  const local = getStorageSafe('local')
  const session = getStorageSafe('session')
  return local?.getItem(key) || session?.getItem(key) || readCookie(key) || null
}

function writeToStorages(key: string, value: string): boolean {
  const local = getStorageSafe('local')
  if (local) {
    try {
      local.setItem(key, value)
      return true
    } catch {
      /* Safari private mode or quota */
    }
  }
  const session = getStorageSafe('session')
  if (session) {
    try {
      session.setItem(key, value)
      return true
    } catch {
      /* ignore */
    }
  }
  if (writeCookie(key, value)) return true
  if (key === BUSINESS_TOKEN_KEY) return inMemoryToken === value
  if (key === BUSINESS_ID_KEY) return inMemoryId === value
  return false
}

export function getBusinessToken(): string | null {
  if (typeof window === 'undefined') return null
  return readFromStorages(BUSINESS_TOKEN_KEY) || inMemoryToken
}

export function getBusinessId(): string | null {
  if (typeof window === 'undefined') return null
  const raw = readFromStorages(BUSINESS_ID_KEY) || inMemoryId
  if (!raw) return null
  return normalizeUuid(raw)
}

export function setBusinessToken(token: string): boolean {
  if (typeof window === 'undefined') return false
  inMemoryToken = token
  return writeToStorages(BUSINESS_TOKEN_KEY, token)
}

export function setBusinessId(businessId: string): boolean {
  if (typeof window === 'undefined') return false
  const cleaned = normalizeUuid(businessId) || businessId
  inMemoryId = cleaned
  return writeToStorages(BUSINESS_ID_KEY, cleaned)
}

/** Persist token and business id (Safari-safe: local → session → cookie → memory). */
export function setBusinessSession(token: string, businessId: string): boolean {
  const tokenOk = setBusinessToken(token)
  const idOk = setBusinessId(businessId)
  return tokenOk && idOk
}

export function clearBusinessAuth(): void {
  if (typeof window === 'undefined') return
  inMemoryToken = null
  inMemoryId = null
  getStorageSafe('local')?.removeItem(BUSINESS_TOKEN_KEY)
  getStorageSafe('local')?.removeItem(BUSINESS_ID_KEY)
  getStorageSafe('session')?.removeItem(BUSINESS_TOKEN_KEY)
  getStorageSafe('session')?.removeItem(BUSINESS_ID_KEY)
  clearCookie(BUSINESS_TOKEN_KEY)
  clearCookie(BUSINESS_ID_KEY)
}

export function isBusinessLoggedIn(): boolean {
  return Boolean(getBusinessToken() && getBusinessId())
}
