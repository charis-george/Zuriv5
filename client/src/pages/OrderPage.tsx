import { useState, useEffect, FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import io, { Socket } from 'socket.io-client'
import { Business, MenuCategory, MenuItem, Order, CustomerInfo, OrderItem, SavedCard } from '../types'

interface CartItem extends MenuItem {
  quantity: number
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

  useEffect(() => {
    if (!businessId) return

    // #region agent log
    fetch('http://127.0.0.1:7885/ingest/27cc0656-b460-497f-bc8e-e093f6629dd3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0133e9'},body:JSON.stringify({sessionId:'0133e9',location:'OrderPage.tsx:useEffect',message:'Fetching business and menu',data:{businessId},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
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
        // #region agent log
        fetch('http://127.0.0.1:7885/ingest/27cc0656-b460-497f-bc8e-e093f6629dd3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0133e9'},body:JSON.stringify({sessionId:'0133e9',location:'OrderPage.tsx:menuLoaded',message:'Menu loaded',data:{businessId,menuLength:res.data?.length},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        setMenu(res.data)
        setLoading(false)
      })
      .catch(() => {
        // #region agent log
        fetch('http://127.0.0.1:7885/ingest/27cc0656-b460-497f-bc8e-e093f6629dd3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0133e9'},body:JSON.stringify({sessionId:'0133e9',location:'OrderPage.tsx:menuError',message:'Menu fetch failed',data:{businessId},timestamp:Date.now(),hypothesisId:'H3'})}).catch(()=>{});
        // #endregion
        setError('Failed to load menu')
        setLoading(false)
      })

    // Connect to socket for order updates
    const socket: Socket = io('http://localhost:3000')
    
    socket.on('order-ready', (order: Order) => {
      if (orderDetails && order.id === orderDetails.id) {
        alert('Your order is ready!')
      }
    })

    return () => {
      socket.disconnect()
    }
  }, [businessId, orderDetails])

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

      // #region agent log
      fetch('http://127.0.0.1:7885/ingest/27cc0656-b460-497f-bc8e-e093f6629dd3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0133e9'},body:JSON.stringify({sessionId:'0133e9',location:'OrderPage.tsx:beforePlaceOrder',message:'Placing order',data:{businessId,itemCount:orderItems.length},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
      // #endregion
      const response = await axios.post<Order>('/api/order', {
        businessId,
        customerName: customerInfo.name,
        customerPhone: customerInfo.phone,
        customerEmail: customerInfo.email,
        items: orderItems,
        estimatedPrepTime: 15
      })

      // #region agent log
      fetch('http://127.0.0.1:7885/ingest/27cc0656-b460-497f-bc8e-e093f6629dd3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0133e9'},body:JSON.stringify({sessionId:'0133e9',location:'OrderPage.tsx:orderSuccess',message:'Order placed',data:{orderId:response.data?.id},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      setOrderDetails(response.data)
      setOrderPlaced(true)
      setCart([])
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7885/ingest/27cc0656-b460-497f-bc8e-e093f6629dd3',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'0133e9'},body:JSON.stringify({sessionId:'0133e9',location:'OrderPage.tsx:orderError',message:'Order failed',data:{errMsg:axios.isAxiosError(err)?err.response?.data?.error||err.message:String(err)},timestamp:Date.now(),hypothesisId:'H2'})}).catch(()=>{});
      // #endregion
      alert('Failed to place order. Please try again.')
      console.error(err)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-zuri-orange border-t-transparent mx-auto mb-4" />
          <p className="text-zuri-black text-sm">Loading menu...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#f5f5f5] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-md w-full text-center">
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
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8">
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
              className="w-full bg-zuri-orange text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-zuri-orange-dark transition disabled:opacity-70 mb-4"
            >
              {paymentLoading ? 'Processing…' : `Pay ₦${Number(orderTotal).toFixed(2)}`}
            </button>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-white text-zuri-black border border-gray-200 py-2.5 rounded-xl font-semibold text-sm hover:bg-gray-50 transition"
            >
              Place another order
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {business?.logoUrl && (
                <img src={business.logoUrl} alt="" className="h-12 w-12 rounded-xl object-cover border border-gray-100" />
              )}
              <div>
                <h1 className="text-xl font-bold text-zuri-black">{business?.name || 'Menu'}</h1>
                {business?.phone && (
                  <p className="text-sm text-gray-500">{business.phone}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-xs text-gray-500">Cart</p>
                <p className="text-sm font-bold text-zuri-black">{cart.length} items</p>
              </div>
              <div className="bg-zuri-orange/10 rounded-xl px-4 py-2 border border-zuri-orange/20">
                <p className="font-bold text-zuri-orange text-sm">₦{getTotal().toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Menu */}
          <div className="lg:col-span-2">
            {menu.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 text-center">
                <p className="text-gray-500 text-sm">No menu items available</p>
              </div>
            ) : (
              menu.map(category => (
                <div key={category.id} className="mb-8">
                  <h2 className="text-lg font-bold text-zuri-black mb-4">{category.name}</h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {category.items.map(item => (
                      <div
                        key={item.id}
                        className={`bg-white rounded-xl border border-gray-100 shadow-sm p-5 ${
                          !item.available ? 'opacity-50' : 'hover:shadow-md hover:border-zuri-orange/20 transition cursor-pointer'
                        }`}
                        onClick={() => addToCart(item)}
                      >
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-40 object-cover rounded-lg mb-3"
                          />
                        )}
                        <div className="flex justify-between items-start mb-1">
                          <h3 className="font-bold text-zuri-black">{item.name}</h3>
                          <span className="font-bold text-zuri-orange text-sm">₦{Number(item.price).toFixed(2)}</span>
                        </div>
                        {item.description && (
                          <p className="text-gray-500 text-xs mb-2 line-clamp-2">{item.description}</p>
                        )}
                        {!item.available && (
                          <span className="text-red-600 text-xs font-semibold">Out of stock</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Order summary card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sticky top-24">
              <h2 className="text-lg font-bold text-zuri-black mb-4">Order summary</h2>

              {cart.length === 0 ? (
                <p className="text-gray-500 text-sm text-center py-8">Your cart is empty</p>
              ) : (
                <>
                  <div className="space-y-3 mb-6 max-h-80 overflow-y-auto">
                    {cart.map(item => (
                      <div key={item.id} className="flex items-center justify-between py-3 border-b border-gray-100">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-zuri-black text-sm truncate">{item.name}</p>
                          <p className="text-xs text-gray-500">₦{Number(item.price).toFixed(2)} each</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 text-zuri-black text-sm font-medium"
                          >
                            −
                          </button>
                          <span className="font-semibold text-sm w-6 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center hover:bg-gray-200 text-zuri-black text-sm font-medium"
                          >
                            +
                          </button>
                          <button
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

                  <div className="border-t border-gray-100 pt-4 mb-6">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-sm text-gray-500">Subtotal</span>
                      <span className="font-semibold text-zuri-black">₦{getTotal().toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-bold text-zuri-black">Total</span>
                      <span className="text-lg font-bold text-zuri-orange">₦{getTotal().toFixed(2)}</span>
                    </div>
                  </div>

                  <form onSubmit={handlePlaceOrder} className="space-y-3">
                    <input
                      type="text"
                      placeholder="Your name *"
                      value={customerInfo.name}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                    />
                    <input
                      type="tel"
                      placeholder="Phone *"
                      value={customerInfo.phone}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                    />
                    <input
                      type="email"
                      placeholder="Email *"
                      required
                      value={customerInfo.email}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                    />
                    <button
                      type="submit"
                      className="w-full bg-zuri-orange text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-zuri-orange-dark transition"
                    >
                      Place order
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default OrderPage

