import { useState, useEffect, useRef, useCallback, FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import io, { Socket } from 'socket.io-client'
import { Business, MenuCategory, MenuItem, Order, CustomerInfo, OrderItem, SavedCard, StorefrontDetails, type GuestMenuLang } from '../types'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'
import { mergeStorefrontConfig, getStorefrontTheme } from '../lib/storefrontTheme'
import { ticketPreviewQrImageUrl, ticketPreviewQrPayload, ticketOrderHoldQrPayload } from '../lib/ticketPreviewQr'
import { StorefrontCustomerLayout } from '../components/storefront/StorefrontCustomerLayout'
import { StorefrontMenuGrid, type GuestDietaryPrefs } from '../components/storefront/StorefrontMenuGrid'
import { CustomDropdown } from '../components/CustomDropdown'
import {
  getOrCreateGuestToken,
  getCrossVenueOptIn,
  setCrossVenueOptIn
} from '../lib/guestPersonalizationStorage'
import {
  EMPTY_GUEST_INSIGHTS,
  type GuestPersonalizationInsights
} from '../types/guestPersonalization'
import { preloadPaystackInline, startZuriPayment } from '../lib/paystackZuri'
import { clearStorefrontCache, readStorefrontCache, writeStorefrontCache } from '../lib/storefrontCache'
import { usePageSeo } from '../lib/seo'
import { formatUserFacingError } from '../lib/formatApiError'

const WS_URL =
  (import.meta.env.VITE_WS_URL as string) ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : (typeof window !== 'undefined' ? window.location.origin : ''))

interface CartItem extends MenuItem {
  quantity: number
}

const DEFAULT_STOREFRONT_DETAILS: StorefrontDetails = {
  name: '',
  tagline: '',
  cuisineTags: []
}

function guestReorderStorageKey(businessId: string): string {
  return `zuri_guest_reorder_${businessId}`
}

function formatReserveCountdown(deadlineMs: number, _tick: number): string {
  const secLeft = Math.max(0, Math.floor((deadlineMs - Date.now()) / 1000))
  const m = Math.floor(secLeft / 60)
  const s = secLeft % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function OrderPage(): JSX.Element {
  const { businessId: rawBusinessId } = useParams<{ businessId: string }>()
  const businessId = rawBusinessId ? decodeURIComponent(rawBusinessId).trim() : undefined
  const [business, setBusiness] = useState<Business | null>(null)
  const [menu, setMenu] = useState<MenuCategory[]>([])
  const [cart, setCart] = useState<CartItem[]>([])
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo>({ name: '', phone: '', email: '' })
  const [orderPlaced, setOrderPlaced] = useState<boolean>(false)
  const [orderDetails, setOrderDetails] = useState<Order | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [saveCard, setSaveCard] = useState<boolean>(true)
  const [savedCards, setSavedCards] = useState<SavedCard[]>([])
  const [selectedSavedCardId, setSelectedSavedCardId] = useState<string | null>(null)
  const [paymentLoading, setPaymentLoading] = useState<boolean>(false)
  const [ticketingStep, setTicketingStep] = useState<'tickets' | 'contact' | 'summary'>('tickets')
  const [reserveTick, setReserveTick] = useState(0)
  const reserveDeadlineRef = useRef<number | null>(null)
  const [tickFirstName, setTickFirstName] = useState('')
  const [tickLastName, setTickLastName] = useState('')
  const [tickEmail, setTickEmail] = useState('')
  const [tickEmailConfirm, setTickEmailConfirm] = useState('')
  const [tickPhone, setTickPhone] = useState('')
  const [tickTermsAccepted, setTickTermsAccepted] = useState(false)
  const [checkoutSnapshot, setCheckoutSnapshot] = useState<Array<{ name: string; qty: number; lineTotal: number }>>([])
  const [guestInsights, setGuestInsights] = useState<GuestPersonalizationInsights>({ ...EMPTY_GUEST_INSIGHTS })
  const [crossVenueOptIn, setCrossVenueOptInState] = useState<boolean>(() => getCrossVenueOptIn())
  const [menuLang, setMenuLang] = useState<GuestMenuLang>('en')
  const [guestDietary, setGuestDietary] = useState<GuestDietaryPrefs>({})
  const [expandedTicketId, setExpandedTicketId] = useState<string | null>(null)
  const [reorderHintIds, setReorderHintIds] = useState<string[]>([])
  const [staleMenuCache, setStaleMenuCache] = useState(false)

  const refetchQrBusiness = useCallback(async (): Promise<void> => {
    if (!businessId) return
    try {
      const { data } = await axios.get<Business>(`/api/qr/business/${businessId}`)
      setBusiness((prev) => (prev ? { ...prev, ...data } : data))
    } catch {
      /* keep existing state */
    }
  }, [businessId])

  const refetchGuestInsights = useCallback(async (): Promise<void> => {
    if (!businessId) return
    const guestToken = getOrCreateGuestToken()
    const email = customerInfo.email?.trim() || tickEmail?.trim() || ''
    try {
      const params = new URLSearchParams()
      if (guestToken) params.set('guestToken', guestToken)
      if (email) params.set('email', email)
      params.set('crossVenueOptIn', crossVenueOptIn ? '1' : '0')
      const { data } = await axios.get<GuestPersonalizationInsights>(
        `/api/menu/business/${businessId}/guest-insights?${params.toString()}`
      )
      setGuestInsights({
        trendingItemIds: Array.isArray(data?.trendingItemIds) ? data.trendingItemIds : [],
        upsellSeedIds: Array.isArray(data?.upsellSeedIds) ? data.upsellSeedIds : [],
        forYouItemIds: Array.isArray(data?.forYouItemIds) ? data.forYouItemIds : [],
        reorderItemIds: Array.isArray(data?.reorderItemIds) ? data.reorderItemIds : [],
        crossVenuePicks: Array.isArray(data?.crossVenuePicks) ? data.crossVenuePicks : [],
        itemSignals: data?.itemSignals && typeof data.itemSignals === 'object' ? data.itemSignals : {},
        personalisationActive: !!data?.personalisationActive,
        crossVenueOptIn: !!data?.crossVenueOptIn,
        guestRnr: data?.guestRnr && typeof data.guestRnr === 'object' ? data.guestRnr : undefined
      })
      if (typeof data?.crossVenueOptIn === 'boolean') {
        setCrossVenueOptInState(data.crossVenueOptIn)
        setCrossVenueOptIn(data.crossVenueOptIn)
      }
    } catch {
      setGuestInsights({ ...EMPTY_GUEST_INSIGHTS })
    }
  }, [businessId, customerInfo.email, tickEmail, crossVenueOptIn])

  const syncGuestIdentity = useCallback(async (): Promise<void> => {
    const guestToken = getOrCreateGuestToken()
    const email = customerInfo.email?.trim() || tickEmail?.trim() || ''
    if (!guestToken && !email) return
    try {
      await axios.post('/api/menu/guest/identity', {
        guestToken: guestToken || undefined,
        email: email || undefined,
        crossVenueOptIn
      })
    } catch {
      /* non-blocking */
    }
  }, [customerInfo.email, tickEmail, crossVenueOptIn])

  useEffect(() => {
    if (!businessId || business?.businessMode === 'ticketing') return
    void syncGuestIdentity().then(() => refetchGuestInsights())
  }, [businessId, business?.businessMode, syncGuestIdentity, refetchGuestInsights])

  const storefrontConfig = mergeStorefrontConfig(business?.storefrontConfig ?? undefined)
  const storefrontDetails: StorefrontDetails = {
    ...DEFAULT_STOREFRONT_DETAILS,
    ...(business?.storefrontDetails ?? {})
  }
  const theme = getStorefrontTheme(storefrontConfig)
  const isTicketing = business?.businessMode === 'ticketing'
  const brand = storefrontConfig.brandColor || '#f97316'
  const ag = storefrontConfig.aiGuest ?? {}
  const storefrontName = storefrontDetails.name?.trim() || business?.name?.trim() || 'Storefront'

  usePageSeo({
    title: `ZURI | ${storefrontName}`,
    description: business
      ? `${storefrontName} on ZURI. Browse ${isTicketing ? 'tickets' : 'the menu'} and place your order online.`
      : 'Browse this ZURI storefront and place your order online.',
    path: businessId ? `/order/${businessId}` : '/order',
  })

  useEffect(() => {
    if (!businessId) return

    preloadPaystackInline()

    const cached = readStorefrontCache(businessId)
    if (cached) {
      setBusiness(cached.business)
      setMenu(cached.menu)
      setLoading(false)
      setStaleMenuCache(true)
    }

    void Promise.allSettled([
      axios.get<Business>(`/api/qr/business/${businessId}`),
      axios.get<MenuCategory[]>(`/api/menu/business/${businessId}`),
    ]).then(([bizResult, menuResult]) => {
      let nextBusiness: Business | null = cached?.business ?? null
      let nextMenu: MenuCategory[] = cached?.menu ?? []

      if (bizResult.status === 'fulfilled') {
        nextBusiness = bizResult.value.data
        setBusiness(nextBusiness)
        setError(null)
      } else if (!cached) {
        const err = bizResult.reason
        if (axios.isAxiosError(err) && err.response?.status === 404 && businessId) {
          clearStorefrontCache(businessId)
        }
        setError(
          axios.isAxiosError(err)
            ? formatUserFacingError(
                err.response?.data,
                err.response?.status === 404
                  ? 'Business not found. Check the link or ask the venue for a new QR code.'
                  : 'Could not load this storefront. Try again in a moment.'
              )
            : 'Business not found. Check the link or ask the venue for a new QR code.'
        )
      }

      if (menuResult.status === 'fulfilled') {
        nextMenu = menuResult.value.data
        setMenu(nextMenu)
      } else if (!cached && bizResult.status === 'fulfilled') {
        const err = menuResult.reason
        setError(
          axios.isAxiosError(err)
            ? formatUserFacingError(err.response?.data, 'Failed to load menu')
            : 'Failed to load menu'
        )
      }

      if (nextBusiness && nextMenu.length >= 0) {
        writeStorefrontCache(businessId, nextBusiness, nextMenu)
        setStaleMenuCache(false)
      }
      setLoading(false)
    })

    const socket: Socket = io(WS_URL)
    socket.emit('join-storefront', businessId)

    socket.on('storefront-updated', (payload: { config?: unknown; details?: unknown; businessMode?: Business['businessMode'] }) => {
      setBusiness((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          storefrontConfig: (payload.config as Business['storefrontConfig']) ?? prev.storefrontConfig,
          storefrontDetails: (payload.details as Business['storefrontDetails']) ?? prev.storefrontDetails,
          ...(payload.businessMode === 'menu' || payload.businessMode === 'ticketing'
            ? { businessMode: payload.businessMode }
            : {})
        }
      })
      void refetchQrBusiness().then(() => {
        void refetchGuestInsights()
      })
    })

    socket.on('order-ready', (order: Order) => {
      setOrderDetails((current) => {
        if (current && order.id === current.id) {
          alert('Your order is ready!')
        }
        return current
      })
    })

    return () => {
      socket.disconnect()
    }
  }, [businessId, refetchQrBusiness, refetchGuestInsights])

  useEffect(() => {
    if (!businessId) return
    const onVis = (): void => {
      if (document.visibilityState !== 'visible') return
      void refetchQrBusiness().then(() => {
        void refetchGuestInsights()
      })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [businessId, refetchQrBusiness, refetchGuestInsights])

  useEffect(() => {
    if (orderPlaced) preloadPaystackInline()
  }, [orderPlaced])

  useEffect(() => {
    if (!businessId) return
    if (business?.businessMode === 'ticketing') {
      setGuestInsights({ ...EMPTY_GUEST_INSIGHTS })
      return
    }
    void refetchGuestInsights()
  }, [businessId, business?.businessMode, refetchGuestInsights])

  useEffect(() => {
    if (!businessId) return
    try {
      const raw = sessionStorage.getItem(`zuri_guest_prefs_${businessId}`)
      if (raw) {
        const p = JSON.parse(raw) as GuestDietaryPrefs
        if (p && typeof p === 'object') setGuestDietary(p)
      }
    } catch {
      /* ignore */
    }
  }, [businessId])

  useEffect(() => {
    if (!businessId) return
    try {
      const raw = sessionStorage.getItem(guestReorderStorageKey(businessId))
      if (!raw) {
        setReorderHintIds([])
        return
      }
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) {
        setReorderHintIds(parsed.filter((x): x is string => typeof x === 'string'))
      } else {
        setReorderHintIds([])
      }
    } catch {
      setReorderHintIds([])
    }
  }, [businessId])

  const persistReorderIds = useCallback(
    (ids: string[]) => {
      if (!ids.length) return
      setReorderHintIds((prev) => {
        const s = new Set(prev)
        ids.forEach((id) => s.add(id))
        const next = [...s]
        if (businessId) {
          try {
            sessionStorage.setItem(guestReorderStorageKey(businessId), JSON.stringify(next))
          } catch {
            /* ignore */
          }
        }
        return next
      })
    },
    [businessId]
  )

  useEffect(() => {
    if (!orderPlaced || !orderDetails || !businessId) return
    const email = (orderDetails as Order & { customer_email?: string }).customer_email ?? orderDetails.customerEmail ?? customerInfo.email
    if (!email) return
    axios.get<SavedCard[]>(`/api/payment/saved-cards?email=${encodeURIComponent(email)}&businessId=${businessId}`)
      .then(res => {
        setSavedCards(res.data || [])
        if (res.data?.length) setSelectedSavedCardId(res.data[0].id)
      })
      .catch(() => setSavedCards([]))
  }, [orderPlaced, orderDetails, businessId])

  useEffect(() => {
    if (!isTicketing) return
    const t = window.setInterval(() => setReserveTick((n) => n + 1), 1000)
    return () => window.clearInterval(t)
  }, [isTicketing])

  useEffect(() => {
    if (business?.businessMode === 'ticketing' && reserveDeadlineRef.current === null) {
      reserveDeadlineRef.current = Date.now() + 10 * 60 * 1000
      setReserveTick((n) => n + 1)
    }
  }, [business?.businessMode])

  const toggleGuestDietary = (key: keyof GuestDietaryPrefs): void => {
    setGuestDietary((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      if (businessId) {
        try {
          sessionStorage.setItem(`zuri_guest_prefs_${businessId}`, JSON.stringify(next))
        } catch {
          /* ignore */
        }
      }
      return next
    })
  }

  const addToCart = (item: MenuItem): void => {
    if (!item.available) return
    const groupSize = item.groupSize && item.groupSize > 1 ? item.groupSize : 1
    const minQty = Math.max(item.minPerOrder || 1, groupSize)
    const maxQty = item.maxPerUser || Infinity

    const existingItem = cart.find((cartItem) => cartItem.id === item.id)
    if (existingItem) {
      const next = existingItem.quantity + groupSize
      if (next > maxQty) return
      setCart(
        cart.map((cartItem) => (cartItem.id === item.id ? { ...cartItem, quantity: next } : cartItem))
      )
    } else {
      const startQty = Math.min(minQty, maxQty)
      setCart([...cart, { ...item, quantity: startQty }])
    }
    persistReorderIds([item.id])
  }

  const removeFromCart = (itemId: string): void => {
    setCart(cart.filter(item => item.id !== itemId))
  }

  const updateQuantity = (itemId: string, quantity: number): void => {
    if (quantity <= 0) {
      removeFromCart(itemId)
      return
    }
    setCart(cart.map(item =>
      item.id === itemId ? { ...item, quantity } : item
    ))
  }

  const getTotal = (): number => {
    return cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
  }

  const placeOrderWithCustomer = async (info: CustomerInfo): Promise<boolean> => {
    if (!businessId) return false
    if (cart.length === 0) {
      alert('Your cart is empty')
      return false
    }

    try {
      const orderItems: OrderItem[] = cart.map(item => ({
        menuItemId: item.id,
        quantity: item.quantity,
        price: item.price
      }))

      const totalQty = cart.reduce((sum, i) => sum + i.quantity, 0)
      const weightedSum = cart.reduce((sum, i) => {
        const prep = Number(i.estimatedPrepTime)
        const safePrep = Number.isFinite(prep) ? prep : 15
        return sum + safePrep * i.quantity
      }, 0)
      const estimatedPrepTime = totalQty > 0 ? Math.round(weightedSum / totalQty) : 15

      const response = await axios.post<Order>('/api/order', {
        businessId,
        customerName: info.name,
        customerPhone: info.phone,
        customerEmail: info.email,
        guestToken: getOrCreateGuestToken(),
        items: orderItems,
        estimatedPrepTime
      })

      setOrderDetails(response.data)
      setOrderPlaced(true)
      persistReorderIds(cart.map((i) => i.id))
      setCart([])
      return true
    } catch (err) {
      alert('Failed to place order. Please try again.')
      console.error(err)
      return false
    }
  }

  const handlePlaceOrder = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault()

    if (cart.length === 0) {
      alert('Your cart is empty')
      return
    }

    if (!customerInfo.name || !customerInfo.phone) {
      alert('Please provide your name and phone number')
      return
    }

    if (!customerInfo.email?.trim()) {
      alert('Email is required for payment. Please enter your email.')
      return
    }

    await placeOrderWithCustomer(customerInfo)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <PaperPlaneLoader size="lg" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-zuri-black mb-4">Error</h1>
          <p className="text-gray-600 text-sm mb-6">{error}</p>
          <a href="/" className="text-zuri-orange font-semibold text-sm hover:underline">Back to home</a>
        </div>
      </div>
    )
  }

  if (business && isTicketing && !orderPlaced && !loading) {
    const deadline = reserveDeadlineRef.current ?? Date.now() + 10 * 60 * 1000
    const timerStr = formatReserveCountdown(deadline, reserveTick)
    const eventTitle = storefrontDetails.name?.trim() || business.name || 'Event'
    const flatItems = menu.flatMap((cat) => cat.items.map((it) => ({ ...it, categoryName: cat.name })))
    const ticketQty = cart.reduce((sum, i) => sum + i.quantity, 0)

    const stepCircle = (opts: { n: string; active: boolean; done: boolean }): JSX.Element => {
      const { n, active, done } = opts
      return (
        <span
          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] border-2 font-bold"
          style={
            done
              ? { backgroundColor: brand, borderColor: brand, color: '#fff' }
              : active
                ? { borderColor: brand, color: brand, backgroundColor: `${brand}10` }
                : { borderColor: theme.border, color: theme.sub, backgroundColor: theme.panel }
          }
        >
          {done ? '✓' : n}
        </span>
      )
    }

    const ticketingStepper = (
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-medium" style={{ color: theme.sub }}>Checkout</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: theme.text }}>
          <div className="flex items-center gap-1.5 shrink-0">
            {stepCircle({ n: '1', active: ticketingStep === 'tickets', done: ticketingStep !== 'tickets' })}
            <span style={{ color: ticketingStep === 'tickets' ? brand : theme.text }}>Tickets</span>
          </div>
          <div className="flex-1 h-px" style={{ background: theme.border }} />
          <div className="flex items-center gap-1.5 shrink-0">
            {stepCircle({
              n: '2',
              active: ticketingStep === 'contact',
              done: ticketingStep === 'summary'
            })}
            <span style={{ color: ticketingStep === 'contact' ? brand : theme.text }}>Contact</span>
          </div>
          <div className="flex-1 h-px" style={{ background: theme.border }} />
          <div className="flex items-center gap-1.5 shrink-0">
            {stepCircle({ n: '3', active: ticketingStep === 'summary', done: false })}
            <span style={{ color: ticketingStep === 'summary' ? brand : theme.sub }}>Summary</span>
          </div>
          <div className="flex-1 h-px" style={{ background: theme.border }} />
          <div className="flex items-center gap-1.5 shrink-0" style={{ color: theme.sub }}>
            <span
              className="w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px]"
              style={{ borderColor: theme.border }}
            >
              4
            </span>
            <span>Payment</span>
          </div>
        </div>
      </div>
    )

    const reserveBanner = (
      <div
        className="rounded-2xl border px-4 py-3 text-sm mb-6"
        style={{ borderColor: theme.border, background: theme.page, color: theme.text }}
      >
        We&apos;ve reserved your selection. Complete checkout within{' '}
        <span className="font-bold" style={{ color: brand }}>{timerStr}</span> to secure your tickets.
      </div>
    )

    const inputClass =
      'w-full border rounded-xl px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/40 focus:border-zuri-orange'

    return (
      <div
        className="relative min-h-screen"
        style={{ paddingBottom: 'max(7.5rem, calc(env(safe-area-inset-bottom, 0px) + 5.5rem))', background: theme.page }}
      >
        <StorefrontCustomerLayout
          config={storefrontConfig}
          details={storefrontDetails}
          businessNameFallback={business.name}
          logoUrl={business.logoUrl}
          phone={business.phone}
          headerRight={
            <div className="flex items-center gap-3 sm:gap-4 shrink-0">
              <div className="text-right min-w-[52px]">
                <p className="text-xs" style={{ color: theme.sub }}>Selection</p>
                <p className="text-sm font-bold" style={{ color: theme.text }}>
                  {ticketQty} {ticketQty === 1 ? 'ticket' : 'tickets'}
                </p>
              </div>
              <div
                className="rounded-xl px-3 sm:px-4 py-2 border"
                style={{
                  backgroundColor: `${storefrontConfig.brandColor}14`,
                  borderColor: `${storefrontConfig.brandColor}44`
                }}
              >
                <p className="font-bold text-sm" style={{ color: storefrontConfig.brandColor }}>
                  ₦{getTotal().toFixed(2)}
                </p>
              </div>
            </div>
          }
        >
          <div className="max-w-lg mx-auto -mt-2">
            {ticketingStepper}
            {reserveBanner}

            {ticketingStep === 'tickets' && (
              <>
                <div className="flex items-center gap-2 mb-5">
                  <button
                    type="button"
                    aria-label="Back"
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: brand }}
                    onClick={() => window.history.back()}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h1 className="text-2xl sm:text-[28px] leading-tight font-bold" style={{ color: theme.text }}>
                    Choose tickets
                  </h1>
                </div>
                <p className="text-base font-medium mb-1" style={{ color: theme.text }}>{eventTitle}</p>
                {storefrontDetails.tagline ? (
                  <p className="text-sm mb-6" style={{ color: theme.sub }}>{storefrontDetails.tagline}</p>
                ) : (
                  <div className="mb-6" />
                )}

                <div className="space-y-5">
                  {flatItems.length === 0 ? (
                    <p className="text-sm" style={{ color: theme.sub }}>No ticket types are available yet.</p>
                  ) : (
                    flatItems.map((item) => {
                      const inCart = cart.find((c) => c.id === item.id)
                      const qty = inCart?.quantity ?? 0
                      const expanded = expandedTicketId === item.id && item.available
                      const qrSrc = ticketPreviewQrImageUrl(
                        ticketPreviewQrPayload(businessId || '', item.id),
                        120
                      )
                      return (
                        <div
                          key={item.id}
                          className="border rounded-2xl p-4 flex flex-col gap-3"
                          style={{ borderColor: theme.border, background: theme.panel }}
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0 flex-1">
                              <p className="font-bold" style={{ color: theme.text }}>{item.name}</p>
                              <p className="text-lg font-bold mt-1" style={{ color: brand }}>₦{Number(item.price).toFixed(2)}</p>
                              {item.description ? (
                                <p className="text-sm mt-2 line-clamp-3" style={{ color: theme.sub }}>{item.description}</p>
                              ) : null}
                              {item.available ? (
                                <button
                                  type="button"
                                  className="mt-2 text-xs font-semibold underline-offset-2 hover:underline"
                                  style={{ color: brand }}
                                  onClick={() => setExpandedTicketId((prev: string | null) => (prev === item.id ? null : item.id))}
                                >
                                  {expanded ? 'Hide sample receipt & QR' : 'Sample receipt & entry QR'}
                                </button>
                              ) : null}
                            </div>
                            <div className="shrink-0 min-w-[80px]">
                              <label className="sr-only" htmlFor={`qty-${item.id}`}>Quantity</label>
                              {(() => {
                                const groupSz = item.groupSize && item.groupSize > 1 ? item.groupSize : 1
                                const maxQty = item.maxPerUser || 20
                                const minQty = Math.max(item.minPerOrder || 1, groupSz)
                                const qtyOptions: { value: string; label: string }[] = [{ value: '0', label: '0' }]
                                for (let v = minQty; v <= maxQty; v += groupSz) {
                                  qtyOptions.push({
                                    value: String(v),
                                    label: groupSz > 1 ? `${v} (${v / groupSz} group${v / groupSz > 1 ? 's' : ''})` : String(v)
                                  })
                                }
                                return (
                                  <CustomDropdown
                                    options={qtyOptions}
                                    value={String(qty)}
                                    disabled={!item.available}
                                    onChange={(val) => {
                                      const n = parseInt(val, 10)
                                      if (!Number.isFinite(n) || n < 0 || !item.available) return
                                      if (n === 0) {
                                        removeFromCart(item.id)
                                        return
                                      }
                                      if (inCart) {
                                        updateQuantity(item.id, n)
                                      } else {
                                        setCart([...cart, { ...item, quantity: n }])
                                      }
                                    }}
                                    triggerClassName="font-semibold min-w-[72px]"
                                    triggerStyle={{ borderColor: theme.border, background: theme.page, color: theme.text }}
                                    size="sm"
                                  />
                                )
                              })()}
                              {item.maxPerUser ? (
                                <p className="text-[10px] mt-1 text-center" style={{ color: theme.sub }}>Max {item.maxPerUser}</p>
                              ) : null}
                              {item.groupSize && item.groupSize > 1 ? (
                                <p className="text-[10px] mt-0.5 text-center" style={{ color: theme.sub }}>Sold in {item.groupSize}s</p>
                              ) : null}
                            </div>
                          </div>
                          {expanded ? (
                            <div
                              className="pt-3 border-t flex flex-col sm:flex-row gap-4"
                              style={{ borderColor: theme.border }}
                            >
                              <div
                                className="flex-1 rounded-xl border px-3 py-2.5 text-left"
                                style={{ borderColor: theme.border, background: theme.page }}
                              >
                                <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: theme.sub }}>
                                  Ticket receipt (sample)
                                </p>
                                <p className="text-xs font-semibold" style={{ color: theme.text }}>{item.name}</p>
                                <p className="text-[11px] tabular-nums mt-0.5" style={{ color: theme.sub }}>
                                  {eventTitle} · Qty {qty || 1} · Unit ₦{Number(item.price).toFixed(2)}
                                </p>
                                <p className="text-[10px] mt-2 leading-snug" style={{ color: theme.sub }}>
                                  After payment, your receipt email includes a unique QR. Staff scan it once to confirm valid entry for this event.
                                </p>
                              </div>
                              <div className="shrink-0 flex flex-col items-center gap-1.5">
                                <img
                                  src={qrSrc}
                                  alt=""
                                  className="w-28 h-28 rounded-lg border bg-white p-1"
                                  style={{ borderColor: theme.border }}
                                />
                                <span className="text-[10px] text-center max-w-[9rem]" style={{ color: theme.sub }}>
                                  Sample QR for this ticket type (final codes are issued after payment).
                                </span>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      )
                    })
                  )}
                </div>
              </>
            )}

            {ticketingStep === 'contact' && (
              <>
                <div className="flex items-center gap-2 mb-5">
                  <button
                    type="button"
                    aria-label="Back"
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: brand }}
                    onClick={() => setTicketingStep('tickets')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h1 className="text-2xl sm:text-[28px] leading-tight font-bold" style={{ color: theme.text }}>Your details</h1>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                      First name <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={tickFirstName}
                      onChange={(e) => setTickFirstName(e.target.value)}
                      className={inputClass}
                      style={{ borderColor: theme.border, background: theme.panel, color: theme.text }}
                      autoComplete="given-name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                      Last name <span className="text-red-500">*</span>
                    </label>
                    <input
                      value={tickLastName}
                      onChange={(e) => setTickLastName(e.target.value)}
                      className={inputClass}
                      style={{ borderColor: theme.border, background: theme.panel, color: theme.text }}
                      autoComplete="family-name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                      Email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={tickEmail}
                      onChange={(e) => setTickEmail(e.target.value)}
                      className={inputClass}
                      style={{ borderColor: theme.border, background: theme.panel, color: theme.text }}
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                      Confirm email <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      value={tickEmailConfirm}
                      onChange={(e) => setTickEmailConfirm(e.target.value)}
                      className={inputClass}
                      style={{ borderColor: theme.border, background: theme.panel, color: theme.text }}
                      autoComplete="email"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: theme.text }}>
                      Phone <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      value={tickPhone}
                      onChange={(e) => setTickPhone(e.target.value)}
                      className={inputClass}
                      style={{ borderColor: theme.border, background: theme.panel, color: theme.text }}
                      autoComplete="tel"
                    />
                  </div>
                </div>
              </>
            )}
            {ticketingStep === 'summary' && (
              <>
                <div className="flex items-center gap-2 mb-5">
                  <button
                    type="button"
                    aria-label="Back"
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: brand }}
                    onClick={() => setTicketingStep('contact')}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h1 className="text-2xl sm:text-[28px] leading-tight font-bold" style={{ color: theme.text }}>Order summary</h1>
                </div>
                <div className="rounded-2xl border p-4" style={{ borderColor: theme.border, background: theme.panel }}>
                  <p className="text-xl font-bold mb-4 leading-tight" style={{ color: theme.text }}>{eventTitle}</p>
                  <div className="space-y-3 text-sm border-t border-b py-4" style={{ borderColor: theme.border }}>
                    {cart.map((line) => (
                      <div key={line.id} className="flex justify-between gap-2">
                        <span style={{ color: theme.sub }}>{line.quantity} × {line.name}</span>
                        <span className="font-semibold tabular-nums" style={{ color: theme.text }}>₦{(line.price * line.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="pt-4 space-y-3 text-[15px]">
                    <div className="flex justify-between items-center">
                      <span style={{ color: theme.sub }}>Fees</span>
                      <span className="text-sm" style={{ color: theme.sub }}>Calculated at payment</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span style={{ color: theme.sub }}>Subtotal</span>
                      <span className="font-semibold tabular-nums" style={{ color: theme.text }}>₦{getTotal().toFixed(2)}</span>
                    </div>
                    <div
                      className="rounded-xl border px-3 py-2.5 text-sm"
                      style={{ borderColor: theme.border, background: theme.page, color: theme.sub }}
                    >
                      Promos or discounts, if any, are applied on the payment step.
                    </div>
                    <div className="flex justify-between items-center pt-2">
                      <span className="text-xl font-bold" style={{ color: theme.text }}>Total</span>
                      <span className="text-xl font-bold tabular-nums" style={{ color: theme.text }}>₦{getTotal().toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </StorefrontCustomerLayout>

        <div
          className="fixed bottom-0 left-0 right-0 z-40 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex items-center justify-between gap-3 shadow-lg border-t rounded-t-2xl sm:rounded-2xl sm:left-1/2 sm:-translate-x-1/2 sm:max-w-lg sm:w-full"
          style={{ backgroundColor: theme.panel, borderColor: theme.border }}
        >
          <p className="text-lg font-bold tabular-nums" style={{ color: theme.text }}>₦{getTotal().toFixed(2)}</p>
          {ticketingStep === 'tickets' ? (
            <button
              type="button"
              className="rounded-xl px-5 py-2.5 text-sm font-bold shadow-sm text-white transition hover:opacity-95"
              style={{ backgroundColor: brand }}
              onClick={() => {
                if (cart.length === 0) {
                  alert('Select at least one ticket.')
                  return
                }
                setTicketingStep('contact')
              }}
            >
              Continue
            </button>
          ) : ticketingStep === 'contact' ? (
            <button
              type="button"
              className="rounded-xl px-5 py-2.5 text-sm font-bold shadow-sm text-white transition hover:opacity-95"
              style={{ backgroundColor: brand }}
              onClick={() => {
                const fn = tickFirstName.trim()
                const ln = tickLastName.trim()
                if (!fn || !ln) {
                  alert('Please enter your first and last name.')
                  return
                }
                const em = tickEmail.trim()
                const em2 = tickEmailConfirm.trim()
                if (!em || !em2) {
                  alert('Please enter and confirm your email.')
                  return
                }
                if (em !== em2) {
                  alert('Email addresses do not match.')
                  return
                }
                const phone = tickPhone.trim()
                if (!phone) {
                  alert('Phone number is required.')
                  return
                }
                setTicketingStep('summary')
              }}
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl px-5 py-2.5 text-sm font-bold shadow-sm text-white transition hover:opacity-95"
              style={{ backgroundColor: brand }}
              onClick={async () => {
                const fn = tickFirstName.trim()
                const ln = tickLastName.trim()
                const em = tickEmail.trim()
                const phone = tickPhone.trim()
                const snap = cart.map((c) => ({
                  name: c.name,
                  qty: c.quantity,
                  lineTotal: c.price * c.quantity
                }))
                setCheckoutSnapshot(snap)
                const info: CustomerInfo = {
                  name: `${fn} ${ln}`.trim(),
                  phone,
                  email: em
                }
                setCustomerInfo(info)
                const ok = await placeOrderWithCustomer(info)
                if (!ok) return
              }}
            >
              Continue to payment
            </button>
          )}
        </div>
      </div>
    )
  }

  if (orderPlaced && orderDetails) {
    const orderTotal = (orderDetails as Order & { total_amount?: number }).total_amount ?? orderDetails.totalAmount ?? 0
    const orderPrepTime = (orderDetails as Order & { estimated_prep_time?: number }).estimated_prep_time ?? orderDetails.estimatedPrepTime ?? 15
    const orderIdShort = (orderDetails.id ?? '').slice(0, 8).toUpperCase()
    const createdAt = orderDetails.createdAt ?? (orderDetails as Order & { created_at?: string }).created_at

    const deadlinePay = reserveDeadlineRef.current ?? Date.now() + 10 * 60 * 1000
    const timerPay = formatReserveCountdown(deadlinePay, reserveTick)

    const payStepDone = (
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] border-2 text-white"
        style={{ backgroundColor: brand, borderColor: brand }}
      >
        ✓
      </span>
    )
    const payStepCurrent = (
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] border-2 font-bold"
        style={{ borderColor: brand, color: brand, backgroundColor: `${brand}10` }}
      >
        4
      </span>
    )

    return (
      <div
        className={`min-h-screen py-8 px-4 ${isTicketing ? 'pb-36' : 'bg-[#f5f5f5]'}`}
        style={isTicketing ? { background: theme.page } : undefined}
      >
        <div className="max-w-md mx-auto">
          {isTicketing && (
            <div className="mb-6">
              <p className="text-sm font-medium mb-2" style={{ color: theme.sub }}>Checkout</p>
              <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: theme.text }}>
                <div className="flex items-center gap-1.5 shrink-0">
                  {payStepDone}
                  <span>Tickets</span>
                </div>
                <div className="flex-1 h-px" style={{ background: theme.border }} />
                <div className="flex items-center gap-1.5 shrink-0">
                  {payStepDone}
                  <span>Contact</span>
                </div>
                <div className="flex-1 h-px" style={{ background: theme.border }} />
                <div className="flex items-center gap-1.5 shrink-0">
                  {payStepDone}
                  <span>Summary</span>
                </div>
                <div className="flex-1 h-px" style={{ background: theme.border }} />
                <div className="flex items-center gap-1.5 shrink-0">
                  {payStepCurrent}
                  <span style={{ color: brand }}>Payment</span>
                </div>
              </div>
              <div
                className="rounded-xl border px-4 py-3 text-sm mt-4"
                style={{ borderColor: theme.border, background: theme.panel, color: theme.text }}
              >
                Complete payment within{' '}
                <span className="font-bold" style={{ color: brand }}>{timerPay}</span> to confirm your tickets.
              </div>
            </div>
          )}
          <div
            className={isTicketing ? 'p-0' : 'bg-white rounded-xl border border-gray-200 p-8'}
            style={isTicketing ? { color: theme.text } : undefined}
          >
            {!isTicketing && (
              <div className="w-14 h-14 rounded-xl bg-zuri-orange/15 flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-zuri-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            )}
            <h1
              className={`${isTicketing ? 'text-2xl sm:text-[28px] leading-tight' : 'text-xl'} font-bold mb-2 ${isTicketing ? 'text-left' : 'text-center text-zuri-black'}`}
              style={isTicketing ? { color: theme.text } : undefined}
            >
              {isTicketing ? 'Payment' : 'Your order has been submitted'}
            </h1>
            <p className={`text-sm mb-8 ${isTicketing ? 'text-left' : 'text-center'}`} style={{ color: isTicketing ? theme.sub : undefined }}>
              {isTicketing
                ? 'Pay securely to confirm your tickets. You will receive a confirmation email with your entry QR codes.'
                : 'We’ll notify you when it’s ready.'}
            </p>

            {isTicketing && checkoutSnapshot.length > 0 && (
              <div className="mb-6 border rounded-2xl p-4" style={{ borderColor: theme.border, background: theme.panel }}>
                <p className="text-sm font-bold mb-3" style={{ color: theme.text }}>
                  {storefrontDetails.name?.trim() || business?.name || 'Receipt'}
                </p>
                <div className="space-y-2 text-sm">
                  {checkoutSnapshot.map((line, idx) => (
                    <div key={`${line.name}-${idx}`} className="flex justify-between gap-2">
                      <span style={{ color: theme.sub }}>{line.qty} × {line.name}</span>
                      <span className="font-semibold tabular-nums" style={{ color: theme.text }}>₦{line.lineTotal.toFixed(2)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between text-sm pt-2 border-t font-bold" style={{ borderColor: theme.border }}>
                    <span style={{ color: theme.text }}>Total</span>
                    <span style={{ color: brand }}>₦{Number(orderTotal).toFixed(2)}</span>
                  </div>
                </div>
                {businessId && orderDetails.id ? (
                  <div className="mt-4 flex flex-col sm:flex-row gap-4 items-center sm:items-start pt-4 border-t" style={{ borderColor: theme.border }}>
                    <img
                      src={ticketPreviewQrImageUrl(ticketOrderHoldQrPayload(businessId, orderDetails.id), 132)}
                      alt=""
                      className="w-[132px] h-[132px] rounded-xl border bg-white p-1 shrink-0"
                      style={{ borderColor: theme.border }}
                    />
                    <p className="text-xs leading-relaxed sm:pt-1" style={{ color: theme.sub }}>
                      This QR encodes your pending order. After successful payment, your confirmation email will include a one-time receipt QR for scanning at the door.
                    </p>
                  </div>
                ) : null}
              </div>
            )}

            <div className="space-y-4 mb-8">
              {orderDetails.returningZuriCustomer && orderDetails.zuriCustomerStats && !isTicketing && (
                <div className="mb-6 p-3 rounded-xl bg-zuri-orange/10 border border-zuri-orange/20">
                  <p className="text-sm font-medium text-zuri-black">
                    Returning Zuri customer – average spend ₦{orderDetails.zuriCustomerStats.avgOrderValue.toFixed(0)}
                  </p>
                  <p className="text-xs text-gray-600 mt-0.5">Save your card below for one-tap payment next time.</p>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Order ID</span>
                <span className="font-semibold text-zuri-black">{orderIdShort}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Date & time</span>
                <span className="font-semibold text-zuri-black">
                  {createdAt ? new Date(createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}
                </span>
              </div>
              {!isTicketing && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Est. prep time</span>
                  <span className="font-semibold text-zuri-black">{orderPrepTime} min</span>
                </div>
              )}
              {!isTicketing && (
                <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
                  <span className="text-gray-500">Total</span>
                  <span className="font-bold text-zuri-orange">₦{Number(orderTotal).toFixed(2)}</span>
                </div>
              )}
            </div>

            {isTicketing && (
              <div className="mb-6 space-y-4">
                <div className="rounded-2xl border p-4" style={{ borderColor: theme.border, background: theme.panel }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: theme.text }}>Pay with card or bank</p>
                  <p className="text-xs" style={{ color: theme.sub }}>Visa, Mastercard, Verve, or bank transfer via Paystack.</p>
                </div>
                <label className="flex items-start gap-2 text-sm cursor-pointer" style={{ color: theme.text }}>
                  <input
                    type="checkbox"
                    checked={tickTermsAccepted}
                    onChange={(e) => setTickTermsAccepted(e.target.checked)}
                    className="mt-1 rounded border-gray-300"
                    style={{ accentColor: brand }}
                  />
                  <span>I accept the terms and authorize this purchase.</span>
                </label>
              </div>
            )}

            {/* Payment section */}
            <div className="space-y-4 mb-6">
              {savedCards.length > 0 && (
                <div className="text-left">
                  <p className="text-sm font-semibold text-zuri-black mb-2">Saved cards</p>
                  <div className="space-y-2">
                    {savedCards.map((card) => (
                      <label key={card.id} className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                        <input
                          type="radio"
                          name="savedCard"
                          checked={selectedSavedCardId === card.id}
                          onChange={() => setSelectedSavedCardId(card.id)}
                          className="text-zuri-orange focus:ring-zuri-orange"
                        />
                        <span className="text-zuri-black text-sm">•••• {card.last4}</span>
                        <span className="text-gray-500 text-xs">{card.card_type}</span>
                      </label>
                    ))}
                    <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-xl cursor-pointer hover:bg-gray-50">
                      <input
                        type="radio"
                        name="savedCard"
                        checked={selectedSavedCardId === ''}
                        onChange={() => setSelectedSavedCardId('')}
                        className="text-zuri-orange focus:ring-zuri-orange"
                      />
                      <span className="text-zuri-black text-sm">Pay with new card</span>
                    </label>
                  </div>
                </div>
              )}
              {selectedSavedCardId === '' && (
                <label className="flex items-center gap-2 text-left">
                  <input
                    type="checkbox"
                    checked={saveCard}
                    onChange={(e) => setSaveCard(e.target.checked)}
                    className="rounded border-gray-300 text-zuri-orange focus:ring-zuri-orange"
                  />
                  <span className="text-sm text-gray-600">Save card for next time</span>
                </label>
              )}
            </div>

            {!isTicketing && (
              <button
                onClick={async () => {
                  const email = (orderDetails as Order & { customer_email?: string }).customer_email ?? orderDetails.customerEmail ?? customerInfo.email
                  if (!email) {
                    alert('Email is required for payment. Please place another order and enter your email.')
                    return
                  }
                  setPaymentLoading(true)
                  try {
                    if (selectedSavedCardId && savedCards.some(c => c.id === selectedSavedCardId)) {
                      const { data } = await axios.post<{ success: boolean }>('/api/payment/charge-saved', {
                        email,
                        businessId,
                        orderId: orderDetails.id,
                        amount: orderTotal,
                        saved_card_id: selectedSavedCardId
                      })
                      if (data?.success) {
                        window.location.href = `${window.location.origin}/payment-done?reference=${orderDetails.id}`
                        return
                      } else alert('Payment failed. Try again.')
                    } else {
                      const { data } = await axios.post<{ authorizationUrl: string; accessCode?: string; reference: string }>('/api/payment/initialize', {
                        email,
                        amount: orderTotal,
                        orderId: orderDetails.id,
                        businessId,
                        callbackUrl: `${window.location.origin}/payment-done?reference=${orderDetails.id}`,
                        saveCard
                      })
                      await startZuriPayment(
                        {
                          authorizationUrl: data.authorizationUrl,
                          accessCode: data.accessCode,
                          reference: data.reference || orderDetails.id,
                        },
                        { onError: (msg) => alert(msg || 'Failed to start payment') },
                      )
                    }
                  } catch {
                    alert('Failed to start payment. Please try again.')
                  } finally {
                    setPaymentLoading(false)
                  }
                }}
                disabled={paymentLoading}
                className="w-full bg-zuri-orange text-white py-1.5 rounded-lg text-sm hover:bg-zuri-orange-dark transition disabled:opacity-70 mb-4"
              >
                {paymentLoading ? 'Processing…' : `Pay ₦${Number(orderTotal).toFixed(2)}`}
              </button>
            )}
            {!isTicketing && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full bg-white text-zuri-black border border-gray-200 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition"
              >
                Place another order
              </button>
            )}
          </div>
        </div>

        {isTicketing && (
          <div
            className="fixed bottom-0 left-0 right-0 z-40 px-4 py-3 flex items-center justify-between gap-3 shadow-lg border-t rounded-t-2xl sm:rounded-2xl sm:left-1/2 sm:-translate-x-1/2 sm:max-w-md sm:w-full"
            style={{ backgroundColor: theme.panel, borderColor: theme.border }}
          >
            <p className="text-lg font-bold tabular-nums" style={{ color: theme.text }}>₦{Number(orderTotal).toFixed(2)}</p>
            <button
              type="button"
              className="rounded-xl px-5 py-2.5 text-sm font-bold shadow-sm disabled:opacity-60 text-white transition hover:opacity-95"
              style={{ backgroundColor: brand }}
              disabled={paymentLoading}
              onClick={async () => {
                if (!tickTermsAccepted) {
                  alert('Please accept the terms to continue.')
                  return
                }
                const email = (orderDetails as Order & { customer_email?: string }).customer_email ?? orderDetails.customerEmail ?? customerInfo.email
                if (!email) {
                  alert('Email is required for payment.')
                  return
                }
                setPaymentLoading(true)
                try {
                  if (selectedSavedCardId && savedCards.some(c => c.id === selectedSavedCardId)) {
                    const { data } = await axios.post<{ success: boolean }>('/api/payment/charge-saved', {
                      email,
                      businessId,
                      orderId: orderDetails.id,
                      amount: orderTotal,
                      saved_card_id: selectedSavedCardId
                    })
                    if (data?.success) {
                      window.location.href = `${window.location.origin}/payment-done?reference=${orderDetails.id}`
                      return
                    } else alert('Payment failed. Try again.')
                  } else {
                    const { data } = await axios.post<{ authorizationUrl: string; accessCode?: string; reference: string }>('/api/payment/initialize', {
                      email,
                      amount: orderTotal,
                      orderId: orderDetails.id,
                      businessId,
                      callbackUrl: `${window.location.origin}/payment-done?reference=${orderDetails.id}`,
                      saveCard
                    })
                    await startZuriPayment(
                      {
                        authorizationUrl: data.authorizationUrl,
                        accessCode: data.accessCode,
                        reference: data.reference || orderDetails.id,
                      },
                      { onError: (msg) => alert(msg || 'Failed to start payment') },
                    )
                  }
                } catch {
                  alert('Failed to start payment. Please try again.')
                } finally {
                  setPaymentLoading(false)
                }
              }}
            >
              {paymentLoading ? 'Processing…' : 'Checkout'}
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <StorefrontCustomerLayout
      config={storefrontConfig}
      details={storefrontDetails}
      businessNameFallback={business?.name || 'Menu'}
      logoUrl={business?.logoUrl}
      phone={business?.phone}
      headerRight={
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <div className="text-right min-w-[52px]">
            <p className="text-xs" style={{ color: theme.sub }}>Cart</p>
            <p className="text-sm font-bold" style={{ color: theme.text }}>{cart.length} items</p>
          </div>
          <div
            className="rounded-xl px-3 sm:px-4 py-2 border"
            style={{
              backgroundColor: `${storefrontConfig.brandColor}14`,
              borderColor: `${storefrontConfig.brandColor}44`
            }}
          >
            <p className="font-bold text-sm" style={{ color: storefrontConfig.brandColor }}>
              ₦{getTotal().toFixed(2)}
            </p>
          </div>
        </div>
      }
    >
      <div className="grid w-full min-w-0 lg:grid-cols-3 gap-6 sm:gap-8">
        <div className="min-w-0 lg:col-span-2">
          {!isTicketing &&
          (ag.translationsEnabled !== false ||
            ag.dietaryPromptEnabled !== false ||
            ag.personalisedRecs !== false ||
            ag.localPaymentHints) ? (
            <div
              className="mb-6 rounded-2xl border p-4 sm:p-5"
              style={{ background: theme.panel, borderColor: theme.border }}
            >
              <p className="text-xs font-semibold mb-3" style={{ color: theme.sub }}>
                Personalise this menu
              </p>
              <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                {ag.translationsEnabled !== false ? (
                  <div className="flex-1 min-w-[10rem]">
                    <label className="block text-[11px] font-medium mb-1.5" style={{ color: theme.sub }}>
                      Language
                    </label>
                    <CustomDropdown
                      size="sm"
                      options={[
                        { value: 'en', label: 'English' },
                        { value: 'ha', label: 'Hausa' },
                        { value: 'yo', label: 'Yorùbá' },
                        { value: 'ig', label: 'Igbo' }
                      ]}
                      value={menuLang}
                      onChange={(v) => setMenuLang(v as GuestMenuLang)}
                      placeholder="Language"
                      triggerStyle={{ background: theme.page, color: theme.text, borderColor: theme.border }}
                    />
                  </div>
                ) : null}
                {ag.dietaryPromptEnabled !== false ? (
                  <div className="flex-1">
                    <p className="text-[11px] font-medium mb-1.5" style={{ color: theme.sub }}>
                      Taste preferences (this device)
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ['vegetarian', 'Vegetarian-forward'],
                          ['meatLover', 'Meat lover'],
                          ['noDairy', 'No dairy']
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleGuestDietary(key)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                            guestDietary[key] ? 'border-zuri-orange bg-zuri-orange/15 text-zuri-orange' : 'border-gray-200 text-gray-600'
                          }`}
                          style={{ background: guestDietary[key] ? undefined : theme.page }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                {ag.personalisedRecs !== false ? (
                  <div className="flex-1 min-w-full sm:min-w-[14rem]">
                    <label className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={crossVenueOptIn}
                        onChange={(e) => {
                          const next = e.target.checked
                          setCrossVenueOptInState(next)
                          setCrossVenueOptIn(next)
                        }}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-zuri-orange focus:ring-zuri-orange"
                      />
                      <span className="text-[11px] leading-relaxed" style={{ color: theme.sub }}>
                        Use my order history across Zuri venues to suggest dishes I might like (you can turn this off anytime).
                      </span>
                    </label>
                  </div>
                ) : null}
              </div>
              {ag.localPaymentHints ? (
                <p className="text-[11px] mt-3 leading-relaxed" style={{ color: theme.sub }}>
                  Pay securely by card here. Your host may also offer MoMo or bank transfer for the bill — ask before you checkout.
                </p>
              ) : null}
            </div>
          ) : null}
          <StorefrontMenuGrid
            config={storefrontConfig}
            categories={menu.map((category) => ({
              id: category.id,
              name: category.name,
              items: category.items.map((item) => ({
                id: item.id,
                name: item.name,
                description: item.description,
                price: item.price,
                estimatedPrepTime: item.estimatedPrepTime,
                imageUrl: item.imageUrl,
                available: item.available
              }))
            }))}
            onItemClick={addToCart}
            showQuickPicks={!isTicketing}
            trendingItemIds={guestInsights.trendingItemIds}
            upsellSeedIds={guestInsights.upsellSeedIds}
            forYouItemIds={guestInsights.forYouItemIds}
            reorderItemIds={guestInsights.reorderItemIds}
            itemSignals={guestInsights.itemSignals}
            personalisationActive={!!guestInsights.personalisationActive}
            activeMenuLang={menuLang}
            menuTranslations={storefrontDetails.menuTranslations}
            guestDietaryPrefs={guestDietary}
            scaleGuestMenuTags={!!business?.scaleGuestMenuTags}
            reorderHintItemIds={reorderHintIds}
          />
        </div>

        <div className="min-w-0 lg:col-span-1">
          <div
            className="rounded-2xl border p-4 sm:p-6 lg:sticky lg:top-24"
            style={{ background: theme.panel, borderColor: theme.border }}
          >
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-lg font-bold" style={{ color: theme.text }}>Order summary</h2>
              <a
                href={`/reserve/${businessId}`}
                className="border border-zuri-orange text-zuri-orange px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-zuri-orange hover:text-white transition whitespace-nowrap"
                style={{ background: theme.panel }}
              >
                Book a table
              </a>
            </div>

            {cart.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: theme.sub }}>Your cart is empty</p>
            ) : (
              <>
                <div className="space-y-3 mb-6 max-h-80 overflow-y-auto" style={{ borderColor: theme.border }}>
                  {cart.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between py-3 border-b"
                      style={{ borderColor: theme.border }}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate" style={{ color: theme.text }}>{item.name}</p>
                        <p className="text-xs" style={{ color: theme.sub }}>₦{Number(item.price).toFixed(2)} each</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity - 1)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium"
                          style={{ background: theme.page, color: theme.text }}
                        >
                          −
                        </button>
                        <span className="font-semibold text-sm w-6 text-center" style={{ color: theme.text }}>{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium"
                          style={{ background: theme.page, color: theme.text }}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id)}
                          className="ml-1 text-red-500 hover:text-red-700 text-sm"
                          aria-label="Remove"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="pt-4 mb-6 border-t" style={{ borderColor: theme.border }}>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm" style={{ color: theme.sub }}>Subtotal</span>
                    <span className="font-semibold" style={{ color: theme.text }}>₦{getTotal().toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold" style={{ color: theme.text }}>Total</span>
                    <span className="text-lg font-bold" style={{ color: storefrontConfig.priceTextColor || storefrontConfig.brandColor }}>
                      ₦{getTotal().toFixed(2)}
                    </span>
                  </div>
                </div>

                <form onSubmit={handlePlaceOrder} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Your name *"
                    value={customerInfo.name}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                    style={{ borderColor: theme.border, background: theme.panel, color: theme.text }}
                  />
                  <input
                    type="tel"
                    placeholder="Phone *"
                    value={customerInfo.phone}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                    required
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                    style={{ borderColor: theme.border, background: theme.panel, color: theme.text }}
                  />
                  <input
                    type="email"
                    placeholder="Email *"
                    required
                    value={customerInfo.email}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                    className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                    style={{ borderColor: theme.border, background: theme.panel, color: theme.text }}
                  />
                  <button
                    type="submit"
                    className="w-full text-white py-1.5 rounded-lg text-sm hover:opacity-95 transition"
                    style={{ background: storefrontConfig.brandColor }}
                  >
                    Place order
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </StorefrontCustomerLayout>
  )
}

export default OrderPage

