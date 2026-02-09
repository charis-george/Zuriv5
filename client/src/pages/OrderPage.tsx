import { useState, useEffect, FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import io, { Socket } from 'socket.io-client'
import { Business, MenuCategory, MenuItem, Order, CustomerInfo, OrderItem } from '../types'

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
      <div className="min-h-screen bg-zuri-light flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zuri-yellow mx-auto mb-4"></div>
          <p className="text-zuri-black">Loading menu...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-zuri-light flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-zuri-black mb-4">Error</h1>
          <p className="text-gray-700 mb-6">{error}</p>
          <a href="/" className="text-zuri-yellow hover:underline">Go back home</a>
        </div>
      </div>
    )
  }

  if (orderPlaced && orderDetails) {
    return (
      <div className="min-h-screen bg-zuri-light py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-zuri-black mb-4">Order Placed!</h1>
            <p className="text-gray-700 mb-6">
              Your order #{orderDetails.id.slice(0, 8).toUpperCase()} has been received.
            </p>
            <div className="bg-zuri-light rounded-lg p-6 mb-6 text-left">
              <p className="font-semibold text-zuri-black mb-2">Estimated Preparation Time:</p>
              <p className="text-2xl font-bold text-zuri-yellow">{orderDetails.estimatedPrepTime} minutes</p>
            </div>
            <p className="text-gray-600 mb-6">
              You'll receive a notification when your order is ready.
            </p>
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <p className="text-sm text-gray-600 mb-2">Order Total:</p>
              <p className="text-2xl font-bold text-zuri-black">₦{orderDetails.totalAmount.toFixed(2)}</p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="bg-zuri-black text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition"
            >
              Place Another Order
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zuri-light">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zuri-black">{business?.name || 'Menu'}</h1>
              {business?.phone && (
                <p className="text-sm text-gray-600">{business.phone}</p>
              )}
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-right">
                <p className="text-sm text-gray-600">Cart</p>
                <p className="text-lg font-bold text-zuri-black">{cart.length} items</p>
              </div>
              <div className="bg-zuri-yellow rounded-lg px-4 py-2">
                <p className="font-bold text-zuri-black">₦{getTotal().toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Menu */}
          <div className="lg:col-span-2">
            {menu.length === 0 ? (
              <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
                <p className="text-gray-600">No menu items available</p>
              </div>
            ) : (
              menu.map(category => (
                <div key={category.id} className="mb-8">
                  <h2 className="text-2xl font-bold text-zuri-black mb-4">{category.name}</h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {category.items.map(item => (
                      <div
                        key={item.id}
                        className={`bg-white rounded-xl shadow-md p-6 ${
                          !item.available ? 'opacity-50' : 'hover:shadow-lg transition cursor-pointer'
                        }`}
                        onClick={() => addToCart(item)}
                      >
                        {item.imageUrl && (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-48 object-cover rounded-lg mb-4"
                          />
                        )}
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="text-xl font-bold text-zuri-black">{item.name}</h3>
                          <span className="text-lg font-bold text-zuri-yellow">₦{item.price.toFixed(2)}</span>
                        </div>
                        {item.description && (
                          <p className="text-gray-600 text-sm mb-2">{item.description}</p>
                        )}
                        {!item.available && (
                          <span className="text-red-600 text-sm font-semibold">Out of Stock</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-xl p-6 sticky top-24">
              <h2 className="text-2xl font-bold text-zuri-black mb-4">Your Order</h2>
              
              {cart.length === 0 ? (
                <p className="text-gray-600 text-center py-8">Your cart is empty</p>
              ) : (
                <>
                  <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                    {cart.map(item => (
                      <div key={item.id} className="flex items-center justify-between border-b pb-4">
                        <div className="flex-1">
                          <p className="font-semibold text-zuri-black">{item.name}</p>
                          <p className="text-sm text-gray-600">₦{item.price.toFixed(2)} each</p>
                        </div>
                        <div className="flex items-center space-x-3">
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity - 1)}
                            className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300"
                          >
                            -
                          </button>
                          <span className="font-semibold w-8 text-center">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.id, item.quantity + 1)}
                            className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center hover:bg-gray-300"
                          >
                            +
                          </button>
                          <button
                            onClick={() => removeFromCart(item.id)}
                            className="ml-2 text-red-600 hover:text-red-800"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="border-t pt-4 mb-6">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-xl font-bold text-zuri-black">Total</span>
                      <span className="text-2xl font-bold text-zuri-yellow">₦{getTotal().toFixed(2)}</span>
                    </div>
                  </div>

                  <form onSubmit={handlePlaceOrder} className="space-y-4">
                    <input
                      type="text"
                      placeholder="Your Name *"
                      value={customerInfo.name}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                    />
                    <input
                      type="tel"
                      placeholder="Phone Number *"
                      value={customerInfo.phone}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                      required
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                    />
                    <input
                      type="email"
                      placeholder="Email (optional)"
                      value={customerInfo.email}
                      onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                      className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                    />
                    <button
                      type="submit"
                      className="w-full bg-zuri-black text-white py-4 rounded-lg font-semibold text-lg hover:bg-gray-800 transition"
                    >
                      Place Order
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

