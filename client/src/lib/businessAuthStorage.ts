import { normalizeUuid } from './normalizeUuid'

const BUSINESS_TOKEN_KEY = 'zuri_business_token'
const BUSINESS_ID_KEY = 'zuri_business_id'

let inMemoryToken: string | null = null
let inMemoryId: string | null = null

function getSessionStorage(): Storage | null {
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/** Remove legacy persistent copies so closing the tab always requires a fresh login. */
function purgePersistentAuthCopies(): void {
  try {
    getLocalStorage()?.removeItem(BUSINESS_TOKEN_KEY)
    getLocalStorage()?.removeItem(BUSINESS_ID_KEY)
  } catch {
    /* ignore */
  }
  if (typeof document === 'undefined') return
  try {
    document.cookie = `${BUSINESS_TOKEN_KEY}=; Path=/; Max-Age=0; SameSite=Lax`
    document.cookie = `${BUSINESS_ID_KEY}=; Path=/; Max-Age=0; SameSite=Lax`
  } catch {
    /* ignore */
  }
}

function readSession(key: string): string | null {
  try {
    return getSessionStorage()?.getItem(key) || null
  } catch {
    return null
  }
}

function writeSession(key: string, value: string): boolean {
  try {
    const session = getSessionStorage()
    if (!session) return false
    session.setItem(key, value)
    return session.getItem(key) === value
  } catch {
    return false
  }
}

export function getBusinessToken(): string | null {
  if (typeof window === 'undefined') return null
  purgePersistentAuthCopies()
  return readSession(BUSINESS_TOKEN_KEY) || inMemoryToken
}

export function getBusinessId(): string | null {
  if (typeof window === 'undefined') return null
  purgePersistentAuthCopies()
  const raw = readSession(BUSINESS_ID_KEY) || inMemoryId
  if (!raw) return null
  return normalizeUuid(raw)
}

export function setBusinessToken(token: string): boolean {
  if (typeof window === 'undefined') return false
  purgePersistentAuthCopies()
  inMemoryToken = token
  return writeSession(BUSINESS_TOKEN_KEY, token) || inMemoryToken === token
}

export function setBusinessId(businessId: string): boolean {
  if (typeof window === 'undefined') return false
  purgePersistentAuthCopies()
  const cleaned = normalizeUuid(businessId) || businessId
  inMemoryId = cleaned
  return writeSession(BUSINESS_ID_KEY, cleaned) || inMemoryId === cleaned
}

/** Tab-scoped session only (sessionStorage + memory). Survives refresh; dies when the tab closes. */
export function setBusinessSession(token: string, businessId: string): boolean {
  const tokenOk = setBusinessToken(token)
  const idOk = setBusinessId(businessId)
  return tokenOk && idOk
}

export function clearBusinessAuth(): void {
  if (typeof window === 'undefined') return
  inMemoryToken = null
  inMemoryId = null
  try {
    getSessionStorage()?.removeItem(BUSINESS_TOKEN_KEY)
    getSessionStorage()?.removeItem(BUSINESS_ID_KEY)
  } catch {
    /* ignore */
  }
  purgePersistentAuthCopies()
}

export function isBusinessLoggedIn(): boolean {
  return Boolean(getBusinessToken() && getBusinessId())
}

/** True while the user is inside the authenticated business workspace. */
export function isBusinessWorkspacePath(pathname: string): boolean {
  const p = String(pathname || '')
  return (
    p.startsWith('/business/dashboard/') ||
    p.startsWith('/business/onboarding/') ||
    p.startsWith('/subscribe/') ||
    p === '/upgrade-done' ||
    p === '/scan' ||
    p.startsWith('/scan/')
  )
}
