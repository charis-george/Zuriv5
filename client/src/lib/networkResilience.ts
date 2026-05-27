import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

const DEFAULT_TIMEOUT_MS = 90_000
const MAX_RETRIES = 2
const RETRYABLE_STATUS = new Set([408, 429, 502, 503, 504])

type RetryConfig = InternalAxiosRequestConfig & {
  __zuriRetryCount?: number
  /** Skip automatic retries (e.g. QR image generation). */
  zuriSkipRetry?: boolean
}

function shouldRetry(error: AxiosError): boolean {
  const cfg = error.config as RetryConfig | undefined
  if (!cfg || cfg.zuriSkipRetry) return false
  const count = cfg.__zuriRetryCount ?? 0
  if (count >= MAX_RETRIES) return false
  if (!error.response) {
    return (
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNABORTED' ||
      error.message === 'Network Error'
    )
  }
  return RETRYABLE_STATUS.has(error.response.status)
}

/** Longer timeouts + retries for poor mobile networks (e.g. NG). */
export function configureResilientHttp(): void {
  axios.defaults.timeout = DEFAULT_TIMEOUT_MS

  axios.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      if (!shouldRetry(error)) return Promise.reject(error)
      const cfg = error.config as RetryConfig
      cfg.__zuriRetryCount = (cfg.__zuriRetryCount ?? 0) + 1
      const delayMs = cfg.__zuriRetryCount * 1500
      await new Promise((resolve) => window.setTimeout(resolve, delayMs))
      return axios(cfg)
    },
  )
}
