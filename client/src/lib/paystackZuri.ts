/** Paystack Inline v2 — loaded from CDN (no npm dep; reliable on Vercel). */
const PAYSTACK_INLINE_SRC = 'https://js.paystack.co/v2/inline.js'

/** ZURI brand tokens — also set in Paystack Dashboard → Settings → Branding */
export const ZURI_PAYSTACK_BRAND = {
  primary: '#ffbd59',
  primaryHover: '#f5a623',
  accent: '#ffcd1c',
  black: '#171717',
  light: '#fffdf5',
  logoUrl: 'https://zuriqo.com/ZURI.png',
} as const

export type PaystackInitializePayload = {
  authorizationUrl?: string | null
  accessCode?: string | null
  reference: string
}

type PaystackResumeCallbacks = {
  onLoad?: (payload: { id: number; customer: object; accessCode: string }) => void
  onSuccess?: (payload: { id: number; reference: string; message: string }) => void
  onCancel?: () => void
  onError?: (payload: { message: string }) => void
}

interface PaystackPopInstance {
  isLoaded(): boolean
  resumeTransaction(accessCode: string, callbacks?: PaystackResumeCallbacks): unknown
}

type PaystackPopConstructor = new () => PaystackPopInstance

let loadPromise: Promise<PaystackPopConstructor> | null = null
let popInstance: PaystackPopInstance | null = null
let preloadStarted = false
let themeObserver: MutationObserver | null = null

function loadPaystackPopCtor(): Promise<PaystackPopConstructor> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Paystack is only available in the browser'))
  }
  if (loadPromise) return loadPromise

  loadPromise = new Promise((resolve, reject) => {
    const w = window as Window & { PaystackPop?: PaystackPopConstructor }
    if (w.PaystackPop) {
      resolve(w.PaystackPop)
      return
    }

    const existing = document.querySelector(`script[src="${PAYSTACK_INLINE_SRC}"]`)
    if (existing) {
      const started = Date.now()
      const poll = window.setInterval(() => {
        if (w.PaystackPop) {
          window.clearInterval(poll)
          resolve(w.PaystackPop)
        } else if (Date.now() - started > 20000) {
          window.clearInterval(poll)
          reject(new Error('Paystack load timeout'))
        }
      }, 80)
      return
    }

    const script = document.createElement('script')
    script.src = PAYSTACK_INLINE_SRC
    script.async = true
    script.onload = () => {
      if (w.PaystackPop) resolve(w.PaystackPop)
      else reject(new Error('Paystack script loaded but PaystackPop is unavailable'))
    }
    script.onerror = () => reject(new Error('Failed to load Paystack checkout'))
    document.head.appendChild(script)
  })

  return loadPromise
}

async function getPaystackPop(): Promise<PaystackPopInstance> {
  if (!popInstance) {
    const Ctor = await loadPaystackPopCtor()
    popInstance = new Ctor()
  }
  return popInstance
}

/** Warm Paystack inline on slow networks before the user taps Pay. */
export function preloadPaystackInline(): void {
  if (preloadStarted || typeof window === 'undefined') return
  preloadStarted = true
  void loadPaystackPopCtor()
    .then(async (Ctor) => {
      popInstance = new Ctor()
      if (typeof popInstance.isLoaded === 'function') popInstance.isLoaded()
    })
    .catch(() => {
      /* non-fatal */
    })
}

function ensurePaystackThemeObserver(): void {
  if (typeof document === 'undefined' || themeObserver) return
  themeObserver = new MutationObserver(() => {
    document.querySelectorAll('iframe[src*="paystack"]').forEach((iframe) => {
      const el = iframe as HTMLIFrameElement
      el.style.borderRadius = '12px'
      el.style.maxWidth = '100%'
      const parent = el.parentElement
      if (parent && !parent.dataset.zuriPaystackChrome) {
        parent.dataset.zuriPaystackChrome = '1'
        parent.style.borderRadius = '16px'
        parent.style.overflow = 'hidden'
      }
    })
  })
  themeObserver.observe(document.body, { childList: true, subtree: true })
}

function showZuriPaystackOverlay(message = 'Opening secure payment…'): void {
  ensurePaystackThemeObserver()
  let root = document.getElementById('zuri-paystack-overlay')
  if (!root) {
    root = document.createElement('div')
    root.id = 'zuri-paystack-overlay'
    root.setAttribute('role', 'dialog')
    root.setAttribute('aria-modal', 'true')
    root.setAttribute('aria-label', 'ZURI payment')
    document.body.appendChild(root)
  }

  root.innerHTML = `
    <div class="zuri-paystack-overlay__panel">
      <img src="/ZURI.png" alt="" width="48" height="48" class="zuri-paystack-overlay__logo" />
      <p class="zuri-paystack-overlay__title">ZURI Pay</p>
      <p class="zuri-paystack-overlay__msg" id="zuri-paystack-overlay-msg"></p>
      <div class="zuri-paystack-overlay__spinner" aria-hidden="true"></div>
      <p class="zuri-paystack-overlay__hint">Works on slow connections — please keep this page open.</p>
    </div>
  `

  const msgEl = document.getElementById('zuri-paystack-overlay-msg')
  if (msgEl) msgEl.textContent = message
  root.classList.add('zuri-paystack-overlay--visible')
  document.body.style.overflow = 'hidden'
}

function hideZuriPaystackOverlay(): void {
  const root = document.getElementById('zuri-paystack-overlay')
  if (root) root.classList.remove('zuri-paystack-overlay--visible')
  document.body.style.overflow = ''
}

export type OpenZuriPaystackOptions = {
  accessCode: string
  authorizationUrl?: string | null
  reference: string
  onSuccess: (reference: string) => void
  onCancel?: () => void
  onError?: (message: string) => void
  slowRedirectFallbackMs?: number
}

export async function openZuriPaystackCheckout(options: OpenZuriPaystackOptions): Promise<void> {
  const {
    accessCode,
    authorizationUrl,
    reference,
    onSuccess,
    onCancel,
    onError,
    slowRedirectFallbackMs = 14000,
  } = options

  preloadPaystackInline()
  showZuriPaystackOverlay('Connecting to Paystack…')

  let loaded = false
  let settled = false

  const finish = (): void => {
    if (settled) return
    settled = true
    hideZuriPaystackOverlay()
  }

  const fallbackTimer = window.setTimeout(() => {
    if (!loaded && authorizationUrl) {
      settled = true
      hideZuriPaystackOverlay()
      window.location.href = authorizationUrl
    }
  }, slowRedirectFallbackMs)

  try {
    const pop = await getPaystackPop()
    pop.resumeTransaction(accessCode, {
      onLoad() {
        loaded = true
        window.clearTimeout(fallbackTimer)
        const msg = document.getElementById('zuri-paystack-overlay-msg')
        if (msg) msg.textContent = 'Complete payment below'
        hideZuriPaystackOverlay()
      },
      onSuccess(response) {
        window.clearTimeout(fallbackTimer)
        finish()
        onSuccess(response.reference || reference)
      },
      onCancel() {
        window.clearTimeout(fallbackTimer)
        finish()
        onCancel?.()
      },
      onError(err) {
        window.clearTimeout(fallbackTimer)
        finish()
        if (authorizationUrl) {
          window.location.href = authorizationUrl
          return
        }
        onError?.(err?.message || 'Payment could not load. Check your connection and try again.')
      },
    })
  } catch {
    window.clearTimeout(fallbackTimer)
    finish()
    if (authorizationUrl) {
      window.location.href = authorizationUrl
      return
    }
    onError?.('Payment could not load. Check your connection and try again.')
  }
}

export async function startZuriPayment(
  data: PaystackInitializePayload,
  opts?: {
    successPath?: string
    onCancel?: () => void
    onError?: (message: string) => void
  },
): Promise<void> {
  const ref = data.reference
  const successPath =
    opts?.successPath ??
    `${window.location.origin}/payment-done?reference=${encodeURIComponent(ref)}`

  if (!data.accessCode) {
    if (data.authorizationUrl) {
      window.location.href = data.authorizationUrl
      return
    }
    opts?.onError?.('Could not start payment')
    return
  }

  await openZuriPaystackCheckout({
    accessCode: data.accessCode,
    authorizationUrl: data.authorizationUrl,
    reference: ref,
    onSuccess: () => {
      window.location.href = successPath
    },
    onCancel: opts?.onCancel,
    onError: opts?.onError,
  })
}
