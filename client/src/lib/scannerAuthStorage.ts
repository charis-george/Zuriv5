import { getBusinessToken } from './businessAuthStorage'

const SCANNER_TOKEN_KEY = 'zuri_scanner_token'
const SCANNER_BUSINESS_ID_KEY = 'zuri_scanner_business_id'
const SCANNER_BUSINESS_NAME_KEY = 'zuri_scanner_business_name'

let inMemoryToken: string | null = null
let inMemoryId: string | null = null
let inMemoryName: string | null = null

function getStorageSafe(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

function readFromStorages(key: string): string | null {
  const local = getStorageSafe('local')
  const session = getStorageSafe('session')
  return local?.getItem(key) || session?.getItem(key) || null
}

function writeToStorages(key: string, value: string): boolean {
  const local = getStorageSafe('local')
  if (local) {
    try {
      local.setItem(key, value)
      return true
    } catch {
      /* ignore */
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
  return false
}

export function getScannerToken(): string | null {
  if (typeof window === 'undefined') return null
  return readFromStorages(SCANNER_TOKEN_KEY) || inMemoryToken
}

export function getScannerBusinessId(): string | null {
  if (typeof window === 'undefined') return null
  return readFromStorages(SCANNER_BUSINESS_ID_KEY) || inMemoryId
}

export function getScannerBusinessName(): string | null {
  if (typeof window === 'undefined') return null
  return readFromStorages(SCANNER_BUSINESS_NAME_KEY) || inMemoryName
}

export function setScannerSession(token: string, businessId: string, businessName: string): boolean {
  if (typeof window === 'undefined') return false
  inMemoryToken = token
  inMemoryId = businessId
  inMemoryName = businessName
  const tokenOk = writeToStorages(SCANNER_TOKEN_KEY, token)
  const idOk = writeToStorages(SCANNER_BUSINESS_ID_KEY, businessId)
  const nameOk = writeToStorages(SCANNER_BUSINESS_NAME_KEY, businessName)
  return tokenOk && idOk && nameOk
}

export function clearScannerSession(): void {
  if (typeof window === 'undefined') return
  inMemoryToken = null
  inMemoryId = null
  inMemoryName = null
  getStorageSafe('local')?.removeItem(SCANNER_TOKEN_KEY)
  getStorageSafe('local')?.removeItem(SCANNER_BUSINESS_ID_KEY)
  getStorageSafe('local')?.removeItem(SCANNER_BUSINESS_NAME_KEY)
  getStorageSafe('session')?.removeItem(SCANNER_TOKEN_KEY)
  getStorageSafe('session')?.removeItem(SCANNER_BUSINESS_ID_KEY)
  getStorageSafe('session')?.removeItem(SCANNER_BUSINESS_NAME_KEY)
}

export function isScannerConnected(): boolean {
  return Boolean(getScannerToken() && getScannerBusinessId())
}

/** Token for ticket verification: full business login takes priority over scanner-only session. */
export function getTicketVerifyAuthToken(): string | null {
  return getBusinessToken() || getScannerToken()
}

export function hasTicketVerifyAuth(): boolean {
  return Boolean(getBusinessToken()) || isScannerConnected()
}
