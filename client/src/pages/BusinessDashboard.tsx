import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import io, { Socket } from 'socket.io-client'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { Business, Order, Reservation, Review, SalesSummary, SalesByDate, PopularItem, PeakHour, ProfitMargin, QRCodeData, MenuCategory, MenuItem, PLAN_LABELS } from '../types'
import type { CustomerIntelligence } from '../types'
import type { MarketInsights } from '../types'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'
import { ConfirmModal } from '../components/ConfirmModal'

type TabType = 'orders' | 'analytics' | 'menu' | 'qr' | 'payment' | 'ai'
type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'

interface Category {
  id: string
  name: string
  displayOrder: number
}

const WS_URL =
  (import.meta.env.VITE_WS_URL as string) ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : (typeof window !== 'undefined' ? window.location.origin : ''))

function BusinessDashboard(): JSX.Element {
  const { businessId } = useParams<{ businessId: string }>()
  const navigate = useNavigate()

  const getAuthHeaders = () => {
    const t = localStorage.getItem('zuri_business_token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  }

  const [business, setBusiness] = useState<Business | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [reviews, setReviews] = useState<Review[]>([])
  const [analytics, setAnalytics] = useState<SalesSummary | null>(null)
  const [salesData, setSalesData] = useState<SalesByDate[]>([])
  const [popularItems, setPopularItems] = useState<PopularItem[]>([])
  const [peakHours, setPeakHours] = useState<PeakHour[]>([])
  const [profitMargins, setProfitMargins] = useState<ProfitMargin[]>([])
  const [customerIntelligence, setCustomerIntelligence] = useState<CustomerIntelligence | null>(null)
  const [marketInsights, setMarketInsights] = useState<MarketInsights | null>(null)
  const [marketInsightsLoading, setMarketInsightsLoading] = useState(false)
  const [qrCode, setQrCode] = useState<QRCodeData | null>(null)
  const [menu, setMenu] = useState<MenuCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeTab, setActiveTab] = useState<TabType>('orders')
  const [loading, setLoading] = useState<boolean>(true)
  const [showItemForm, setShowItemForm] = useState<boolean>(false)
  const [showCategoryForm, setShowCategoryForm] = useState<boolean>(false)
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null)
  const [pendingCategoryDelete, setPendingCategoryDelete] = useState<{ id: string; name: string } | null>(null)
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
  const [profileOpen, setProfileOpen] = useState(false)
  const [logoMenuOpen, setLogoMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [changePasswordCurrent, setChangePasswordCurrent] = useState('')
  const [changePasswordNew, setChangePasswordNew] = useState('')
  const [changePasswordConfirm, setChangePasswordConfirm] = useState('')
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null)
  const [changePasswordLoading, setChangePasswordLoading] = useState(false)
  const logoMenuRef = useRef<HTMLDivElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const notificationsMenuRef = useRef<HTMLDivElement>(null)

  const [zuriTapOn, setZuriTapOn] = useState(false)
  const [tapCode, setTapCode] = useState<string | null>(null)
  const [tapExpiresAt, setTapExpiresAt] = useState<string | null>(null)
  const [tapSending, setTapSending] = useState(false)
  const [tapWaitingOrderId, setTapWaitingOrderId] = useState<string | null>(null)
  const [tapSelections, setTapSelections] = useState<Record<string, number>>({})
  const [tapRoomLoading, setTapRoomLoading] = useState(false)
  const tapWaitingOrderIdRef = useRef<string | null>(null)
  useEffect(() => { tapWaitingOrderIdRef.current = tapWaitingOrderId }, [tapWaitingOrderId])

  useEffect(() => {
    if (!businessId) return
    const token = localStorage.getItem('zuri_business_token')
    if (!token) {
      navigate('/business/login', { replace: true })
      return
    }
    if (localStorage.getItem('zuri_onboarding_done_' + businessId) !== '1') {
      navigate(`/business/onboarding/${businessId}`, { replace: true })
      return
    }

    // Fetch business info
    axios.get<Business>(`/api/business/${businessId}`)
      .then(res => {
        setBusiness(res.data)
        if (res.data.plan && res.data.plan !== 'free' && res.data.plan !== 'starter') fetchAnalytics()
        else setLoading(false)
        if (res.data.plan === 'free' || res.data.plan === 'starter') setActiveTab(t => (t === 'analytics' ? 'orders' : t))
        const proOrAbove = res.data.plan === 'pro' || res.data.plan === 'zuri_plus' || res.data.plan === 'enterprise'
        if (!proOrAbove) setActiveTab(t => (t === 'ai' ? 'orders' : t))
      })
      .catch(err => { console.error(err); setLoading(false) })

    // Fetch QR code (pass current origin so QR works when scanned with any phone camera)
    const baseUrl = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''
    axios.get<QRCodeData>(`/api/qr/generate/${businessId}${baseUrl ? `?baseUrl=${baseUrl}` : ''}`)
      .then(res => setQrCode(res.data))
      .catch(err => console.error(err))

    axios.get<{ code: string | null; expiresAt?: string }>(`/api/tap/room?businessId=${businessId}`, { headers: getAuthHeaders() })
      .then(res => { if (res.data?.code) { setTapCode(res.data.code); setZuriTapOn(true); setTapExpiresAt(res.data.expiresAt || null) } })
      .catch(() => {})

    // Fetch orders
    fetchOrders()

    // Fetch reservations (table booking requests)
    fetchReservations()

    // Fetch reviews (post-payment ratings)
    fetchReviews()

    // Fetch menu
    fetchMenu()

    // Connect to socket for real-time updates
    const socket: Socket = io(WS_URL)
    const emitJoin = () => socket.emit('join-business', { businessId, token })
    socket.on('connect', emitJoin)
    emitJoin()

    socket.on('new-order', () => {
      fetchOrders()
      fetchAnalytics()
    })

    socket.on('order-updated', () => {
      fetchOrders()
      fetchAnalytics()
    })

    socket.on('tap-payment-success', (data: { orderId: string }) => {
      if (data.orderId === tapWaitingOrderIdRef.current) setTapWaitingOrderId(null)
      fetchOrders()
      fetchAnalytics()
    })

    socket.on('new-reservation', () => {
      fetchReservations()
    })

    socket.on('reservation-updated', () => {
      fetchReservations()
    })

    socket.on('new-review', (data: { review: Review }) => {
      if (!data?.review?.id) return
      setReviews(prev => {
        if (prev.some(r => r.id === data.review.id)) return prev
        return [data.review, ...prev]
      })
    })

    return () => {
      socket.disconnect()
    }
  }, [businessId])

  useEffect(() => {
    if (!logoMenuOpen) return
    const close = (e: MouseEvent) => {
      if (logoMenuRef.current && !logoMenuRef.current.contains(e.target as Node)) setLogoMenuOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [logoMenuOpen])

  useEffect(() => {
    if (!profileOpen) return
    const close = (e: MouseEvent) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [profileOpen])

  useEffect(() => {
    if (!notificationsOpen) return
    const close = (e: MouseEvent) => {
      if (notificationsMenuRef.current && !notificationsMenuRef.current.contains(e.target as Node)) setNotificationsOpen(false)
    }
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [notificationsOpen])

  useEffect(() => {
    if (!businessId) return
    const interval = setInterval(() => {
      fetchOrders()
      if (business?.plan && business.plan !== 'free' && business.plan !== 'starter') fetchAnalytics()
    }, 2 * 60 * 1000)
    return () => clearInterval(interval)
  }, [businessId, business?.plan])

  useEffect(() => {
    if (activeTab !== 'ai' || !businessId) return
    const proOrAbove = business?.plan === 'pro' || business?.plan === 'zuri_plus' || business?.plan === 'enterprise'
    if (!proOrAbove) return
    axios.get<CustomerIntelligence>(`/api/analytics/customer-intelligence/${businessId}?days=30`, { headers: getAuthHeaders() })
      .then(res => setCustomerIntelligence(res.data))
      .catch(() => setCustomerIntelligence(null))
  }, [activeTab, businessId, business?.plan])

  useEffect(() => {
    if (activeTab !== 'analytics' || !businessId) return
    const proOrAbove = business?.plan === 'pro' || business?.plan === 'zuri_plus' || business?.plan === 'enterprise'
    if (!proOrAbove) return
    setMarketInsightsLoading(true)
    axios.get<MarketInsights>('/api/network/market-insights?days=30', { headers: getAuthHeaders() })
      .then(res => { setMarketInsights(res.data); setMarketInsightsLoading(false) })
      .catch(() => { setMarketInsights(null); setMarketInsightsLoading(false) })
  }, [activeTab, businessId, business?.plan])

  const fetchOrders = (): void => {
    if (!businessId) return
    axios.get<Order[]>(`/api/order/business/${businessId}`, { headers: getAuthHeaders() })
      .then(res => setOrders(res.data))
      .catch(err => { if (err.response?.status === 401) { localStorage.removeItem('zuri_business_token'); navigate('/business/login', { replace: true }) } else console.error(err) })
  }

  const fetchReservations = (): void => {
    if (!businessId) return
    axios.get<Reservation[]>(`/api/reservations/business/${businessId}`, { headers: getAuthHeaders() })
      .then(res => setReservations(Array.isArray(res.data) ? res.data : []))
      .catch(err => {
        if (err.response?.status === 401) {
          localStorage.removeItem('zuri_business_token')
          navigate('/business/login', { replace: true })
        } else {
          console.error(err)
        }
      })
  }

  const fetchReviews = (): void => {
    if (!businessId) return
    axios
      .get<{ reviews: Review[] }>(`/api/reviews/business/${businessId}`, { headers: getAuthHeaders() })
      .then(res => setReviews(Array.isArray(res.data?.reviews) ? res.data.reviews : []))
      .catch(err => {
        if (err.response?.status === 401) {
          localStorage.removeItem('zuri_business_token')
          navigate('/business/login', { replace: true })
        } else {
          console.error(err)
        }
      })
  }

  const fetchAnalytics = async (): Promise<void> => {
    if (!businessId) return
    const headers = getAuthHeaders()
    try {
      const [sales, salesByDate, popular, hours, margins] = await Promise.all([
        axios.get<SalesSummary>(`/api/analytics/sales/${businessId}?period=month`, { headers }),
        axios.get<SalesByDate[]>(`/api/analytics/sales-by-date/${businessId}?days=30`, { headers }),
        axios.get<PopularItem[]>(`/api/analytics/popular-items/${businessId}?limit=10`, { headers }),
        axios.get<PeakHour[]>(`/api/analytics/peak-hours/${businessId}?days=30`, { headers }),
        axios.get<ProfitMargin[]>(`/api/analytics/profit-margins/${businessId}?days=30`, { headers })
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
      }, { headers: getAuthHeaders() })
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
      axios.post('/api/menu/item', itemData, { headers: getAuthHeaders() })
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

    axios.delete(`/api/menu/item/${itemId}`, { headers: getAuthHeaders() })
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
    }, { headers: getAuthHeaders() })
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

  const handleDeleteCategory = (categoryId: string): void => {
    const category = menu.find(c => c.id === categoryId)
    setPendingCategoryDelete({ id: categoryId, name: category?.name || 'this category' })
  }

  const confirmDeleteCategory = (): void => {
    if (!businessId || !pendingCategoryDelete) return
    axios.delete(`/api/menu/category/${pendingCategoryDelete.id}`, { headers: getAuthHeaders() })
      .then(() => {
        fetchMenu()
        setPendingCategoryDelete(null)
      })
      .catch(err => {
        alert('Failed to delete category')
        console.error(err)
      })
  }

  const updateOrderStatus = (orderId: string, status: OrderStatus): void => {
    axios.patch(`/api/order/${orderId}/status`, { status }, { headers: getAuthHeaders() })
      .then(() => {
        fetchOrders()
        fetchAnalytics()
      })
      .catch(err => {
        alert('Failed to update order status')
        console.error(err)
      })
  }

  const updateReservationStatus = (reservationId: string, status: Reservation['status']): void => {
    axios.patch(`/api/reservations/${reservationId}/status`, { status }, { headers: getAuthHeaders() })
      .then(() => {
        fetchReservations()
      })
      .catch(err => {
        alert('Failed to update reservation status')
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
      <div className="min-h-screen bg-black flex items-center justify-center font-normal">
        <PaperPlaneLoader size="lg" />
      </div>
    )
  }

  if (!businessId || businessId === 'undefined') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4 font-normal">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-zuri-black mb-2">Invalid dashboard</h1>
          <p className="text-gray-500 text-sm mb-6">Please log in again.</p>
          <a href="/business/login" className="inline-block bg-zuri-orange text-white px-4 py-1.5 rounded-lg text-sm hover:bg-zuri-orange-dark transition">
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

  const reservationCreatedAt = (r: Reservation & { created_at?: string }) => (r as { created_at?: string }).created_at ?? (r as Reservation).createdAt
  const reservationCustomerName = (r: Reservation & { customer_name?: string }) => (r as { customer_name?: string }).customer_name ?? (r as Reservation).customerName
  const reservationCustomerPhone = (r: Reservation & { customer_phone?: string }) => (r as { customer_phone?: string }).customer_phone ?? (r as Reservation).customerPhone
  const reservationReservedFor = (r: Reservation & { reserved_for?: string }) => (r as { reserved_for?: string }).reserved_for ?? (r as Reservation).reservedFor
  const reservationPartySize = (r: Reservation & { party_size?: number }) => (r as { party_size?: number }).party_size ?? (r as Reservation).partySize

  const reviewCreatedAt = (r: Review & { created_at?: string }) => (r as { created_at?: string }).created_at ?? r.createdAt
  const reviewCustomerName = (r: Review & { customer_name?: string }) => (r as { customer_name?: string }).customer_name ?? r.customerName

  const analyticsChartData = Array.isArray(salesData) ? [...salesData].reverse() : []
  const bestHour = Array.isArray(peakHours) && peakHours.length
    ? peakHours.reduce((best, cur) => (cur.orderCount > best.orderCount ? cur : best), peakHours[0])
    : null
  const topMenuItem = Array.isArray(popularItems) && popularItems.length ? popularItems[0] : null
  const highestMarginItem = Array.isArray(profitMargins) && profitMargins.length
    ? [...profitMargins].sort((a, b) => b.marginPercentage - a.marginPercentage)[0]
    : null

  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'preparing')
  const requestedReservations = reservations.filter(r => r.status === 'requested')
  const recentReviews = [...reviews].sort((a, b) => new Date(reviewCreatedAt(b) || 0).getTime() - new Date(reviewCreatedAt(a) || 0).getTime()).slice(0, 10)

  const notificationsCount = pendingOrders.length + requestedReservations.length + recentReviews.length
  const notificationsFeed = [
    ...pendingOrders.map(o => ({ type: 'order' as const, id: o.id, createdAtMs: new Date(orderCreatedAt(o) || 0).getTime(), order: o })),
    ...requestedReservations.map(r => ({ type: 'reservation' as const, id: r.id, createdAtMs: new Date(reservationCreatedAt(r) || 0).getTime(), reservation: r })),
    ...recentReviews.map((r) => ({ type: 'review' as const, id: r.id, createdAtMs: new Date(reviewCreatedAt(r) || 0).getTime(), review: r }))
  ].sort((a, b) => b.createdAtMs - a.createdAtMs)

  return (
    <div className="min-h-screen bg-[#f5f5f5] font-normal">
      <header className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative" ref={logoMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false)
                    setNotificationsOpen(false)
                    setLogoMenuOpen((open) => !open)
                  }}
                  className="flex items-center justify-center h-12 w-12 rounded-xl border border-gray-100 overflow-hidden bg-gray-50 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-zuri-orange/50"
                >
                  {business?.logoUrl ? (
                    <img src={business.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-lg font-bold text-gray-500">
                      {business?.name ? business.name.charAt(0).toUpperCase() : 'B'}
                    </span>
                  )}
                </button>
                {logoMenuOpen && (
                  <div className="absolute left-0 top-full mt-1 py-1 min-w-[160px] bg-white rounded-xl border border-gray-200 z-40">
                    {business?.plan && business.plan !== 'free' ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setShowLogoModal(true)
                            setProfileOpen(false)
                            setLogoUrlInput(business?.logoUrl || '')
                            setLogoUploadError(null)
                            setLogoMenuOpen(false)
                          }}
                          className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50"
                        >
                          Change logo
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!businessId) return
                            setLogoMenuOpen(false)
                            setProfileOpen(false)
                            try {
                              await axios.patch(`/api/business/${businessId}`, { logo_url: '' }, { headers: getAuthHeaders() })
                              setBusiness(prev => prev ? { ...prev, logoUrl: null } : null)
                            } catch (err) {
                              console.error(err)
                              alert('Failed to remove logo.')
                            }
                          }}
                          className="w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-50"
                        >
                          Remove logo
                        </button>
                      </>
                    ) : (
                      <a
                        href="/#pricing"
                        onClick={() => {
                          setLogoMenuOpen(false)
                          setProfileOpen(false)
                        }}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Upgrade to Starter to add a logo
                      </a>
                    )}
                  </div>
                )}
              </div>
              <div>
                <h1 className="text-xl font-bold text-zuri-black">{business?.name || 'Dashboard'}</h1>
                <p className="text-sm text-gray-500">{business?.email}</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {business?.plan && (
                <span className="hidden sm:inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-zuri-orange/10 text-zuri-orange border border-zuri-orange/30">
                  {PLAN_LABELS[business.plan]} plan
                </span>
              )}
              <div className="relative" ref={notificationsMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false)
                    setLogoMenuOpen(false)
                    setNotificationsOpen((open) => !open)
                  }}
                  className="relative flex items-center justify-center w-10 h-10 rounded-full bg-white border border-gray-200 hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-zuri-orange/50"
                  aria-label="Notifications"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zuri-black">
                    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                  {notificationsCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-zuri-orange text-white text-[11px] font-semibold flex items-center justify-center">
                      {Math.min(99, notificationsCount)}
                    </span>
                  )}
                </button>

                {notificationsOpen && (
                  <div className="absolute right-0 mt-3 w-[360px] bg-white rounded-2xl border border-gray-200 z-40 overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-zuri-black truncate">Notifications</p>
                      {notificationsCount > 0 ? (
                        <span className="text-xs text-gray-500">{notificationsCount} items</span>
                      ) : (
                        <span className="text-xs text-gray-400">All set</span>
                      )}
                    </div>

                    {notificationsCount === 0 ? (
                      <div className="p-4 text-sm text-gray-500">You are all caught up.</div>
                    ) : (
                      <div className="max-h-[420px] overflow-y-auto p-3 space-y-2">
                        {notificationsFeed.map(item => {
                          if (item.type === 'order' && item.order) {
                            const order = item.order
                            return (
                              <div key={item.id} className="bg-gray-50/50 rounded-xl p-3 border border-gray-100">
                                <div className="flex justify-between items-start gap-3">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-zuri-black truncate">
                                      #{order.id.slice(0, 8).toUpperCase()} · {orderCustomerName(order) || 'Guest'}
                                    </p>
                                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                      {orderCustomerPhone(order) || '—'} · ₦{orderTotalAmount(order).toFixed(2)}
                                    </p>
                                  </div>
                                  <span className={`inline-block px-2 py-1 rounded-lg text-[11px] font-semibold ${getStatusColor(order.status)}`}>
                                    {order.status}
                                  </span>
                                </div>

                                {order.status === 'pending' && (
                                  <div className="flex flex-wrap gap-2 mt-3">
                                    <button
                                      type="button"
                                      onClick={() => updateOrderStatus(order.id, 'preparing')}
                                      className="px-2.5 py-1 bg-zuri-orange text-white rounded-lg text-[11px] font-semibold hover:bg-zuri-orange-dark transition"
                                    >
                                      Start
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                      className="px-2.5 py-1 border border-zuri-orange text-zuri-orange rounded-lg text-[11px] font-semibold hover:bg-zuri-orange hover:text-white transition"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}

                                {order.status === 'preparing' && (
                                  <div className="flex gap-2 mt-3">
                                    <button
                                      type="button"
                                      onClick={() => updateOrderStatus(order.id, 'ready')}
                                      className="px-2.5 py-1 bg-zuri-orange text-white rounded-lg text-[11px] font-semibold hover:bg-zuri-orange-dark transition"
                                    >
                                      Ready
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          }

                          if (item.type === 'review' && item.review) {
                            const review = item.review
                            return (
                              <div key={item.id} className="bg-gray-50/50 rounded-xl p-3 border border-gray-100">
                                <div className="flex justify-between items-start gap-3">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-zuri-black truncate">
                                      {reviewCustomerName(review) || 'Customer'}
                                    </p>
                                    <div className="flex items-center gap-1 mt-1">
                                      {[1, 2, 3, 4, 5].map((n) => (
                                        <span key={n} className={n <= review.rating ? 'text-zuri-orange' : 'text-gray-300'}>
                                          ★
                                        </span>
                                      ))}
                                      <span className="text-[11px] text-gray-500 ml-2">{review.rating} / 5</span>
                                    </div>
                                    <p className="text-[11px] text-gray-500 mt-1 line-clamp-2">
                                      {review.comment || 'No comment'}
                                    </p>
                                  </div>
                              <span className="inline-block px-2 py-1 rounded-lg text-[11px] font-semibold bg-zuri-orange/10 text-zuri-orange border border-zuri-orange/30">
                                    Review
                                  </span>
                                </div>
                              </div>
                            )
                          }

                          if (item.type === 'reservation' && item.reservation) {
                            const reservation = item.reservation
                            return (
                              <div key={item.id} className="bg-gray-50/50 rounded-xl p-3 border border-gray-100">
                                <div className="flex justify-between items-start gap-3">
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-zuri-black truncate">
                                      {reservationCustomerName(reservation) || 'Guest'}
                                      <span className="text-gray-500 font-normal"> · Party {reservationPartySize(reservation) || 1}</span>
                                    </p>
                                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                      {reservation.customerPhone || reservation.customer_phone || '—'}
                                    </p>
                                    <p className="text-[11px] text-gray-500 mt-0.5 truncate">
                                      {reservationReservedFor(reservation)
                                        ? new Date(reservationReservedFor(reservation) || 0).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
                                        : '—'}
                                    </p>
                                  </div>
                                  <span
                                    className={`inline-block px-2 py-1 rounded-lg text-[11px] font-semibold ${
                                      reservation.status === 'requested'
                                        ? 'bg-yellow-100 text-yellow-800'
                                        : reservation.status === 'confirmed'
                                          ? 'bg-green-100 text-green-800'
                                          : 'bg-red-100 text-red-800'
                                    }`}
                                  >
                                    {reservation.status}
                                  </span>
                                </div>

                                {reservation.status === 'requested' && (
                                  <div className="flex flex-wrap gap-2 mt-3">
                                    <button
                                      type="button"
                                      onClick={() => updateReservationStatus(reservation.id, 'confirmed')}
                                      className="px-2.5 py-1 bg-zuri-orange text-white rounded-lg text-[11px] font-semibold hover:bg-zuri-orange-dark transition"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateReservationStatus(reservation.id, 'cancelled')}
                                      className="px-2.5 py-1 border border-zuri-orange text-zuri-orange rounded-lg text-[11px] font-semibold hover:bg-zuri-orange hover:text-white transition"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                )}
                              </div>
                            )
                          }

                          return null
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="relative" ref={profileMenuRef}>
                <button
                  type="button"
                  onClick={() => {
                    setLogoMenuOpen(false)
                    setNotificationsOpen(false)
                    setProfileOpen((open) => !open)
                  }}
                  className="flex items-center justify-center w-10 h-10 rounded-full bg-zuri-black text-white font-semibold text-sm border border-gray-200 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-zuri-orange"
                >
                  {business?.name ? business.name.charAt(0).toUpperCase() : 'B'}
                </button>
                {profileOpen && (
                  <div className="absolute right-0 mt-3 w-72 bg-white rounded-2xl border border-gray-200 z-40">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-semibold text-zuri-black truncate">{business?.name || 'Business'}</p>
                      <p className="text-xs text-gray-500 truncate">{business?.email}</p>
                      {business?.plan && (
                        <span className="inline-flex mt-2 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-zuri-orange/10 text-zuri-orange border border-zuri-orange/30">
                          {PLAN_LABELS[business.plan]} account
                        </span>
                      )}
                    </div>
                    <div className="py-1">
                      <button
                        type="button"
                        onClick={() => {
                          navigate('/')
                          setProfileOpen(false)
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                      >
                        <span>Home</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (businessId) navigate(`/business/dashboard/${businessId}/payment`)
                          setProfileOpen(false)
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                      >
                        <span>Payouts & billing</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (businessId) navigate(`/business/dashboard/${businessId}/payment`)
                          setProfileOpen(false)
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                      >
                        <span>View plans & pricing</span>
                      </button>
                      {business?.plan && business.plan !== 'free' && (
                        <div className="px-4 py-2 text-xs text-gray-500">
                          Current tier: <span className="font-semibold text-zuri-black">{PLAN_LABELS[business.plan]}</span>
                        </div>
                      )}
                    </div>
                    <div className="border-t border-gray-100 py-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowChangePasswordModal(true)
                          setChangePasswordCurrent('')
                          setChangePasswordNew('')
                          setChangePasswordConfirm('')
                          setChangePasswordError(null)
                          setProfileOpen(false)
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left"
                      >
                        <span>Change password</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          localStorage.removeItem('zuri_business_token')
                          setProfileOpen(false)
                          navigate('/business/login', { replace: true })
                        }}
                        className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 text-left"
                      >
                        <span>Log out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>

      {(business?.plan === 'growth' ||
        business?.plan === 'pro' ||
        business?.plan === 'zuri_plus' ||
        business?.plan === 'enterprise' ||
        business?.plan === 'basic' ||
        business?.plan === 'advanced') && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zuri-black">Zuri Tap</span>
              <button
                type="button"
                role="switch"
                aria-checked={!!tapCode}
                onClick={async () => {
                  if (!businessId) return
                  setTapRoomLoading(true)
                  try {
                    if (tapCode) {
                      await axios.post('/api/tap/room/off', { businessId }, { headers: getAuthHeaders() })
                      setTapCode(null)
                      setTapExpiresAt(null)
                      setZuriTapOn(false)
                      setTapWaitingOrderId(null)
                    } else {
                      const { data } = await axios.post<{ code: string; expiresAt: string }>('/api/tap/room/on', { businessId }, { headers: getAuthHeaders() })
                      setTapCode(data.code)
                      setTapExpiresAt(data.expiresAt)
                      setZuriTapOn(true)
                      setTapSelections({})
                    }
                  } catch (e) {
                    console.error(e)
                  } finally {
                    setTapRoomLoading(false)
                  }
                }}
                disabled={tapRoomLoading}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-zuri-orange focus:ring-offset-2 disabled:opacity-50 ${
                  tapCode ? 'bg-zuri-orange' : 'bg-gray-200'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition ${
                    tapCode ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
            <p className="text-xs text-gray-500">
              Turn Zuri Tap on to send Tap requests from your menu to any customers who have joined this room.
            </p>
          </div>
        </div>
      )}
      {(business?.plan === 'free' || business?.plan === 'starter') && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-3 flex justify-center">
            <a href="/#pricing" className="text-xs sm:text-sm text-gray-500 hover:text-zuri-orange transition">
              Upgrade to Growth or above to unlock Zuri Tap.
            </a>
          </div>
        </div>
      )}

      {/* Zuri Tap hotspot panel - when Tap is on */}
      {tapCode && (
        <div className="bg-zuri-black text-white border-b border-gray-800">
          <div className="max-w-6xl mx-auto px-4 py-6">
            <h2 className="text-lg font-bold mb-2">Zuri Tap – Live room</h2>
            <p className="text-sm text-gray-300 mb-4">Customer enters this code on their Zuri Tap screen to join your room and see payment requests.</p>
            <p className="text-3xl font-mono font-bold tracking-widest mb-6">{tapCode}</p>
            <p className="text-xs text-gray-400 mb-4">Select items from your menu, then tap Send. When the customer is ready, they’ll see the request and pay with their Zuri Tap password.</p>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <p className="text-sm font-semibold text-gray-300 mb-2">Select menu items</p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {menu.flatMap(c => c.items).filter(i => i.available).map(item => (
                    <div key={item.id} className="flex items-center justify-between gap-2 bg-white/10 rounded-lg px-3 py-2">
                      <span className="text-sm truncate">{item.name}</span>
                      <span className="text-sm text-gray-300">₦{item.price.toFixed(2)}</span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setTapSelections(s => ({ ...s, [item.id]: Math.max(0, (s[item.id] || 0) - 1) }))}
                          className="w-7 h-7 rounded bg-white/20 flex items-center justify-center text-sm font-bold"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-sm">{tapSelections[item.id] || 0}</span>
                        <button
                          type="button"
                          onClick={() => setTapSelections(s => ({ ...s, [item.id]: (s[item.id] || 0) + 1 }))}
                          className="w-7 h-7 rounded bg-white/20 flex items-center justify-center text-sm font-bold"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                  {menu.flatMap(c => c.items).filter(i => i.available).length === 0 && (
                    <p className="text-sm text-gray-400">No menu items. Add items in the Menu tab.</p>
                  )}
                </div>
                {(() => {
                  const selected = menu.flatMap(c => c.items).filter(i => (tapSelections[i.id] || 0) > 0)
                  const total = selected.reduce((sum, i) => sum + i.price * (tapSelections[i.id] || 0), 0)
                  return (
                    <div className="mt-4 flex items-center justify-between">
                      <span className="text-sm font-semibold">Total: ₦{total.toFixed(2)}</span>
                      <button
                        type="button"
                        disabled={tapSending || selected.length === 0 || !!tapWaitingOrderId}
                        onClick={async () => {
                          if (!businessId || selected.length === 0) return
                          setTapSending(true)
                          try {
                            const items = selected.map(i => ({
                              menuItemId: i.id,
                              name: i.name,
                              price: i.price,
                              quantity: tapSelections[i.id] || 1
                            }))
                            const { data } = await axios.post<{ orderId: string }>('/api/tap/send', { businessId, code: tapCode, items }, { headers: getAuthHeaders() })
                            setTapWaitingOrderId(data.orderId)
                            tapWaitingOrderIdRef.current = data.orderId
                          } catch (e) {
                            console.error(e)
                            alert('Failed to send request')
                          } finally {
                            setTapSending(false)
                          }
                        }}
                        className="px-4 py-2 bg-zuri-orange text-white rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {tapWaitingOrderId ? 'Waiting for customer to pay…' : tapSending ? 'Sending…' : 'Send to room'}
                      </button>
                    </div>
                  )
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

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
                      const { data } = await axios.post<{ logoUrl: string }>(`/api/business/${businessId}/upload-logo`, formData, { headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' } })
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
                      await axios.patch(`/api/business/${businessId}`, { logo_url: logoUrlInput.trim() }, { headers: getAuthHeaders() })
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

      {/* Change password modal */}
      {showChangePasswordModal && businessId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-zuri-black">Change password</h3>
              <button
                type="button"
                onClick={() => {
                  setShowChangePasswordModal(false)
                  setChangePasswordCurrent('')
                  setChangePasswordNew('')
                  setChangePasswordConfirm('')
                  setChangePasswordError(null)
                }}
                className="text-gray-400 hover:text-zuri-black transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-gray-500 mb-4">Enter your current password, then choose a new password.</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault()
                setChangePasswordError(null)
                if (!changePasswordCurrent.trim()) {
                  setChangePasswordError('Current password is required.')
                  return
                }
                if (!changePasswordNew.trim()) {
                  setChangePasswordError('New password is required.')
                  return
                }
                if (changePasswordNew.length < 6) {
                  setChangePasswordError('New password must be at least 6 characters.')
                  return
                }
                if (changePasswordNew !== changePasswordConfirm) {
                  setChangePasswordError('New password and confirmation do not match.')
                  return
                }
                setChangePasswordLoading(true)
                try {
                  await axios.patch(
                    `/api/business/${businessId}/change-password`,
                    { current_password: changePasswordCurrent, new_password: changePasswordNew },
                    { headers: getAuthHeaders() }
                  )
                  setShowChangePasswordModal(false)
                  setChangePasswordCurrent('')
                  setChangePasswordNew('')
                  setChangePasswordConfirm('')
                } catch (err) {
                  const msg = axios.isAxiosError(err) && err.response?.data?.error
                    ? err.response.data.error
                    : 'Failed to change password. Try again.'
                  setChangePasswordError(msg)
                } finally {
                  setChangePasswordLoading(false)
                }
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Current password</label>
                <input
                  type="password"
                  value={changePasswordCurrent}
                  onChange={(e) => setChangePasswordCurrent(e.target.value)}
                  placeholder="Enter current password"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                  autoComplete="current-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <input
                  type="password"
                  value={changePasswordNew}
                  onChange={(e) => setChangePasswordNew(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                  autoComplete="new-password"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm new password</label>
                <input
                  type="password"
                  value={changePasswordConfirm}
                  onChange={(e) => setChangePasswordConfirm(e.target.value)}
                  placeholder="Confirm new password"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                  autoComplete="new-password"
                />
              </div>
              {changePasswordError && (
                <p className="text-sm text-red-600">{changePasswordError}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowChangePasswordModal(false)
                    setChangePasswordCurrent('')
                    setChangePasswordNew('')
                    setChangePasswordConfirm('')
                    setChangePasswordError(null)
                  }}
                  className="flex-1 px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={changePasswordLoading}
                  className="flex-1 px-4 py-2.5 bg-zuri-orange text-white rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark disabled:opacity-50"
                >
                  {changePasswordLoading ? 'Updating…' : 'Update password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-transparent overflow-hidden">
          <div className="flex border-b border-gray-100 overflow-x-auto">
            <button
              onClick={() => {
                setActiveTab('orders')
                fetchOrders()
                if (business?.plan && business.plan !== 'free' && business.plan !== 'starter') {
                  fetchAnalytics()
                }
              }}
              className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition ${
                activeTab === 'orders'
                  ? 'text-zuri-orange border-b-2 border-zuri-orange bg-zuri-orange/10'
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
                    ? 'text-zuri-orange border-b-2 border-zuri-orange bg-zuri-orange/10'
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
                  ? 'text-zuri-orange border-b-2 border-zuri-orange bg-zuri-orange/10'
                  : 'text-gray-600 hover:text-zuri-black'
              }`}
            >
              Menu
            </button>
            <button
              onClick={() => setActiveTab('qr')}
              className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition ${
                activeTab === 'qr'
                  ? 'text-zuri-orange border-b-2 border-zuri-orange bg-zuri-orange/10'
                  : 'text-gray-600 hover:text-zuri-black'
              }`}
            >
              QR Code
            </button>
            {(business?.plan === 'pro' || business?.plan === 'zuri_plus' || business?.plan === 'enterprise') && (
              <button
                onClick={() => setActiveTab('ai')}
                className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition ${
                  activeTab === 'ai'
                    ? 'text-zuri-orange border-b-2 border-zuri-orange bg-zuri-orange/10'
                    : 'text-gray-600 hover:text-zuri-black'
                }`}
              >
                Zuri AI
              </button>
            )}
          </div>

          <div className="p-6">
            {/* Orders Tab */}
            {activeTab === 'orders' && (
              <div className="space-y-8">
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
                            {order.returningZuriCustomer && order.zuriCustomerStats && (
                              <p className="text-xs text-zuri-orange font-medium mt-1">
                                Returning Zuri customer – avg spend ₦{order.zuriCustomerStats.avgOrderValue.toFixed(0)} ({order.zuriCustomerStats.totalOrders} orders across {order.zuriCustomerStats.businessCount} Zuri businesses)
                              </p>
                            )}
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

                {/* Reservations */}
                <div>
                  <h2 className="text-lg font-bold text-zuri-black mb-6">Reservation requests</h2>
                  {reservations.length === 0 ? (
                    <p className="text-gray-500 text-sm text-center py-12">No reservation requests yet</p>
                  ) : (
                    <div className="space-y-4">
                      {reservations.map(reservation => (
                        <div key={reservation.id} className="bg-gray-50/50 rounded-xl p-5 border border-gray-100">
                          <div className="flex justify-between items-start gap-4 mb-4">
                            <div>
                              <p className="font-bold text-zuri-black text-sm">{reservationCustomerName(reservation) || 'Guest'}</p>
                              <p className="text-xs text-gray-500 mt-0.5">
                                {reservation.customerPhone || reservation.customer_phone || '—'} · Party {reservationPartySize(reservation) || 1}
                              </p>
                              <p className="text-xs text-gray-500">
                                {reservationReservedFor(reservation)
                                  ? new Date(reservationReservedFor(reservation) || 0).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
                                  : '—'}
                              </p>
                              {reservation.notes && (
                                <p className="text-xs text-gray-600 mt-1 line-clamp-2">Notes: {reservation.notes}</p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <span
                                className={`inline-block px-2.5 py-1 rounded-lg text-xs font-semibold ${
                                  reservation.status === 'requested'
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : reservation.status === 'confirmed'
                                      ? 'bg-green-100 text-green-800'
                                      : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {reservation.status}
                              </span>
                            </div>
                          </div>

                          {reservation.status === 'requested' && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => updateReservationStatus(reservation.id, 'confirmed')}
                                className="px-3 py-1.5 bg-zuri-orange text-white rounded-xl text-xs font-semibold hover:bg-zuri-orange-dark transition"
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => updateReservationStatus(reservation.id, 'cancelled')}
                                className="px-3 py-1.5 bg-white border border-zuri-orange text-zuri-orange rounded-xl text-xs font-semibold hover:bg-zuri-orange hover:text-white transition"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Analytics Tab */}
            {activeTab === 'analytics' && business?.plan && business.plan !== 'free' && business.plan !== 'starter' && (
              <div className="space-y-8">
                {/* Summary Cards */}
                <div className="grid md:grid-cols-4 gap-4">
                  <div className="bg-zuri-orange/10 rounded-xl p-5 border border-zuri-orange/30">
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

                <div className="bg-white rounded-xl p-6 border border-gray-200">
                  <h3 className="text-lg font-bold text-zuri-black mb-4">Sales over time</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={analyticsChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="revenue" stroke="#ffbd59" strokeWidth={2} name="Revenue" />
                      <Line type="monotone" dataKey="completedRevenue" stroke="#000000" strokeWidth={2} name="Completed" />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  {/* Popular Items */}
                  <div className="bg-white rounded-xl p-6 border border-gray-200">
                    <h3 className="text-lg font-bold text-zuri-black mb-4">Most popular items</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={Array.isArray(popularItems) ? popularItems.slice(0, 5) : []}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                        <YAxis />
                        <Tooltip />
                        <Bar dataKey="totalQuantity" fill="#ffbd59" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="bg-white rounded-xl p-6 border border-gray-200">
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

                <div className="bg-white rounded-xl p-6 border border-gray-200">
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

                {/* Premium analytics (Pro+) */}
                {(business?.plan === 'pro' || business?.plan === 'zuri_plus' || business?.plan === 'enterprise') && marketInsights && !marketInsightsLoading && (
                  <div className="grid md:grid-cols-3 gap-6">
                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                      <h3 className="text-lg font-bold text-zuri-black mb-4">Completion rate</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart
                          data={[
                            { name: 'Completed', value: analytics?.completedRevenue || 0 },
                            { name: 'Pending', value: Math.max(0, (analytics?.totalRevenue || 0) - (analytics?.completedRevenue || 0)) }
                          ]}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="value" fill="#ffbd59" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                      <h3 className="text-lg font-bold text-zuri-black mb-4">Platform top items</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={marketInsights.platform.topItemNames.slice(0, 6)}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" angle={-35} textAnchor="end" height={90} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="orderCount" fill="#000000" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>

                    <div className="bg-white rounded-xl p-6 border border-gray-200">
                      <h3 className="text-lg font-bold text-zuri-black mb-4">Platform peak hours</h3>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={marketInsights.platform.peakHours}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="hour" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="orderCount" fill="#ffbd59" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {(business?.plan === 'pro' || business?.plan === 'zuri_plus' || business?.plan === 'enterprise') && (
                  <div className="space-y-6">
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="bg-white rounded-xl p-5 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Peak conversion hour</p>
                        <p className="text-2xl font-bold text-zuri-black">{bestHour ? `${bestHour.hour}:00` : '—'}</p>
                        <p className="text-xs text-gray-500 mt-1">{bestHour ? `${bestHour.orderCount} orders` : 'No data yet'}</p>
                      </div>
                      <div className="bg-white rounded-xl p-5 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Top selling item</p>
                        <p className="text-lg font-bold text-zuri-black truncate">{topMenuItem?.name || '—'}</p>
                        <p className="text-xs text-gray-500 mt-1">{topMenuItem ? `${topMenuItem.totalQuantity} sold` : 'No data yet'}</p>
                      </div>
                      <div className="bg-white rounded-xl p-5 border border-gray-200">
                        <p className="text-xs text-gray-500 mb-1">Highest margin item</p>
                        <p className="text-lg font-bold text-zuri-black truncate">{highestMarginItem?.name || '—'}</p>
                        <p className="text-xs text-gray-500 mt-1">{highestMarginItem ? `${highestMarginItem.marginPercentage.toFixed(1)}% margin` : 'No data yet'}</p>
                      </div>
                    </div>

                    <div className="grid md:grid-cols-2 gap-6">
                      <div className="bg-white rounded-xl p-6 border border-gray-200">
                        <h3 className="text-lg font-bold text-zuri-black mb-4">Orders vs completed revenue</h3>
                        <ResponsiveContainer width="100%" height={280}>
                          <AreaChart data={analyticsChartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis yAxisId="left" />
                            <YAxis yAxisId="right" orientation="right" />
                            <Tooltip />
                            <Legend />
                            <Area yAxisId="left" type="monotone" dataKey="orderCount" stroke="#111827" fill="#E5E7EB" name="Orders" />
                            <Area yAxisId="right" type="monotone" dataKey="completedRevenue" stroke="#ffbd59" fill="#ffbd59" name="Completed revenue" />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="bg-white rounded-xl p-6 border border-gray-200">
                        <h3 className="text-lg font-bold text-zuri-black mb-4">Top margins by item</h3>
                        <ResponsiveContainer width="100%" height={280}>
                          <BarChart data={profitMargins.slice(0, 8)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" angle={-30} textAnchor="end" height={80} />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="marginPercentage" fill="#ffbd59" name="Margin %" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                )}

                {/* Market intelligence (Pro+) – Business Graph */}
                {(business?.plan === 'pro' || business?.plan === 'zuri_plus' || business?.plan === 'enterprise') && (
                  <div className="bg-gradient-to-br from-zuri-black to-gray-900 rounded-xl p-6 border border-zuri-orange/20 text-white">
                    <h3 className="text-lg font-bold mb-1 flex items-center gap-2">
                      <span className="text-zuri-yellow">Market intelligence</span>
                      <span className="text-xs font-normal text-gray-400">(Zuri Network)</span>
                    </h3>
                    <p className="text-sm text-gray-400 mb-4">Anonymous platform insights. No other business data is shared.</p>
                    {marketInsightsLoading ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-2 border-zuri-yellow border-t-transparent" />
                      </div>
                    ) : marketInsights ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xs text-gray-400">Platform orders (last {marketInsights.platform.periodDays} days)</p>
                            <p className="text-xl font-bold">{marketInsights.platform.totalOrders.toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Platform avg order</p>
                            <p className="text-xl font-bold text-zuri-yellow">₦{Math.round(marketInsights.platform.avgOrderValue).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Order trend</p>
                            <p className={`text-xl font-bold ${marketInsights.platform.orderCountTrendPct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {marketInsights.platform.orderCountTrendPct >= 0 ? '+' : ''}{marketInsights.platform.orderCountTrendPct}%
                            </p>
                          </div>
                          {marketInsights.yourBusiness != null && (
                            <div>
                              <p className="text-xs text-gray-400">Your avg order</p>
                              <p className="text-xl font-bold">₦{Math.round(marketInsights.yourBusiness.avgOrderValue).toLocaleString()}</p>
                            </div>
                          )}
                        </div>
                        {marketInsights.insights.length > 0 && (
                          <ul className="space-y-2 border-t border-white/10 pt-4">
                            {marketInsights.insights.map((line, i) => (
                              <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                                <span className="text-zuri-yellow shrink-0">•</span>
                                <span>{line}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">Unable to load market insights. Upgrade to Pro if you don’t see this.</p>
                    )}
                  </div>
                )}

                {business?.plan && business.plan !== 'free' && business.plan !== 'starter' && (business.plan !== 'pro' && business.plan !== 'zuri_plus' && business.plan !== 'enterprise') && (
                  <div className="bg-zuri-orange/10 rounded-xl p-6 border border-zuri-orange/30">
                    <h3 className="text-lg font-bold text-zuri-black mb-2">Market intelligence</h3>
                    <p className="text-sm text-gray-600 mb-4">See anonymous platform trends, peak times, and how you compare. Available on Pro and above.</p>
                    <a href="/#pricing" className="inline-block bg-zuri-orange text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition">Upgrade to Pro</a>
                  </div>
                )}
              </div>
            )}

            {/* Menu Management Tab */}
            {activeTab === 'menu' && (
              <div>
                <h2 className="text-lg font-bold text-zuri-black mb-6">Menu</h2>
                <div className="flex justify-between items-center mb-6">
                  <button
                    type="button"
                    onClick={() => {
                      if (!businessId) return
                      navigate(`/business/dashboard/${businessId}/customize`)
                    }}
                    className="bg-white border border-zuri-orange text-zuri-orange px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-zuri-orange hover:text-white transition disabled:opacity-50"
                  >
                    Customize menu
                  </button>
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
                      <div
                        key={category.id}
                        className="bg-gray-50/50 rounded-xl p-5 border border-gray-100"
                        draggable
                        onDragStart={(e) => {
                          if ((e.target as HTMLElement | null)?.closest('button')) return
                          setDraggingCategoryId(category.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          if (!businessId) return
                          const fromId = draggingCategoryId
                          if (!fromId || fromId === category.id) return

                          const fromIndex = menu.findIndex(c => c.id === fromId)
                          const toIndex = menu.findIndex(c => c.id === category.id)
                          if (fromIndex < 0 || toIndex < 0) return

                          const next = [...menu]
                          const [moved] = next.splice(fromIndex, 1)
                          const insertIndex = toIndex > fromIndex ? toIndex - 1 : toIndex
                          next.splice(insertIndex, 0, moved)

                          setMenu(next)
                          setDraggingCategoryId(null)

                          Promise.all(
                            next.map((c, idx) => (
                              axios.patch(`/api/menu/category/${c.id}`, { businessId, displayOrder: idx, name: c.name }, { headers: getAuthHeaders() })
                            ))
                          )
                            .then(() => fetchMenu())
                            .catch(err => {
                              console.error(err)
                              fetchMenu()
                            })
                        }}
                      >
                        <div className="flex items-center justify-between gap-4 mb-4">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-gray-400 select-none">⋮⋮</span>
                            <h3 className="text-lg font-bold text-zuri-black truncate">{category.name}</h3>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(category.id)}
                            className="px-3 py-1.5 border border-zuri-orange text-zuri-orange rounded-lg text-xs font-semibold hover:bg-zuri-orange hover:text-white transition"
                          >
                            Delete
                          </button>
                        </div>
                        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {category.items.map(item => (
                            <div key={item.id} className="bg-white rounded-xl p-4 border border-gray-200">
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
                                    axios.put(`/api/menu/item/${item.id}`, { available: !item.available }, { headers: getAuthHeaders() })
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
                                        headers: { ...getAuthHeaders(), 'Content-Type': 'multipart/form-data' }
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
                            className="flex-1 px-3 py-1.5 border border-zuri-orange rounded-lg font-semibold text-zuri-orange hover:bg-zuri-orange hover:text-white transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="flex-1 px-3 py-1.5 bg-zuri-orange text-white rounded-lg font-semibold hover:bg-zuri-orange-dark transition"
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
                            className="flex-1 px-3 py-1.5 border border-zuri-orange rounded-lg font-semibold text-zuri-orange hover:bg-zuri-orange hover:text-white transition"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            className="flex-1 px-3 py-1.5 bg-zuri-orange text-white rounded-lg font-semibold hover:bg-zuri-orange-dark transition"
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
                    <div className="bg-white p-6 rounded-xl inline-block mb-6 border border-gray-200">
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
                  <div className="py-12 flex items-center justify-center bg-black w-full">
                    <PaperPlaneLoader size="md" />
                  </div>
                )}
              </div>
            )}

            {/* Zuri AI Dashboard (Pro and above) */}
            {activeTab === 'ai' && (business?.plan === 'pro' || business?.plan === 'zuri_plus' || business?.plan === 'enterprise') && (
              <div className="max-w-5xl mx-auto">
                <div className="rounded-3xl border border-zuri-orange/20 bg-white/75 backdrop-blur-sm px-5 py-6 sm:px-10 sm:py-8 shadow-[0_10px_30px_rgba(255,189,89,0.08)]">
                  <div className="flex items-center justify-between mb-8">
                    <div className="inline-flex items-center gap-2 rounded-full border border-zuri-orange/20 bg-zuri-orange/5 px-3 py-1 text-xs text-zuri-black/80">
                      <span className="h-5 w-5 rounded-full bg-zuri-black text-white grid place-items-center text-[10px]">AI</span>
                      <span>Hello AI</span>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-zuri-orange/20 border border-zuri-orange/35 grid place-items-center text-zuri-black text-xs font-semibold">
                      {business?.name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                  </div>

                  <div className="text-center mb-8">
                    <p className="text-zuri-black/75 text-xl sm:text-2xl">Hi {business?.name || 'there'}</p>
                    <h2 className="text-zuri-black text-3xl sm:text-4xl font-semibold leading-tight mt-1">What would you like to know?</h2>
                    <p className="text-zuri-black/55 text-sm mt-2">Use one of the most common prompts below or ask your own question.</p>
                  </div>

                  {/* Customer Intelligence metrics (Pro+) */}
                  {customerIntelligence && customerIntelligence.uniqueCustomers > 0 && (
                    <div className="rounded-2xl border border-zuri-orange/20 bg-zuri-orange/5 p-4 mb-6">
                      <h3 className="font-semibold text-zuri-black mb-3">Customer intelligence snapshot</h3>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <div>
                          <p className="text-zuri-black/60">Unique customers</p>
                          <p className="font-semibold text-zuri-black">{customerIntelligence.uniqueCustomers}</p>
                        </div>
                        <div>
                          <p className="text-zuri-black/60">Repeat rate</p>
                          <p className="font-semibold text-zuri-black">{customerIntelligence.repeatRatePct.toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="text-zuri-black/60">Avg order value</p>
                          <p className="font-semibold text-zuri-black">₦{customerIntelligence.avgSpendPerOrder.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-zuri-black/60">Return in 10 days</p>
                          <p className="font-semibold text-zuri-black">{customerIntelligence.returnWithin10DaysPct.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
                    {[
                      { type: 'revenue_insights', label: 'Revenue insights', desc: 'Best sellers and bundle ideas' },
                      { type: 'sales_forecasting', label: 'Sales forecast', desc: 'Demand and peak-hour signals' },
                      { type: 'promotions_suggestions', label: 'Promotion ideas', desc: 'Offers for slow days' }
                    ].map(({ type, label, desc }) => (
                      <button
                        key={type}
                        disabled={aiInsightLoading}
                        onClick={async () => {
                          if (!businessId) return
                          setAiInsight(null)
                          setAiInsightLoading(true)
                          try {
                            const { data } = await axios.post<{ insight: string }>('/api/ai/insights', { businessId, type }, { headers: getAuthHeaders() })
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
                        className="text-left rounded-xl border border-zuri-orange/20 bg-white/80 px-4 py-3 hover:bg-zuri-orange/5 transition disabled:opacity-70"
                      >
                        <span className="font-semibold text-zuri-black block">{label}</span>
                        <span className="text-xs text-zuri-black/60">{desc}</span>
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2 rounded-full border border-zuri-orange/25 bg-white/85 px-3 py-2">
                    <span className="h-6 w-6 rounded-full bg-zuri-orange/15 text-zuri-orange grid place-items-center text-[10px] font-semibold">AI</span>
                    <input
                      value={aiCustomQuery}
                      onChange={(e) => setAiCustomQuery(e.target.value)}
                      placeholder="Ask whatever you want"
                      className="flex-1 bg-transparent text-sm text-zuri-black placeholder:text-zuri-black/45 focus:outline-none"
                    />
                    <button
                      type="button"
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
                          }, { headers: getAuthHeaders() })
                          setAiInsight(data.insight || 'No response.')
                        } catch (err: unknown) {
                          const ax = err as { response?: { data?: { error?: string } } }
                          setAiInsight(`Error: ${ax.response?.data?.error || 'Request failed.'}`)
                        } finally {
                          setAiInsightLoading(false)
                        }
                      }}
                      className="h-7 w-7 rounded-full bg-zuri-orange/20 text-zuri-black grid place-items-center hover:bg-zuri-orange/35 transition disabled:opacity-50"
                      aria-label="Ask AI"
                    >
                      {`->`}
                    </button>
                  </div>

                  {aiInsight !== null && (
                    <div className="rounded-2xl border border-zuri-orange/20 bg-zuri-orange/5 p-5 mt-5">
                      <h3 className="font-semibold text-zuri-black mb-2">{aiInsightLoading ? 'Thinking...' : 'Insight'}</h3>
                      <div className="whitespace-pre-wrap text-zuri-black/85 text-sm leading-relaxed">{aiInsight}</div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmModal
        open={!!pendingCategoryDelete}
        title="Delete category?"
        message={`"${pendingCategoryDelete?.name || 'This category'}" will be removed, and its items will move to Uncategorized.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={confirmDeleteCategory}
        onCancel={() => setPendingCategoryDelete(null)}
      />
    </div>
  )
}

export default BusinessDashboard

