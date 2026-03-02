import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'
import io, { Socket } from 'socket.io-client'
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { Business, Order, SalesSummary, SalesByDate, PopularItem, PeakHour, ProfitMargin, QRCodeData, MenuCategory, MenuItem, PLAN_PRICES, PLAN_PRICES_YEARLY, PLAN_LABELS, YEARLY_DISCOUNT_PCT, type BillingInterval } from '../types'

type TabType = 'orders' | 'analytics' | 'menu' | 'qr' | 'payment' | 'ai'
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
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([])
  const [bankForm, setBankForm] = useState({ bankCode: '', bankName: '', accountNumber: '', accountName: '' })
  const [bankResolving, setBankResolving] = useState(false)
  const [bankResolveError, setBankResolveError] = useState<string | null>(null)
  const [bankSaving, setBankSaving] = useState(false)
  const [showBankForm, setShowBankForm] = useState(true)
  const [upgradeLoading, setUpgradeLoading] = useState<string | null>(null)
  const [upgradeBillingInterval, setUpgradeBillingInterval] = useState<BillingInterval>('monthly')
  const [aiInsightLoading, setAiInsightLoading] = useState(false)
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [aiCustomQuery, setAiCustomQuery] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [showLogoModal, setShowLogoModal] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null)
  const [logoUrlInput, setLogoUrlInput] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!businessId) return

    // Fetch business info (then conditionally fetch analytics based on plan)
    axios.get<Business>(`/api/business/${businessId}`)
      .then(res => {
        setBusiness(res.data)
        if (res.data.plan && res.data.plan !== 'free' && res.data.plan !== 'starter') fetchAnalytics()
        else setLoading(false)
        if (res.data.plan === 'free' || res.data.plan === 'starter') setActiveTab(t => (t === 'analytics' ? 'orders' : t))
      })
      .catch(err => { console.error(err); setLoading(false) })

    // Fetch QR code (pass current origin so QR works when scanned with any phone camera)
    const baseUrl = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''
    axios.get<QRCodeData>(`/api/qr/generate/${businessId}${baseUrl ? `?baseUrl=${baseUrl}` : ''}`)
      .then(res => setQrCode(res.data))
      .catch(err => console.error(err))

    // Fetch orders
    fetchOrders()

    // Fetch menu
    fetchMenu()

    // Fetch banks list for payment tab
    axios.get<{ code: string; name: string }[]>('/api/banks')
      .then(res => setBanks(Array.isArray(res.data) ? res.data : []))
      .catch(() => {})

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

  useEffect(() => {
    if (business?.bankAccount?.accountName) setShowBankForm(false)
  }, [business?.bankAccount?.accountName])

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
                            setImageUploadError(null)
                            if (imageInputRef.current) imageInputRef.current.value = ''
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
                            setImageUploadError(null)
                            if (imageInputRef.current) imageInputRef.current.value = ''
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

  const downloadQrCode = (): void => {
    if (!qrCode?.qrCodeDataUrl) return
    fetch(qrCode.qrCodeDataUrl)
      .then(res => res.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'zuri-qr-code.png'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      })
      .catch(() => alert('Download failed. Try again.'))
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

  if (!businessId || businessId === 'undefined') {
    return (
      <div className="min-h-screen bg-zuri-light flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-zuri-black mb-2">Invalid dashboard</h1>
          <p className="text-gray-500 text-sm mb-6">Please log in again.</p>
          <a href="/business/login" className="inline-block bg-zuri-orange text-white px-5 py-2.5 rounded-xl font-semibold text-sm hover:bg-zuri-orange-dark transition">
            Log in
          </a>
        </div>
      </div>
    )
  }

  const orderCreatedAt = (o: Order & { created_at?: string }) => (o as { created_at?: string }).created_at ?? (o as Order).createdAt
  const orderCustomerName = (o: Order & { customer_name?: string }) => (o as { customer_name?: string }).customer_name ?? (o as Order).customerName
  const orderCustomerPhone = (o: Order & { customer_phone?: string }) => (o as { customer_phone?: string }).customer_phone ?? (o as Order).customerPhone
  const orderTotalAmount = (o: Order & { total_amount?: number }) => (o as { total_amount?: number }).total_amount ?? (o as Order).totalAmount

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {business?.logoUrl && (
                <img src={business.logoUrl} alt="" className="h-12 w-12 rounded-xl object-cover border border-gray-100" />
              )}
              <div>
                <h1 className="text-xl font-bold text-zuri-black">{business?.name || 'Dashboard'}</h1>
                <p className="text-sm text-gray-500">{business?.email}</p>
              </div>
              {business?.plan && business.plan !== 'free' && (
                <button
                  type="button"
                  onClick={() => {
                    setShowLogoModal(true)
                    setLogoUrlInput(business?.logoUrl || '')
                    setLogoUploadError(null)
                  }}
                  className="text-sm font-medium text-zuri-orange hover:text-zuri-orange-dark transition"
                >
                  {business?.logoUrl ? 'Change logo' : 'Add logo'}
                </button>
              )}
              {business?.plan === 'free' && (
                <span className="text-xs text-gray-500">Upgrade to Starter to add a logo</span>
              )}
            </div>
            <a href="/" className="text-sm font-medium text-gray-600 hover:text-zuri-orange transition">
              Home
            </a>
          </div>
        </div>
      </header>

      {/* Logo modal (Starter+) */}
      {showLogoModal && businessId && business?.plan && business.plan !== 'free' && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-zuri-black">Business logo</h3>
              <button
                type="button"
                onClick={() => { setShowLogoModal(false); setLogoUploadError(null) }}
                className="text-gray-400 hover:text-zuri-black transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Shows on your storefront. Max 2MB.</p>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file || !businessId) return
                    setLogoUploadError(null)
                    setLogoUploading(true)
                    try {
                      const formData = new FormData()
                      formData.append('logo', file)
                      const { data } = await axios.post<{ logoUrl: string }>(`/api/business/${businessId}/upload-logo`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
                      setBusiness(prev => prev ? { ...prev, logoUrl: data.logoUrl } : null)
                      setLogoUrlInput(data.logoUrl)
                      if (logoInputRef.current) logoInputRef.current.value = ''
                      setShowLogoModal(false)
                    } catch (err: unknown) {
                      setLogoUploadError(axios.isAxiosError(err) ? (err.response?.data?.error ?? err.message) : 'Upload failed')
                    } finally {
                      setLogoUploading(false)
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  disabled={logoUploading}
                  className="px-4 py-2 border-2 border-gray-200 rounded-lg text-sm font-semibold text-zuri-black hover:bg-gray-50 disabled:opacity-60"
                >
                  {logoUploading ? 'Uploading…' : 'Upload photo'}
                </button>
              </div>
              <div>
                <label className="block text-sm font-semibold text-zuri-black mb-1">Or paste image URL</label>
                <input
                  type="url"
                  value={logoUrlInput}
                  onChange={(e) => setLogoUrlInput(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                />
                <button
                  type="button"
                  onClick={async () => {
                    if (!logoUrlInput.trim()) return
                    setLogoUploadError(null)
                    try {
                      await axios.patch(`/api/business/${businessId}`, { logo_url: logoUrlInput.trim() })
                      setBusiness(prev => prev ? { ...prev, logoUrl: logoUrlInput.trim() } : null)
                      setShowLogoModal(false)
                    } catch (err: unknown) {
                      setLogoUploadError(axios.isAxiosError(err) ? (err.response?.data?.error ?? err.message) : 'Failed to save')
                    }
                  }}
                  className="mt-2 w-full py-2 bg-zuri-black text-white rounded-lg text-sm font-semibold hover:bg-gray-800"
                >
                  Save URL
                </button>
              </div>
              {logoUrlInput && (
                <div className="pt-2">
                  <p className="text-xs text-gray-500 mb-1">Preview</p>
                  <img src={logoUrlInput} alt="" className="h-20 w-20 rounded-lg border object-cover" onError={() => setLogoUploadError('Image failed to load')} />
                </div>
              )}
              {logoUploadError && <p className="text-sm text-red-600">{logoUploadError}</p>}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            <button
              onClick={() => setActiveTab('orders')}
              className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition ${
                activeTab === 'orders'
                  ? 'text-zuri-orange border-b-2 border-zuri-orange bg-orange-50/30'
                  : 'text-gray-600 hover:text-zuri-black'
              }`}
            >
              Orders
            </button>
            {business?.plan && business.plan !== 'free' && business.plan !== 'starter' && (
              <button
                onClick={() => setActiveTab('analytics')}
                className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition ${
                  activeTab === 'analytics'
                    ? 'text-zuri-orange border-b-2 border-zuri-orange bg-orange-50/30'
                    : 'text-gray-600 hover:text-zuri-black'
                }`}
              >
                Analytics
              </button>
            )}
            <button
              onClick={() => setActiveTab('menu')}
              className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition ${
                activeTab === 'menu'
                  ? 'text-zuri-orange border-b-2 border-zuri-orange bg-orange-50/30'
                  : 'text-gray-600 hover:text-zuri-black'
              }`}
            >
              Menu
            </button>
            <button
              onClick={() => setActiveTab('qr')}
              className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition ${
                activeTab === 'qr'
                  ? 'text-zuri-orange border-b-2 border-zuri-orange bg-orange-50/30'
                  : 'text-gray-600 hover:text-zuri-black'
              }`}
            >
              QR Code
            </button>
            <button
              onClick={() => setActiveTab('payment')}
              className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition ${
                activeTab === 'payment'
                  ? 'text-zuri-orange border-b-2 border-zuri-orange bg-orange-50/30'
                  : 'text-gray-600 hover:text-zuri-black'
              }`}
            >
              Payment
            </button>
            {(business?.plan === 'zuri_plus' || business?.plan === 'enterprise') && (
              <button
                onClick={() => setActiveTab('ai')}
                className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition ${
                  activeTab === 'ai'
                    ? 'text-zuri-orange border-b-2 border-zuri-orange bg-orange-50/30'
                    : 'text-gray-600 hover:text-zuri-black'
                }`}
              >
                AI
              </button>
            )}
          </div>

          <div className="p-6">
            {/* Orders Tab */}
            {activeTab === 'orders' && (
              <div>
                <h2 className="text-lg font-bold text-zuri-black mb-6">Recent orders</h2>
                {orders.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-12">No orders yet</p>
                ) : (
                  <div className="space-y-4">
                    {orders.map(order => (
                      <div key={order.id} className="bg-gray-50/50 rounded-xl p-5 border border-gray-100">
                        <div className="flex justify-between items-start gap-4 mb-4">
                          <div>
                            <p className="font-bold text-zuri-black text-sm">#{order.id.slice(0, 8).toUpperCase()}</p>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {orderCustomerName(order) || 'Guest'} · {orderCustomerPhone(order) || '—'}
                            </p>
                            <p className="text-xs text-gray-500">
                              {new Date(orderCreatedAt(order) || 0).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold ${getStatusColor(order.status)}`}>
                              {order.status}
                            </span>
                            <p className="text-lg font-bold text-zuri-orange mt-2">
                              ₦{(orderTotalAmount(order) ?? 0).toFixed(2)}
                            </p>
                          </div>
                        </div>

                        <div className="mb-4">
                          <p className="text-xs font-semibold text-gray-500 mb-2">Items</p>
                          <div className="space-y-1">
                            {(order.items ?? []).map((item, idx) => (
                              <p key={idx} className="text-sm text-gray-700">
                                {item.quantity}× {item.menuItemName || 'Item'} — ₦{item.price.toFixed(2)}
                              </p>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {order.status === 'pending' && (
                            <>
                              <button
                                onClick={() => updateOrderStatus(order.id, 'preparing')}
                                className="px-3 py-1.5 bg-zuri-orange text-white rounded-xl text-xs font-semibold hover:bg-zuri-orange-dark transition"
                              >
                                Start preparing
                              </button>
                              <button
                                onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 transition"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {order.status === 'preparing' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'ready')}
                              className="px-3 py-1.5 bg-green-600 text-white rounded-xl text-xs font-semibold hover:bg-green-700 transition"
                            >
                              Mark ready
                            </button>
                          )}
                          {order.status === 'ready' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'completed')}
                              className="px-3 py-1.5 bg-zuri-black text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition"
                            >
                              Mark completed
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
            {activeTab === 'analytics' && business?.plan && business.plan !== 'free' && business.plan !== 'starter' && (
              <div className="space-y-8">
                {/* Summary Cards */}
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="bg-zuri-orange/10 rounded-xl p-5 border border-orange-100">
                    <p className="text-xs text-gray-600 mb-1">Total orders</p>
                    <p className="text-2xl font-bold text-zuri-black">{analytics?.totalOrders || 0}</p>
                  </div>
                  <div className="bg-zuri-black rounded-xl p-5 text-white">
                    <p className="text-xs text-gray-300 mb-1">Total revenue</p>
                    <p className="text-2xl font-bold">₦{(analytics?.totalRevenue || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-white rounded-xl p-5 border border-gray-200">
                    <p className="text-xs text-gray-500 mb-1">Avg order value</p>
                    <p className="text-2xl font-bold text-zuri-black">₦{(analytics?.averageOrderValue || 0).toFixed(2)}</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-5 border border-green-100">
                    <p className="text-xs text-green-700 mb-1">Completed revenue</p>
                    <p className="text-2xl font-bold text-green-800">₦{(analytics?.completedRevenue || 0).toFixed(2)}</p>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 border border-gray-100">
                  <h3 className="text-lg font-bold text-zuri-black mb-4">Sales over time</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={Array.isArray(salesData) ? salesData : []}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#f97316" strokeWidth={2} name="Revenue" />
                      <Line type="monotone" dataKey="completedRevenue" stroke="#000000" strokeWidth={2} name="Completed" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Popular Items */}
                  <div className="bg-white rounded-xl p-6 border border-gray-100">
                    <h3 className="text-lg font-bold text-zuri-black mb-4">Most popular items</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={Array.isArray(popularItems) ? popularItems.slice(0, 5) : []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="totalQuantity" fill="#f97316" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-white rounded-xl p-6 border border-gray-100">
                    <h3 className="text-lg font-bold text-zuri-black mb-4">Peak hours</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={Array.isArray(peakHours) ? peakHours : []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="hour" />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="orderCount" fill="#000000" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="bg-white rounded-xl p-6 border border-gray-100">
                  <h3 className="text-lg font-bold text-zuri-black mb-4">Profit margins</h3>
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
                <h2 className="text-lg font-bold text-zuri-black mb-6">Menu</h2>
                <div className="flex justify-between items-center mb-6">
                  <span />
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setShowCategoryForm(true)
                        setCategoryForm({ name: '', displayOrder: 0 })
                      }}
                      className="bg-white border border-gray-200 text-zuri-black px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-50 transition"
                    >
                      + Category
                    </button>
                    <button
                      onClick={() => {
                        setShowItemForm(true)
                        setEditingItem(null)
                        setItemForm({ name: '', description: '', price: '', cost: '', categoryId: '', imageUrl: '', available: true })
                            setImageUploadError(null)
                            if (imageInputRef.current) imageInputRef.current.value = ''
                      }}
                      className="bg-zuri-orange text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition"
                    >
                      + Item
                    </button>
                  </div>
                </div>

                {menu.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50/50 rounded-xl border border-gray-100">
                    <p className="text-gray-500 text-sm mb-4">No menu items yet</p>
                    <button
                      onClick={() => setShowItemForm(true)}
                      className="bg-zuri-orange text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition"
                    >
                      Add first item
                    </button>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {menu.map(category => (
                      <div key={category.id} className="bg-gray-50/50 rounded-xl p-5 border border-gray-100">
                        <h3 className="text-lg font-bold text-zuri-black mb-4">{category.name}</h3>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {category.items.map(item => (
                            <div key={item.id} className="bg-white rounded-xl p-4 border border-gray-100">
                              {item.imageUrl && (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="w-full h-32 object-cover rounded-lg mb-3"
                                />
                              )}
                              <div className="flex justify-between items-center mb-2">
                                <h4 className="font-bold text-zuri-black text-sm">{item.name}</h4>
                                <span className={`px-2 py-0.5 rounded-lg text-xs font-semibold ${
                                  item.available ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                                }`}>
                                  {item.available ? 'Available' : 'Unavailable'}
                                </span>
                              </div>
                              {item.description && (
                                <p className="text-xs text-gray-500 mb-2 line-clamp-2">{item.description}</p>
                              )}
                              <div className="flex justify-between items-center mb-3">
                                <p className="font-bold text-zuri-orange text-sm">₦{item.price.toFixed(2)}</p>
                                {item.cost > 0 && (
                                  <p className="text-xs text-gray-400">Cost ₦{item.cost.toFixed(2)}</p>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    axios.put(`/api/menu/item/${item.id}`, { available: !item.available })
                                      .then(() => fetchMenu())
                                      .catch(err => {
                                        alert('Failed to update availability')
                                        console.error(err)
                                      })
                                  }}
                                  className={`flex-1 px-2 py-1.5 rounded-xl text-xs font-semibold transition ${
                                    item.available
                                      ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                                      : 'bg-green-100 text-green-800 hover:bg-green-200'
                                  }`}
                                >
                                  {item.available ? 'Unavailable' : 'Available'}
                                </button>
                                <button
                                  onClick={() => handleEditItem(item)}
                                  className="flex-1 px-2 py-1.5 bg-gray-100 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-200 transition"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteItem(item.id)}
                                  className="px-2 py-1.5 bg-red-50 text-red-600 rounded-xl text-xs font-semibold hover:bg-red-100 transition"
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
                            setImageUploadError(null)
                            if (imageInputRef.current) imageInputRef.current.value = ''
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
                        {business?.plan && business.plan !== 'free' ? (
                          <div>
                            <label className="block text-sm font-semibold text-zuri-black mb-2">Item image</label>
                            <div className="space-y-2">
                              <div className="flex items-center gap-3">
                                <input
                                  ref={imageInputRef}
                                  type="file"
                                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                                  className="hidden"
                                  onChange={async (e) => {
                                    const file = e.target.files?.[0]
                                    if (!file || !businessId) return
                                    setImageUploadError(null)
                                    setImageUploading(true)
                                    try {
                                      const formData = new FormData()
                                      formData.append('image', file)
                                      formData.append('businessId', businessId)
                                      const { data } = await axios.post<{ imageUrl: string }>('/api/menu/upload-image', formData, {
                                        headers: { 'Content-Type': 'multipart/form-data' }
                                      })
                                      setItemForm(prev => ({ ...prev, imageUrl: data.imageUrl }))
                                      if (imageInputRef.current) imageInputRef.current.value = ''
                                    } catch (err: unknown) {
                                      const msg = axios.isAxiosError(err) ? (err.response?.data?.error ?? err.message) : 'Upload failed'
                                      setImageUploadError(String(msg))
                                    } finally {
                                      setImageUploading(false)
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => imageInputRef.current?.click()}
                                  disabled={imageUploading}
                                  className="px-4 py-2 border-2 border-gray-200 rounded-lg text-sm font-semibold text-zuri-black hover:bg-gray-50 disabled:opacity-60"
                                >
                                  {imageUploading ? 'Uploading…' : 'Upload photo'}
                                </button>
                                <span className="text-xs text-gray-500">JPEG, PNG, GIF or WebP (max 5MB)</span>
                              </div>
                              {imageUploadError && (
                                <p className="text-sm text-red-600">{imageUploadError}</p>
                              )}
                              <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-500">Or paste URL:</span>
                                <input
                                  type="url"
                                  value={itemForm.imageUrl}
                                  onChange={(e) => {
                                    setItemForm({ ...itemForm, imageUrl: e.target.value })
                                    setImageUploadError(null)
                                  }}
                                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                                  placeholder="https://example.com/image.jpg"
                                />
                              </div>
                              {itemForm.imageUrl && (
                                <div className="mt-2">
                                  <img
                                    src={itemForm.imageUrl}
                                    alt="Preview"
                                    className="h-24 w-auto rounded-lg border border-gray-200 object-cover"
                                    onError={() => setImageUploadError('Image failed to load')}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-lg bg-zuri-light border border-gray-200 p-3">
                            <p className="text-sm text-gray-600">
                              Upgrade to <strong>Starter</strong> (₦7,500/mo) to add pictures to menu items.
                            </p>
                            <a href="/#pricing" target="_blank" rel="noopener noreferrer" className="text-sm text-zuri-yellow font-semibold hover:underline mt-1 inline-block">
                              View plans →
                            </a>
                          </div>
                        )}
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
                              setImageUploadError(null)
                              if (imageInputRef.current) imageInputRef.current.value = ''
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

            {activeTab === 'qr' && (
              <div className="text-center">
                <h2 className="text-lg font-bold text-zuri-black mb-6">Your QR code</h2>
                {qrCode ? (
                  <div>
                    <div className="bg-white p-6 rounded-xl inline-block mb-6 border border-gray-100">
                      <img src={qrCode.qrCodeDataUrl} alt="QR Code" className="w-56 h-56" />
                    </div>
                    <p className="text-gray-500 text-sm mb-4">Print and place on your tables</p>
                    <p className="text-xs text-gray-400 mb-6">Scan with any phone camera — no app needed</p>
                    <button
                      type="button"
                      onClick={downloadQrCode}
                      className="inline-block bg-zuri-orange text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition"
                    >
                      Download
                    </button>
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Loading QR code...</p>
                )}
              </div>
            )}

            {/* Payment Tab */}
            {activeTab === 'payment' && (
              <div className="max-w-2xl">
                <h2 className="text-lg font-bold text-zuri-black mb-6">Get paid</h2>
                <p className="text-gray-500 text-sm mb-6">
                  Add your Nigerian bank account to receive payouts. We verify the account name so payments go to the right place.
                </p>
                {business?.bankAccount?.accountName ? (
                  <div className="mb-8 p-5 rounded-xl bg-orange-50/50 border border-orange-100">
                    <p className="font-semibold text-zuri-black text-sm">Payout account</p>
                    <p className="text-gray-600 text-sm mt-1">{business.bankAccount.bankName} — {business.bankAccount.accountNumberMasked}</p>
                    <p className="text-gray-600 text-sm">{business.bankAccount.accountName}</p>
                    <button
                      type="button"
                      onClick={() => { setShowBankForm(true); setBankForm({ bankCode: '', bankName: '', accountNumber: '', accountName: '' }); setBankResolveError(null) }}
                      className="mt-3 text-sm font-semibold text-zuri-orange hover:underline"
                    >
                      Change bank details
                    </button>
                  </div>
                ) : null}
                {showBankForm ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault()
                    if (!businessId || !bankForm.bankCode || !bankForm.bankName || !bankForm.accountNumber.trim() || !bankForm.accountName.trim()) {
                      alert('Select bank, enter account number, and verify to show account name before saving.')
                      return
                    }
                    setBankSaving(true)
                    try {
                      await axios.patch(`/api/business/${businessId}`, {
                        bank_code: bankForm.bankCode,
                        bank_name: bankForm.bankName,
                        account_number: bankForm.accountNumber.trim(),
                        account_name: bankForm.accountName.trim()
                      })
                      const { data } = await axios.get<Business>(`/api/business/${businessId}`)
                      setBusiness(data)
                      setBankForm({ bankCode: '', bankName: '', accountNumber: '', accountName: '' })
                      setShowBankForm(false)
                      alert('Bank details saved.')
                    } catch (err) {
                      alert('Failed to save. Try again.')
                    } finally {
                      setBankSaving(false)
                    }
                  }}
                  className="space-y-4 mb-8"
                >
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Bank</label>
                    <select
                      value={bankForm.bankCode}
                      onChange={(e) => {
                        const option = e.target.selectedOptions?.[0]
                        setBankForm(f => ({ ...f, bankCode: e.target.value, bankName: option?.text ?? '' }))
                      }}
                      required
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                    >
                      <option value="">Select bank</option>
                      {banks.map((b) => (
                        <option key={b.code} value={b.code}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Account number</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={bankForm.accountNumber}
                      onChange={(e) => setBankForm(f => ({ ...f, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 16) }))}
                      placeholder="8–16 digits (e.g. 10 for Nigerian NUBAN)"
                      maxLength={16}
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                    />
                  </div>
                  <div>
                    <button
                      type="button"
                      disabled={!bankForm.bankCode || !bankForm.accountNumber.trim() || bankForm.accountNumber.trim().length < 8 || bankForm.accountNumber.trim().length > 16 || bankResolving}
                      onClick={async () => {
                        setBankResolveError(null)
                        setBankResolving(true)
                        try {
                          const { data } = await axios.get<{ account_name: string }>('/api/banks/resolve', {
                            params: { bank_code: bankForm.bankCode, account_number: bankForm.accountNumber.trim() }
                          })
                          setBankForm(f => ({ ...f, accountName: data.account_name || '' }))
                        } catch (err: unknown) {
                          const ax = err as { response?: { data?: { error?: string } } }
                          const msg = ax.response?.data?.error || 'Could not verify account. Check bank and account number.'
                          setBankResolveError(msg)
                          alert(msg)
                        } finally {
                          setBankResolving(false)
                        }
                      }}
                      className="bg-zuri-black text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-50"
                    >
                      {bankResolving ? 'Verifying…' : 'Verify account'}
                    </button>
                  </div>
                  {bankResolveError ? (
                    <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                      <p className="text-sm text-amber-800">{bankResolveError}</p>
                      {(bankResolveError.includes('test') || bankResolveError.includes('limit') || bankResolveError.includes('001')) && (
                        <p className="text-xs text-amber-700 mt-1">Tip: In test mode, use <strong>Zenith Bank</strong> (code 057) with test account number <strong>0000000000</strong> to avoid the 3-per-day live resolve limit. Or switch to live keys for real accounts.</p>
                      )}
                    </div>
                  ) : null}
                  {bankForm.accountName ? (
                    <div className="p-3 rounded-xl bg-green-50 border border-green-100">
                      <p className="text-sm font-semibold text-green-800">Account name: {bankForm.accountName}</p>
                    </div>
                  ) : null}
                  <button
                    type="submit"
                    disabled={bankSaving || !bankForm.accountName}
                    className="bg-zuri-orange text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition disabled:opacity-50"
                  >
                    {bankSaving ? 'Saving…' : 'Save bank details'}
                  </button>
                </form>
                ) : null}
                <hr className="border-gray-100 my-8" />
                <h3 className="text-lg font-bold text-zuri-black mb-4">Upgrade plan</h3>
                <p className="text-gray-500 text-sm mb-4">You’ll be redirected to Paystack to pay securely.</p>
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-sm font-semibold text-zuri-black">Billing:</span>
                  <button
                    type="button"
                    onClick={() => setUpgradeBillingInterval('monthly')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${upgradeBillingInterval === 'monthly' ? 'bg-zuri-orange text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpgradeBillingInterval('yearly')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${upgradeBillingInterval === 'yearly' ? 'bg-zuri-orange text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    Yearly (Save {YEARLY_DISCOUNT_PCT}%)
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(['starter', 'growth', 'pro', 'zuri_plus'] as const).map((plan) => (
                    <button
                      key={plan}
                      disabled={business?.plan === plan || upgradeLoading !== null}
                      onClick={async () => {
                        if (!businessId || !business?.email) return
                        setUpgradeLoading(plan)
                        try {
                          const { data } = await axios.post<{ authorizationUrl: string }>('/api/subscription/initialize', {
                            businessId,
                            plan,
                            email: business.email,
                            callbackUrl: `${window.location.origin}/upgrade-done`,
                            interval: upgradeBillingInterval
                          })
                          if (data?.authorizationUrl) window.location.href = data.authorizationUrl
                          else alert('Failed to start payment')
                        } catch {
                          alert('Failed to start payment')
                        } finally {
                          setUpgradeLoading(null)
                        }
                      }}
                      className="bg-zuri-orange text-zuri-black px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark hover:text-white transition disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {upgradeLoading === plan ? 'Redirecting…' : `Upgrade to ${PLAN_LABELS[plan]} — ${upgradeBillingInterval === 'monthly' ? PLAN_PRICES[plan] + '/mo' : PLAN_PRICES_YEARLY[plan] + '/yr'}`}
                    </button>
                  ))}
                </div>
                <p className="text-gray-500 text-xs mt-4">A 2.5% transaction fee applies on every customer purchase.</p>
              </div>
            )}

            {/* AI Insights Tab (Zuri Plus / Enterprise) */}
            {activeTab === 'ai' && (business?.plan === 'zuri_plus' || business?.plan === 'enterprise') && (
              <div className="max-w-3xl space-y-6">
                <h2 className="text-2xl font-bold text-zuri-black">AI Insights</h2>
                <p className="text-gray-600">
                  Get actionable advice from Claude based on your menu and sales data. Choose a quick insight or ask your own question.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { type: 'sales_summary', label: 'Sales summary', desc: 'Last 7 & 30 days' },
                    { type: 'menu_optimization', label: 'Menu optimization', desc: 'Ordering & pricing tips' },
                    { type: 'opportunities', label: 'Opportunities', desc: 'Ways to grow sales' },
                    { type: 'demand_tips', label: 'Demand & prep tips', desc: 'Peak times & forecasting' }
                  ].map(({ type, label, desc }) => (
                    <button
                      key={type}
                      disabled={aiInsightLoading}
                      onClick={async () => {
                        if (!businessId) return
                        setAiInsight(null)
                        setAiInsightLoading(true)
                        try {
                          const { data } = await axios.post<{ insight: string }>('/api/ai/insights', { businessId, type })
                          setAiInsight(data.insight || 'No response.')
                        } catch (err: unknown) {
                          const ax = err as { response?: { data?: { error?: string }; status?: number } }
                          const msg = ax.response?.data?.error || 'Request failed.'
                          if (ax.response?.status === 403) setAiInsight(null)
                          else setAiInsight(`Error: ${msg}`)
                        } finally {
                          setAiInsightLoading(false)
                        }
                      }}
                      className="text-left p-4 rounded-xl border-2 border-zuri-yellow bg-white hover:bg-zuri-light transition disabled:opacity-70"
                    >
                      <span className="font-semibold text-zuri-black block">{label}</span>
                      <span className="text-sm text-gray-600">{desc}</span>
                    </button>
                  ))}
                </div>
                <div className="pt-4 border-t border-gray-200">
                  <label className="block text-sm font-semibold text-zuri-black mb-2">Ask a question about your business</label>
                  <textarea
                    value={aiCustomQuery}
                    onChange={(e) => setAiCustomQuery(e.target.value)}
                    placeholder="e.g. Which items should I promote this week?"
                    rows={2}
                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow mb-2"
                  />
                  <button
                    disabled={aiInsightLoading || !aiCustomQuery.trim()}
                    onClick={async () => {
                      if (!businessId || !aiCustomQuery.trim()) return
                      setAiInsight(null)
                      setAiInsightLoading(true)
                      try {
                        const { data } = await axios.post<{ insight: string }>('/api/ai/insights', {
                          businessId,
                          type: 'custom',
                          query: aiCustomQuery.trim()
                        })
                        setAiInsight(data.insight || 'No response.')
                      } catch (err: unknown) {
                        const ax = err as { response?: { data?: { error?: string } } }
                        setAiInsight(`Error: ${ax.response?.data?.error || 'Request failed.'}`)
                      } finally {
                        setAiInsightLoading(false)
                      }
                    }}
                    className="bg-zuri-black text-white px-6 py-2 rounded-lg font-semibold hover:bg-gray-800 transition disabled:opacity-50"
                  >
                    {aiInsightLoading ? 'Thinking…' : 'Ask'}
                  </button>
                </div>
                {aiInsight !== null && (
                  <div className="rounded-xl border-2 border-zuri-yellow bg-zuri-light p-6">
                    <h3 className="font-bold text-zuri-black mb-2">Insight</h3>
                    <div className="whitespace-pre-wrap text-gray-800">{aiInsight}</div>
                  </div>
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

