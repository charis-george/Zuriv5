import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import io, { Socket } from 'socket.io-client'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { Business, Order, SalesSummary, SalesByDate, PopularItem, PeakHour, ProfitMargin, QRCodeData, MenuCategory, MenuItem } from '../types'

type TabType = 'orders' | 'analytics' | 'menu' | 'qr'
type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'

interface Category {
  id: string
  name: string
  displayOrder: number
}

function BusinessDashboard(): JSX.Element {
  const { businessId } = useParams<{ businessId: string }>()
  const [business, setBusiness] = useState<Business | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [analytics, setAnalytics] = useState<SalesSummary | null>(null)
  const [salesData, setSalesData] = useState<SalesByDate[]>([])
  const [popularItems, setPopularItems] = useState<PopularItem[]>([])
  const [peakHours, setPeakHours] = useState<PeakHour[]>([])
  const [profitMargins, setProfitMargins] = useState<ProfitMargin[]>([])
  const [qrCode, setQrCode] = useState<QRCodeData | null>(null)
  const [menu, setMenu] = useState<MenuCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeTab, setActiveTab] = useState<TabType>('orders')
  const [loading, setLoading] = useState<boolean>(true)
  const [showItemForm, setShowItemForm] = useState<boolean>(false)
  const [showCategoryForm, setShowCategoryForm] = useState<boolean>(false)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [itemForm, setItemForm] = useState({
    name: '',
    description: '',
    price: '',
    cost: '',
    categoryId: '',
    imageUrl: '',
    available: true
  })
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    displayOrder: 0
  })

  useEffect(() => {
    if (!businessId) return

    // Fetch business info
    axios.get<Business>(`/api/business/${businessId}`)
      .then(res => setBusiness(res.data))
      .catch(err => console.error(err))

    // Fetch QR code
    axios.get<QRCodeData>(`/api/qr/generate/${businessId}`)
      .then(res => setQrCode(res.data))
      .catch(err => console.error(err))

    // Fetch orders
    fetchOrders()

    // Fetch analytics
    fetchAnalytics()

    // Fetch menu
    fetchMenu()

    // Connect to socket for real-time updates
    const socket: Socket = io('http://localhost:3000')
    socket.emit('join-business', businessId)

    socket.on('new-order', () => {
      fetchOrders()
      fetchAnalytics()
    })

    socket.on('order-updated', () => {
      fetchOrders()
      fetchAnalytics()
    })

    return () => {
      socket.disconnect()
    }
  }, [businessId])

  const fetchOrders = (): void => {
    if (!businessId) return
    axios.get<Order[]>(`/api/order/business/${businessId}`)
      .then(res => setOrders(res.data))
      .catch(err => console.error(err))
  }

  const fetchAnalytics = async (): Promise<void> => {
    if (!businessId) return
    try {
      const [sales, salesByDate, popular, hours, margins] = await Promise.all([
        axios.get<SalesSummary>(`/api/analytics/sales/${businessId}?period=month`),
        axios.get<SalesByDate[]>(`/api/analytics/sales-by-date/${businessId}?days=30`),
        axios.get<PopularItem[]>(`/api/analytics/popular-items/${businessId}?limit=10`),
        axios.get<PeakHour[]>(`/api/analytics/peak-hours/${businessId}?days=30`),
        axios.get<ProfitMargin[]>(`/api/analytics/profit-margins/${businessId}?days=30`)
      ])

      setAnalytics(sales.data)
      setSalesData(salesByDate.data)
      setPopularItems(popular.data)
      setPeakHours(hours.data)
      setProfitMargins(margins.data)
      setLoading(false)
    } catch (err) {
      console.error('Failed to fetch analytics:', err)
      setLoading(false)
    }
  }

  const fetchMenu = (): void => {
    if (!businessId) return
    Promise.all([
      axios.get<MenuCategory[]>(`/api/menu/business/${businessId}`),
      axios.get<Category[]>(`/api/menu/categories/${businessId}`)
    ])
      .then(([menuRes, categoriesRes]) => {
        setMenu(menuRes.data)
        setCategories(categoriesRes.data)
      })
      .catch(err => console.error('Failed to fetch menu:', err))
  }

  const handleCreateItem = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!businessId) return

    const itemData = {
      businessId,
      categoryId: itemForm.categoryId || null,
      name: itemForm.name,
      description: itemForm.description,
      price: parseFloat(itemForm.price),
      cost: parseFloat(itemForm.cost) || 0,
      imageUrl: itemForm.imageUrl || null,
      available: itemForm.available
    }

    if (editingItem) {
      // Update existing item
      axios.put(`/api/menu/item/${editingItem.id}`, {
        ...itemData,
        categoryId: itemForm.categoryId || null
      })
        .then(() => {
          fetchMenu()
          setShowItemForm(false)
          setEditingItem(null)
          setItemForm({ name: '', description: '', price: '', cost: '', categoryId: '', imageUrl: '', available: true })
        })
        .catch(err => {
          alert('Failed to update menu item')
          console.error(err)
        })
    } else {
      // Create new item
      axios.post('/api/menu/item', itemData)
        .then(() => {
          fetchMenu()
          setShowItemForm(false)
          setItemForm({ name: '', description: '', price: '', cost: '', categoryId: '', imageUrl: '', available: true })
        })
        .catch(err => {
          alert('Failed to create menu item')
          console.error(err)
        })
    }
  }

  const handleDeleteItem = (itemId: string): void => {
    if (!confirm('Are you sure you want to delete this menu item?')) return

    axios.delete(`/api/menu/item/${itemId}`)
      .then(() => {
        fetchMenu()
      })
      .catch(err => {
        alert('Failed to delete menu item')
        console.error(err)
      })
  }

  const handleEditItem = (item: MenuItem): void => {
    setEditingItem(item)
    // Find which category this item belongs to
    let categoryId = ''
    for (const category of menu) {
      if (category.items.some(i => i.id === item.id)) {
        categoryId = category.id
        break
      }
    }
    setItemForm({
      name: item.name,
      description: item.description || '',
      price: item.price.toString(),
      cost: (item.cost || 0).toString(),
      categoryId: categoryId,
      imageUrl: item.imageUrl || '',
      available: item.available
    })
    setShowItemForm(true)
  }

  const handleCreateCategory = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!businessId) return

    axios.post('/api/menu/category', {
      businessId,
      name: categoryForm.name,
      displayOrder: categoryForm.displayOrder
    })
      .then(() => {
        fetchMenu()
        setShowCategoryForm(false)
        setCategoryForm({ name: '', displayOrder: 0 })
      })
      .catch(err => {
        alert('Failed to create category')
        console.error(err)
      })
  }

  const updateOrderStatus = (orderId: string, status: OrderStatus): void => {
    axios.patch(`/api/order/${orderId}/status`, { status })
      .then(() => {
        fetchOrders()
        fetchAnalytics()
      })
      .catch(err => {
        alert('Failed to update order status')
        console.error(err)
      })
  }

  const getStatusColor = (status: OrderStatus): string => {
    const colors: Record<OrderStatus, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      preparing: 'bg-blue-100 text-blue-800',
      ready: 'bg-green-100 text-green-800',
      completed: 'bg-gray-100 text-gray-800',
      cancelled: 'bg-red-100 text-red-800'
    }
    return colors[status] || colors.pending
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zuri-light flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zuri-yellow mx-auto mb-4"></div>
          <p className="text-zuri-black">Loading dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zuri-light">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-zuri-black">{business?.name || 'Dashboard'}</h1>
              <p className="text-sm text-gray-600">{business?.email}</p>
            </div>
            <div className="flex items-center space-x-4">
              <a href="/" className="text-zuri-black hover:text-zuri-yellow transition">
                Home
              </a>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Tabs */}
        <div className="bg-white rounded-2xl shadow-xl mb-8">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex-1 px-6 py-4 font-semibold transition ${
                activeTab === 'orders'
                  ? 'text-zuri-black border-b-2 border-zuri-yellow'
                  : 'text-gray-600 hover:text-zuri-black'
              }`}
            >
              Orders
            </button>
            <button
              onClick={() => setActiveTab('analytics')}
              className={`flex-1 px-6 py-4 font-semibold transition ${
                activeTab === 'analytics'
                  ? 'text-zuri-black border-b-2 border-zuri-yellow'
                  : 'text-gray-600 hover:text-zuri-black'
              }`}
            >
              Analytics
            </button>
            <button
              onClick={() => setActiveTab('menu')}
              className={`flex-1 px-6 py-4 font-semibold transition ${
                activeTab === 'menu'
                  ? 'text-zuri-black border-b-2 border-zuri-yellow'
                  : 'text-gray-600 hover:text-zuri-black'
              }`}
            >
              Menu
            </button>
            <button
              onClick={() => setActiveTab('qr')}
              className={`flex-1 px-6 py-4 font-semibold transition ${
                activeTab === 'qr'
                  ? 'text-zuri-black border-b-2 border-zuri-yellow'
                  : 'text-gray-600 hover:text-zuri-black'
              }`}
            >
              QR Code
            </button>
          </div>

          <div className="p-6">
            {/* Orders Tab */}
            {activeTab === 'orders' && (
              <div>
                <h2 className="text-2xl font-bold text-zuri-black mb-6">Recent Orders</h2>
                {orders.length === 0 ? (
                  <p className="text-gray-600 text-center py-8">No orders yet</p>
                ) : (
                  <div className="space-y-4">
                    {orders.map(order => (
                      <div key={order.id} className="bg-zuri-light rounded-lg p-6 border-2 border-gray-200">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <p className="font-bold text-zuri-black">Order #{order.id.slice(0, 8).toUpperCase()}</p>
                            <p className="text-sm text-gray-600">
                              {order.customerName || 'Guest'} • {order.customerPhone || 'No phone'}
                            </p>
                            <p className="text-sm text-gray-600">
                              {new Date(order.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="text-right">
                            <span className={`px-3 py-1 rounded-full text-sm font-semibold ${getStatusColor(order.status)}`}>
                              {order.status}
                            </span>
                            <p className="text-xl font-bold text-zuri-yellow mt-2">
                              ₦{order.totalAmount.toFixed(2)}
                            </p>
                          </div>
                        </div>

                        <div className="mb-4">
                          <p className="text-sm font-semibold text-zuri-black mb-2">Items:</p>
                          <div className="space-y-1">
                            {order.items && order.items.map((item, idx) => (
                              <p key={idx} className="text-sm text-gray-700">
                                {item.quantity}x {item.menuItemName || 'Item'} - ₦{item.price.toFixed(2)}
                              </p>
                            ))}
                          </div>
                        </div>

                        <div className="flex space-x-2">
                          {order.status === 'pending' && (
                            <>
                              <button
                                onClick={() => updateOrderStatus(order.id, 'preparing')}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                              >
                                Start Preparing
                              </button>
                              <button
                                onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {order.status === 'preparing' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'ready')}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
                            >
                              Mark Ready
                            </button>
                          )}
                          {order.status === 'ready' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'completed')}
                              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition"
                            >
                              Mark Completed
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Analytics Tab */}
            {activeTab === 'analytics' && (
              <div className="space-y-8">
                {/* Summary Cards */}
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="bg-zuri-yellow rounded-lg p-6">
                    <p className="text-sm text-zuri-black mb-1">Total Orders</p>
                    <p className="text-3xl font-bold text-zuri-black">{analytics?.totalOrders || 0}</p>
                  </div>
                  <div className="bg-zuri-black rounded-lg p-6 text-white">
                    <p className="text-sm mb-1">Total Revenue</p>
                    <p className="text-3xl font-bold">₦{(analytics?.totalRevenue || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-white border-2 border-zuri-yellow rounded-lg p-6">
                    <p className="text-sm text-gray-600 mb-1">Avg Order Value</p>
                    <p className="text-3xl font-bold text-zuri-black">₦{(analytics?.averageOrderValue || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-green-100 rounded-lg p-6">
                    <p className="text-sm text-green-800 mb-1">Completed Revenue</p>
                    <p className="text-3xl font-bold text-green-800">₦{(analytics?.completedRevenue || 0).toFixed(2)}</p>
                  </div>
                </div>

                {/* Sales Chart */}
                <div className="bg-white border-2 border-zuri-yellow rounded-lg p-6">
                  <h3 className="text-xl font-bold text-zuri-black mb-4">Sales Over Time</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={salesData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#ffcd1c" strokeWidth={2} name="Revenue" />
                      <Line type="monotone" dataKey="completedRevenue" stroke="#000000" strokeWidth={2} name="Completed" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Popular Items */}
                  <div className="bg-white border-2 border-zuri-yellow rounded-lg p-6">
                    <h3 className="text-xl font-bold text-zuri-black mb-4">Most Popular Items</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={popularItems.slice(0, 5)}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="totalQuantity" fill="#ffcd1c" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Peak Hours */}
                  <div className="bg-white border-2 border-zuri-yellow rounded-lg p-6">
                    <h3 className="text-xl font-bold text-zuri-black mb-4">Peak Hours</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={peakHours}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="orderCount" fill="#000000" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Profit Margins */}
                <div className="bg-white border-2 border-zuri-yellow rounded-lg p-6">
                  <h3 className="text-xl font-bold text-zuri-black mb-4">Profit Margins</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2">Item</th>
                          <th className="text-right py-2">Revenue</th>
                          <th className="text-right py-2">Cost</th>
                          <th className="text-right py-2">Profit</th>
                          <th className="text-right py-2">Margin %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profitMargins.slice(0, 10).map((item, idx) => (
                          <tr key={idx} className="border-b">
                            <td className="py-2">{item.name}</td>
                            <td className="text-right py-2">₦{item.totalRevenue.toFixed(2)}</td>
                            <td className="text-right py-2">₦{item.totalCost.toFixed(2)}</td>
                            <td className="text-right py-2 font-semibold">₦{item.profit.toFixed(2)}</td>
                            <td className="text-right py-2">{item.marginPercentage.toFixed(1)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Menu Management Tab */}
            {activeTab === 'menu' && (
              <div>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold text-zuri-black">Menu Management</h2>
                  <div className="flex space-x-3">
                    <button
                      onClick={() => {
                        setShowCategoryForm(true)
                        setCategoryForm({ name: '', displayOrder: 0 })
                      }}
                      className="bg-zuri-yellow text-zuri-black px-4 py-2 rounded-lg font-semibold hover:bg-yellow-400 transition"
                    >
                      + Add Category
                    </button>
                    <button
                      onClick={() => {
                        setShowItemForm(true)
                        setEditingItem(null)
                        setItemForm({ name: '', description: '', price: '', cost: '', categoryId: '', imageUrl: '', available: true })
                      }}
                      className="bg-zuri-black text-white px-4 py-2 rounded-lg font-semibold hover:bg-gray-800 transition"
                    >
                      + Add Item
                    </button>
                  </div>
                </div>

                {menu.length === 0 ? (
                  <div className="text-center py-12 bg-zuri-light rounded-lg">
                    <p className="text-gray-600 mb-4">No menu items yet</p>
                    <button
                      onClick={() => setShowItemForm(true)}
                      className="bg-zuri-black text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition"
                    >
                      Add Your First Menu Item
                    </button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {menu.map(category => (
                      <div key={category.id} className="bg-zuri-light rounded-lg p-6">
                        <h3 className="text-xl font-bold text-zuri-black mb-4">{category.name}</h3>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {category.items.map(item => (
                            <div key={item.id} className="bg-white rounded-lg p-4 border-2 border-gray-200">
                              {item.imageUrl && (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="w-full h-32 object-cover rounded-lg mb-3"
                                />
                              )}
                              <div className="flex justify-between items-start mb-2">
                                <h4 className="font-bold text-zuri-black">{item.name}</h4>
                                <span className={`px-2 py-1 rounded text-xs font-semibold ${
                                  item.available ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                                }`}>
                                  {item.available ? 'Available' : 'Unavailable'}
                                </span>
                              </div>
                              {item.description && (
                                <p className="text-sm text-gray-600 mb-2">{item.description}</p>
                              )}
                              <div className="flex justify-between items-center mb-3">
                                <div>
                                  <p className="text-lg font-bold text-zuri-yellow">₦{item.price.toFixed(2)}</p>
                                  {item.cost > 0 && (
                                    <p className="text-xs text-gray-500">Cost: ₦{item.cost.toFixed(2)}</p>
                                  )}
                                </div>
                              </div>
                              <div className="flex space-x-2">
                                <button
                                  onClick={() => {
                                    axios.put(`/api/menu/item/${item.id}`, { available: !item.available })
                                      .then(() => fetchMenu())
                                      .catch(err => {
                                        alert('Failed to update availability')
                                        console.error(err)
                                      })
                                  }}
                                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                                    item.available
                                      ? 'bg-yellow-600 text-white hover:bg-yellow-700'
                                      : 'bg-green-600 text-white hover:bg-green-700'
                                  }`}
                                >
                                  {item.available ? 'Mark Unavailable' : 'Mark Available'}
                                </button>
                                <button
                                  onClick={() => handleEditItem(item)}
                                  className="flex-1 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add/Edit Item Modal */}
                {showItemForm && (
                  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-2xl font-bold text-zuri-black">
                          {editingItem ? 'Edit Menu Item' : 'Add Menu Item'}
                        </h3>
                        <button
                          onClick={() => {
                            setShowItemForm(false)
                            setEditingItem(null)
                            setItemForm({ name: '', description: '', price: '', cost: '', categoryId: '', imageUrl: '', available: true })
                          }}
                          className="text-gray-400 hover:text-zuri-black transition"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <form onSubmit={handleCreateItem} className="space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-zuri-black mb-2">Item Name *</label>
                          <input
                            type="text"
                            value={itemForm.name}
                            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                            required
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                            placeholder="e.g., Grilled Chicken"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-zuri-black mb-2">Description</label>
                          <textarea
                            value={itemForm.description}
                            onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                            rows={3}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                            placeholder="Describe your menu item..."
                          />
                        </div>
                        <div className="grid md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-sm font-semibold text-zuri-black mb-2">Price (₦) *</label>
                            <input
                              type="number"
                              step="0.01"
                              value={itemForm.price}
                              onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                              required
                              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                              placeholder="0.00"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-semibold text-zuri-black mb-2">Cost (₦)</label>
                            <input
                              type="number"
                              step="0.01"
                              value={itemForm.cost}
                              onChange={(e) => setItemForm({ ...itemForm, cost: e.target.value })}
                              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                              placeholder="0.00"
                            />
                            <p className="text-xs text-gray-500 mt-1">For profit margin calculations</p>
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-zuri-black mb-2">Category</label>
                          <select
                            value={itemForm.categoryId}
                            onChange={(e) => setItemForm({ ...itemForm, categoryId: e.target.value })}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                          >
                            <option value="">Uncategorized</option>
                            {categories.map(cat => (
                              <option key={cat.id} value={cat.id}>{cat.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-zuri-black mb-2">Image URL</label>
                          <input
                            type="url"
                            value={itemForm.imageUrl}
                            onChange={(e) => setItemForm({ ...itemForm, imageUrl: e.target.value })}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                            placeholder="https://example.com/image.jpg"
                          />
                        </div>
                        <div className="flex items-center">
                          <input
                            type="checkbox"
                            id="available"
                            checked={itemForm.available}
                            onChange={(e) => setItemForm({ ...itemForm, available: e.target.checked })}
                            className="w-5 h-5 text-zuri-yellow rounded focus:ring-zuri-yellow"
                          />
                          <label htmlFor="available" className="ml-2 text-sm font-semibold text-zuri-black">
                            Available for ordering
                          </label>
                        </div>
                        <div className="flex space-x-4 pt-4">
                          <button
                            type="button"
                            onClick={() => {
                              setShowItemForm(false)
                              setEditingItem(null)
                              setItemForm({ name: '', description: '', price: '', cost: '', categoryId: '', imageUrl: '', available: true })
                            }}
                            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="flex-1 px-4 py-3 bg-zuri-black text-white rounded-lg font-semibold hover:bg-gray-800 transition"
                          >
                            {editingItem ? 'Update Item' : 'Add Item'}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {/* Add Category Modal */}
                {showCategoryForm && (
                  <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-8 max-w-md w-full">
                      <div className="flex justify-between items-center mb-6">
                        <h3 className="text-2xl font-bold text-zuri-black">Add Category</h3>
                        <button
                          onClick={() => {
                            setShowCategoryForm(false)
                            setCategoryForm({ name: '', displayOrder: 0 })
                          }}
                          className="text-gray-400 hover:text-zuri-black transition"
                        >
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                      <form onSubmit={handleCreateCategory} className="space-y-4">
                        <div>
                          <label className="block text-sm font-semibold text-zuri-black mb-2">Category Name *</label>
                          <input
                            type="text"
                            value={categoryForm.name}
                            onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                            required
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                            placeholder="e.g., Appetizers, Main Courses"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-zuri-black mb-2">Display Order</label>
                          <input
                            type="number"
                            value={categoryForm.displayOrder}
                            onChange={(e) => setCategoryForm({ ...categoryForm, displayOrder: parseInt(e.target.value) || 0 })}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                            placeholder="0"
                          />
                          <p className="text-xs text-gray-500 mt-1">Lower numbers appear first</p>
                        </div>
                        <div className="flex space-x-4 pt-4">
                          <button
                            type="button"
                            onClick={() => {
                              setShowCategoryForm(false)
                              setCategoryForm({ name: '', displayOrder: 0 })
                            }}
                            className="flex-1 px-4 py-3 border-2 border-gray-300 rounded-lg font-semibold hover:bg-gray-50 transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="flex-1 px-4 py-3 bg-zuri-black text-white rounded-lg font-semibold hover:bg-gray-800 transition"
                          >
                            Add Category
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* QR Code Tab */}
            {activeTab === 'qr' && (
              <div className="text-center">
                <h2 className="text-2xl font-bold text-zuri-black mb-6">Your QR Code</h2>
                {qrCode ? (
                  <div>
                    <div className="bg-white p-8 rounded-lg inline-block mb-6">
                      <img src={qrCode.qrCodeDataUrl} alt="QR Code" className="w-64 h-64" />
                    </div>
                    <p className="text-gray-600 mb-4">Print this QR code and place it on your tables</p>
                    <p className="text-sm text-gray-500 mb-6">URL: {qrCode.qrUrl}</p>
                    <a
                      href={qrCode.qrCodeDataUrl}
                      download="zuri-qr-code.png"
                      className="inline-block bg-zuri-black text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-800 transition"
                    >
                      Download QR Code
                    </a>
                  </div>
                ) : (
                  <p className="text-gray-600">Loading QR code...</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default BusinessDashboard

