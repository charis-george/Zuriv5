import { useState, useEffect, FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import io, { Socket } from 'socket.io-client'
import { Business, MenuCategory, MenuItem, Order, CustomerInfo, OrderItem, SavedCard, StorefrontDetails } from '../types'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'
import { mergeStorefrontConfig, getStorefrontTheme } from '../lib/storefrontTheme'
import { StorefrontCustomerLayout } from '../components/storefront/StorefrontCustomerLayout'
import { StorefrontMenuGrid } from '../components/storefront/StorefrontMenuGrid'

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

function OrderPage(): JSX.Element {
  const { businessId } = useParams<{ businessId: string }>()
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
  const storefrontConfig = mergeStorefrontConfig(business?.storefrontConfig ?? undefined)
  const storefrontDetails: StorefrontDetails = {
    ...DEFAULT_STOREFRONT_DETAILS,
    ...(business?.storefrontDetails ?? {})
  }
  const theme = getStorefrontTheme(storefrontConfig)

  useEffect(() => {
    if (!businessId) return

    // Fetch business info
    axios.get<Business>(`/api/qr/business/${businessId}`)
      .then(res => {
        setBusiness(res.data)
      })
      .catch(() => {
        setError('Business not found')
        setLoading(false)
      })

    // Fetch menu
    axios.get<MenuCategory[]>(`/api/menu/business/${businessId}`)
      .then(res => {
        setMenu(res.data)
        setLoading(false)
      })
      .catch(() => {
        setError('Failed to load menu')
        setLoading(false)
      })

    const socket: Socket = io(WS_URL)
    socket.emit('join-storefront', businessId)

    socket.on('storefront-updated', (payload: { config?: unknown; details?: unknown }) => {
      setBusiness((prev) => {
        if (!prev) return prev
        return {
          ...prev,
          storefrontConfig: (payload.config as Business['storefrontConfig']) ?? prev.storefrontConfig,
          storefrontDetails: (payload.details as Business['storefrontDetails']) ?? prev.storefrontDetails
        }
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
  }, [businessId])

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

  const addToCart = (item: MenuItem): void => {
    if (!item.available) return
    
    const existingItem = cart.find(cartItem => cartItem.id === item.id)
    if (existingItem) {
      setCart(cart.map(cartItem =>
        cartItem.id === item.id
          ? { ...cartItem, quantity: cartItem.quantity + 1 }
          : cartItem
      ))
    } else {
      setCart([...cart, { ...item, quantity: 1 }])
    }
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

    try {
      const orderItems: OrderItem[] = cart.map(item => ({
        menuItemId: item.id,
        quantity: item.quantity,
        price: item.price
      }))

      const response = await axios.post<Order>('/api/order', {
        businessId,
        customerName: customerInfo.name,
        customerPhone: customerInfo.phone,
        customerEmail: customerInfo.email,
        items: orderItems,
        estimatedPrepTime: 15
      })

      setOrderDetails(response.data)
      setOrderPlaced(true)
      setCart([])
    } catch (err) {
      alert('Failed to place order. Please try again.')
      console.error(err)
    }
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

  if (orderPlaced && orderDetails) {
    const orderTotal = (orderDetails as Order & { total_amount?: number }).total_amount ?? orderDetails.totalAmount ?? 0
    const orderPrepTime = (orderDetails as Order & { estimated_prep_time?: number }).estimated_prep_time ?? orderDetails.estimatedPrepTime ?? 15
    const orderIdShort = (orderDetails.id ?? '').slice(0, 8).toUpperCase()
    const createdAt = orderDetails.createdAt ?? (orderDetails as Order & { created_at?: string }).created_at

    return (
      <div className="min-h-screen bg-[#f5f5f5] py-8 px-4">
        <div className="max-w-md mx-auto">
          <div className="bg-white rounded-xl border border-gray-200 p-8">
            <div className="w-14 h-14 rounded-xl bg-zuri-orange/15 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-zuri-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-zuri-black text-center mb-2">Your order has been submitted</h1>
            <p className="text-gray-500 text-sm text-center mb-8">We’ll notify you when it’s ready.</p>

            <div className="space-y-4 mb-8">
              {orderDetails.returningZuriCustomer && orderDetails.zuriCustomerStats && (
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
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Est. prep time</span>
                <span className="font-semibold text-zuri-black">{orderPrepTime} min</span>
              </div>
              <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
                <span className="text-gray-500">Total</span>
                <span className="font-bold text-zuri-orange">₦{Number(orderTotal).toFixed(2)}</span>
              </div>
            </div>

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
                    const { data } = await axios.post<{ authorizationUrl: string }>('/api/payment/initialize', {
                      email,
                      amount: orderTotal,
                      orderId: orderDetails.id,
                      businessId,
                      callbackUrl: `${window.location.origin}/payment-done?reference=${orderDetails.id}`,
                      saveCard
                    })
                    if (data?.authorizationUrl) window.location.href = data.authorizationUrl
                    else alert('Failed to start payment')
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
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-white text-zuri-black border border-gray-200 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition"
            >
              Place another order
            </button>
          </div>
        </div>
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
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
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
                imageUrl: item.imageUrl,
                available: item.available
              }))
            }))}
            onItemClick={addToCart}
          />
        </div>

        <div className="lg:col-span-1">
          <div
            className="rounded-2xl border p-6 lg:sticky lg:top-24"
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

