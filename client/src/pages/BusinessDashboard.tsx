import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import io, { Socket } from 'socket.io-client'
import {
  LineChart, Line, BarChart, Bar, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { Business, Order, Reservation, Review, SalesSummary, SalesByDate, PopularItem, PeakHour, ProfitMargin, QRCodeData, MenuCategory, MenuItem, PLAN_LABELS, type BusinessMode, type AiGuestStorefrontConfig } from '../types'
import type { CustomerIntelligence } from '../types'
import type { MarketInsights } from '../types'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'
import { ConfirmModal } from '../components/ConfirmModal'
import { CustomDropdown } from '../components/CustomDropdown'
import { ZuriDatePicker } from '../components/ZuriDatePicker'
import { API_BASE_URL, apiUrl } from '../lib/apiBase'
import { formatUserFacingError } from '../lib/formatApiError'
import { isAiInsightsTier, isGuestAiMenuTier, isGrowthPlusPlan, isOpsAiTier, isScaleGuestMenuTagPlan } from '../lib/planAccess'
import { mergeStorefrontConfig, DEFAULT_AI_GUEST } from '../lib/storefrontTheme'
import { computeNetAfterFeeNaira, computeTransactionFeeNaira, formatModeTransactionFee } from '../lib/transactionFees'
import { MenuCatalogPresets } from '../components/menu/MenuCatalogPresets'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type TabType = 'orders' | 'analytics' | 'menu' | 'qr' | 'payment' | 'ai'
type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
type OrdersTimePreset = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom'

function isOrderInDashboardRange(
  createdRaw: string | undefined,
  preset: OrdersTimePreset,
  customFrom: string,
  customTo: string
): boolean {
  const t = new Date(createdRaw || 0).getTime()
  if (!Number.isFinite(t)) return false
  const now = new Date()
  if (preset === 'all') return true
  if (preset === 'today') {
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)
    const end = new Date(now)
    end.setHours(23, 59, 59, 999)
    return t >= start.getTime() && t <= end.getTime()
  }
  if (preset === 'week') {
    const start = new Date(now)
    start.setDate(start.getDate() - 6)
    start.setHours(0, 0, 0, 0)
    return t >= start.getTime()
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    start.setHours(0, 0, 0, 0)
    return t >= start.getTime()
  }
  if (preset === 'year') {
    const start = new Date(now.getFullYear(), 0, 1)
    start.setHours(0, 0, 0, 0)
    return t >= start.getTime()
  }
  if (preset === 'custom') {
    const fromMs = customFrom ? new Date(`${customFrom}T00:00:00`).getTime() : NaN
    const toMs = customTo ? new Date(`${customTo}T23:59:59.999`).getTime() : NaN
    if (!Number.isFinite(fromMs) && !Number.isFinite(toMs)) return true
    if (Number.isFinite(fromMs) && t < fromMs) return false
    if (Number.isFinite(toMs) && t > toMs) return false
    return true
  }
  return true
}

function orderCreatedRawForFilter(o: Order): string | undefined {
  return (o as { created_at?: string }).created_at ?? (o as Order).createdAt
}

function createEmptyItemForm() {
  return {
    name: '',
    description: '',
    price: '',
    cost: '',
    estimatedPrepTime: '15',
    categoryId: '',
    imageUrl: '',
    available: true,
    stockOnHand: '',
    lowStockThreshold: '',
    maxPerUser: '',
    groupSize: '',
    minPerOrder: '',
    pricingType: 'paid' as string,
    perks: [] as string[],
    nameTransHa: '',
    nameTransYo: '',
    nameTransIg: '',
    canonicalDishId: '',
    ingredients: ''
  }
}

type AiInsightType = 'revenue_insights' | 'sales_forecasting' | 'promotions_suggestions' | 'custom'

type AiSignals = {
  businessId: string
  generatedAt: string
  rush: { last30mOrders: number; baselinePerHour: number; rushRatio: number }
  anomaly: { expectedSoFar: number; revenueSoFar: number; deltaPct: number } | null
  todayTopItems: { id: string; name: string; orderCount: number }[]
  lowStock: {
    id: string
    name: string
    stockOnHand: number
    lowStockThreshold: number | null
    projectedHoursLeft: number | null
  }[]
}

type AiChat = {
  id: string
  businessId: string
  type: AiInsightType
  query?: string
  insight: string
  createdAt: string
}

const AI_CHATS_STORAGE_PREFIX = 'zuri_ai_chats_'

function safeMarkdownDuringTyping(text: string): string {
  // ReactMarkdown may show raw markers if the user is mid-typing.
  // Remove a trailing unmatched formatting token (so we never show "**" while typing).
  let out = text

  const boldMarkerCount = (out.match(/\*\*/g) || []).length
  if (boldMarkerCount % 2 !== 0) {
    const idx = out.lastIndexOf('**')
    if (idx !== -1) out = out.slice(0, idx) + out.slice(idx + 2)
  }

  const codeTickCount = (out.match(/`/g) || []).length
  if (codeTickCount % 2 !== 0) {
    const idx = out.lastIndexOf('`')
    if (idx !== -1) out = out.slice(0, idx) + out.slice(idx + 1)
  }

  return out
}

function formatAiChatStamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface Category {
  id: string
  name: string
  displayOrder: number
}

const WS_URL =
  (import.meta.env.VITE_WS_URL as string) ||
  API_BASE_URL ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : (typeof window !== 'undefined' ? window.location.origin : ''))

/** Press feedback for primary dashboard controls (tabs, bell, order actions). */
const BTN_PRESS =
  'transition-transform duration-150 ease-out motion-safe:active:scale-[0.96] active:brightness-[0.96]'

function BusinessDashboard(): JSX.Element {
  const { businessId } = useParams<{ businessId: string }>()
  const navigate = useNavigate()

  const [isPhone, setIsPhone] = useState<boolean>(false)

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
  const [aiSignals, setAiSignals] = useState<AiSignals | null>(null)
  const [aiSignalsLoading, setAiSignalsLoading] = useState(false)
  const [aiBriefing, setAiBriefing] = useState<{
    date: string
    totalOrders: number
    totalRevenue: number
    avgOrderValue: number
    topItem: { name: string; count: number } | null
    busiestHourUtc: { hour: number; orderCount: number } | null
  } | null>(null)
  const [aiSlowHours, setAiSlowHours] = useState<{ periodDays: number; slowHours: { weekday: number; hour: number; orderCount: number; revenue: number }[] } | null>(null)
  const [qrCode, setQrCode] = useState<QRCodeData | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrError, setQrError] = useState<string | null>(null)
  const [editingPresetId, setEditingPresetId] = useState<string | null>(null)
  const [menu, setMenu] = useState<MenuCategory[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeTab, setActiveTab] = useState<TabType>('orders')
  const [loading, setLoading] = useState<boolean>(true)
  const [showItemForm, setShowItemForm] = useState<boolean>(false)
  const [showCategoryForm, setShowCategoryForm] = useState<boolean>(false)
  const [draggingCategoryId, setDraggingCategoryId] = useState<string | null>(null)
  const [pendingCategoryDelete, setPendingCategoryDelete] = useState<{ id: string; name: string } | null>(null)
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null)
  const [itemForm, setItemForm] = useState(createEmptyItemForm)
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    displayOrder: 0
  })
  const [aiInsightLoading, setAiInsightLoading] = useState(false)
  const [aiInsight, setAiInsight] = useState<string | null>(null)
  const [aiInsightTyped, setAiInsightTyped] = useState('')
  const [aiInsightTypingDone, setAiInsightTypingDone] = useState(false)
  const [aiChats, setAiChats] = useState<AiChat[]>([])
  const [showAiChats, setShowAiChats] = useState(false)
  const [activeAiChatId, setActiveAiChatId] = useState<string | null>(null)
  const [aiCustomQuery, setAiCustomQuery] = useState('')
  const [descPolishLoading, setDescPolishLoading] = useState(false)
  const [aiGuestDraft, setAiGuestDraft] = useState<AiGuestStorefrontConfig>({ ...DEFAULT_AI_GUEST })
  const [aiGuestSaving, setAiGuestSaving] = useState(false)
  const [businessGroupDraft, setBusinessGroupDraft] = useState('')
  const [businessGroupSaving, setBusinessGroupSaving] = useState(false)
  const [dishEnrichLoading, setDishEnrichLoading] = useState(false)
  const [imageUploading, setImageUploading] = useState(false)
  const [imageUploadError, setImageUploadError] = useState<string | null>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const [showLogoModal, setShowLogoModal] = useState(false)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [logoMenuOpen, setLogoMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [ordersTimePreset, setOrdersTimePreset] = useState<OrdersTimePreset>('all')
  const [ordersCustomFrom, setOrdersCustomFrom] = useState('')
  const [ordersCustomTo, setOrdersCustomTo] = useState('')
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false)
  const [changePasswordCurrent, setChangePasswordCurrent] = useState('')
  const [changePasswordNew, setChangePasswordNew] = useState('')
  const [changePasswordConfirm, setChangePasswordConfirm] = useState('')
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null)
  const [changePasswordLoading, setChangePasswordLoading] = useState(false)
  const [editingBusinessName, setEditingBusinessName] = useState(false)
  const [businessNameDraft, setBusinessNameDraft] = useState('')
  const [businessNameSaving, setBusinessNameSaving] = useState(false)
  const [businessModeSaving, setBusinessModeSaving] = useState(false)
  const logoMenuRef = useRef<HTMLDivElement>(null)
  const profileMenuRef = useRef<HTMLDivElement>(null)
  const notificationsMenuRef = useRef<HTMLDivElement>(null)

  const [tapOptimisticOn, setTapOptimisticOn] = useState(false)
  const [tapCode, setTapCode] = useState<string | null>(null)
  const [tapExpiresAt, setTapExpiresAt] = useState<string | null>(null)
  const [tapSending, setTapSending] = useState(false)
  const [tapWaitingOrderId, setTapWaitingOrderId] = useState<string | null>(null)
  const [tapSelections, setTapSelections] = useState<Record<string, number>>({})
  const [tapRoomLoading, setTapRoomLoading] = useState(false)
  const [tapRoomError, setTapRoomError] = useState<string | null>(null)
  const tapSwitchOn = tapRoomLoading ? tapOptimisticOn : !!tapCode
  const tapWaitingOrderIdRef = useRef<string | null>(null)
  useEffect(() => { tapWaitingOrderIdRef.current = tapWaitingOrderId }, [tapWaitingOrderId])

  const isTicketing = business?.businessMode === 'ticketing'
  const canCustomizeStorefront = isGrowthPlusPlan(business?.plan)
  const ticketDraftPrice = Number(itemForm.price)
  const ticketFeePreview =
    isTicketing && itemForm.pricingType !== 'free' && Number.isFinite(ticketDraftPrice) && ticketDraftPrice > 0
      ? computeTransactionFeeNaira(ticketDraftPrice, 'ticketing')
      : 0
  const ticketNetPreview =
    isTicketing && itemForm.pricingType !== 'free' && Number.isFinite(ticketDraftPrice) && ticketDraftPrice > 0
      ? computeNetAfterFeeNaira(ticketDraftPrice, 'ticketing')
      : 0

  const patchBusinessMode = async (mode: BusinessMode): Promise<void> => {
    if (!businessId || businessModeSaving) return
    if (business?.businessMode === mode) return
    setBusinessModeSaving(true)
    try {
      const { data } = await axios.patch<{ businessMode?: BusinessMode }>(
        `/api/business/${businessId}`,
        { businessMode: mode },
        { headers: getAuthHeaders() }
      )
      const next = data?.businessMode ?? mode
      setBusiness((prev) => (prev ? { ...prev, businessMode: next } : null))
      fetchMenu()
    } catch (err) {
      console.error(err)
      alert(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Could not update storefront type. Try again.')
          : 'Could not update storefront type. Try again.'
      )
    } finally {
      setBusinessModeSaving(false)
    }
  }

  useEffect(() => {
    setAiGuestDraft({ ...DEFAULT_AI_GUEST, ...mergeStorefrontConfig(business?.storefrontConfig ?? null).aiGuest })
  }, [business?.storefrontConfig])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(max-width: 767px)')
    const onChange = () => setIsPhone(!!mq.matches)
    onChange()
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onChange)
    else mq.addListener(onChange)
    return () => {
      if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onChange)
      else mq.removeListener(onChange)
    }
  }, [])

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
        setBusinessGroupDraft(res.data.businessGroupId || '')
        if (res.data.plan && res.data.plan !== 'free' && res.data.plan !== 'starter') fetchAnalytics()
        else setLoading(false)
        if (res.data.plan === 'free' || res.data.plan === 'starter') setActiveTab(t => (t === 'analytics' ? 'orders' : t))
        const proOrAbove = isAiInsightsTier(res.data.plan)
        if (!proOrAbove) setActiveTab(t => (t === 'ai' ? 'orders' : t))
      })
      .catch(err => { console.error(err); setLoading(false) })

    loadQrCode()

    axios.get<{ code: string | null; expiresAt?: string }>(apiUrl(`/api/tap/room?businessId=${businessId}`), { headers: getAuthHeaders() })
      .then(res => { if (res.data?.code) { setTapCode(res.data.code); setTapOptimisticOn(true); setTapExpiresAt(res.data.expiresAt || null) } })
      .catch(() => {})

    // Fetch orders
    fetchOrders()

    // Fetch reservations (table booking requests)
    fetchReservations()

    // Fetch reviews (post-payment ratings)
    fetchReviews()

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

  // Load/save past AI chats per business (so refresh doesn't lose them)
  useEffect(() => {
    if (!businessId) return
    const key = `${AI_CHATS_STORAGE_PREFIX}${businessId}`
    try {
      const raw = localStorage.getItem(key)
      if (!raw) {
        setAiChats([])
        return
      }
      const parsed = JSON.parse(raw) as AiChat[]
      setAiChats(Array.isArray(parsed) ? parsed : [])
    } catch {
      setAiChats([])
    }
  }, [businessId])

  useEffect(() => {
    if (!businessId) return
    const key = `${AI_CHATS_STORAGE_PREFIX}${businessId}`
    try {
      localStorage.setItem(key, JSON.stringify(aiChats))
    } catch {
      // Ignore storage failures (private mode, quota, etc.)
    }
  }, [aiChats, businessId])

  async function requestAiInsight(nextType: AiInsightType, opts?: { query?: string; saveToHistory?: boolean }) {
    if (!businessId) return
    const saveToHistory = opts?.saveToHistory !== false

    setAiInsight(null)
    setAiInsightLoading(true)

    try {
      const payload: { businessId: string; type: AiInsightType; query?: string } = {
        businessId,
        type: nextType
      }
      if (nextType === 'custom') payload.query = String(opts?.query || '').trim()

      const { data } = await axios.post<{ insight: string }>('/api/ai/insights', payload, { headers: getAuthHeaders() })

      const insightText = data.insight || 'No response.'
      setAiInsight(insightText)

      if (saveToHistory) {
        const chat: AiChat = {
          id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
          businessId,
          type: nextType,
          query: nextType === 'custom' ? payload.query : undefined,
          insight: insightText,
          createdAt: new Date().toISOString()
        }
        setAiChats((prev) => [chat, ...prev].slice(0, 50))
        setActiveAiChatId(chat.id)
      }
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { error?: string }; status?: number } }
      const msg = formatUserFacingError(ax.response?.data, 'Request failed.')
      if (ax.response?.status === 403) setAiInsight(null)
      else setAiInsight(msg)
    } finally {
      setAiInsightLoading(false)
    }
  }

  // Typewriter animation for AI responses
  useEffect(() => {
    if (aiInsightLoading) return
    if (aiInsight == null) {
      setAiInsightTyped('')
      setAiInsightTypingDone(false)
      return
    }

    const full = String(aiInsight)
    setAiInsightTyped('')
    setAiInsightTypingDone(false)

    let i = 0
    const stepMs = 20 // keep typing smooth while avoiding heavy re-renders
    const id = window.setInterval(() => {
      i += 1
      setAiInsightTyped(full.slice(0, i))
      if (i >= full.length) {
        window.clearInterval(id)
        setAiInsightTypingDone(true)
      }
    }, stepMs)

    return () => window.clearInterval(id)
  }, [aiInsight, aiInsightLoading])

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
    const proOrAbove = isAiInsightsTier(business?.plan)
    if (!proOrAbove) return
    axios.get<CustomerIntelligence>(`/api/analytics/customer-intelligence/${businessId}?days=30`, { headers: getAuthHeaders() })
      .then(res => setCustomerIntelligence(res.data))
      .catch(() => setCustomerIntelligence(null))
  }, [activeTab, businessId, business?.plan])

  useEffect(() => {
    if (activeTab !== 'analytics' || !businessId) return
    const proOrAbove = isAiInsightsTier(business?.plan)
    if (!proOrAbove) return
    setMarketInsightsLoading(true)
    axios.get<MarketInsights>('/api/network/market-insights?days=30', { headers: getAuthHeaders() })
      .then(res => { setMarketInsights(res.data); setMarketInsightsLoading(false) })
      .catch(() => { setMarketInsights(null); setMarketInsightsLoading(false) })
  }, [activeTab, businessId, business?.plan])

  useEffect(() => {
    if (activeTab !== 'analytics' || !businessId) return
    if (!isOpsAiTier(business?.plan)) {
      setAiBriefing(null)
      setAiSlowHours(null)
      return
    }
    const headers = getAuthHeaders()
    axios.get(`/api/ai/briefing?businessId=${businessId}`, { headers })
      .then(res => setAiBriefing(res.data))
      .catch(() => setAiBriefing(null))
    axios.get(`/api/ai/slow-hours?businessId=${businessId}&days=60`, { headers })
      .then(res => setAiSlowHours(res.data))
      .catch(() => setAiSlowHours(null))
  }, [activeTab, businessId, business?.plan])

  // Embedded Zuri Assist signals (orders/menu/analytics). Scale+ and legacy tiers.
  useEffect(() => {
    if (!businessId) return
    const zuriAi = isOpsAiTier(business?.plan)
    if (!zuriAi) {
      setAiSignals(null)
      return
    }

    let cancelled = false
    const headers = getAuthHeaders()

    const load = async () => {
      setAiSignalsLoading(true)
      try {
        const res = await axios.get<AiSignals>(`/api/ai/signals?businessId=${businessId}`, { headers })
        if (!cancelled) setAiSignals(res.data)
      } catch {
        if (!cancelled) setAiSignals(null)
      } finally {
        if (!cancelled) setAiSignalsLoading(false)
      }
    }

    load()
    const interval = window.setInterval(load, 60_000)
    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [businessId, business?.plan])

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

      const salesBody = sales.data
      setAnalytics(
        salesBody && typeof salesBody === 'object' && !Array.isArray(salesBody)
          ? salesBody
          : null
      )
      setSalesData(Array.isArray(salesByDate.data) ? salesByDate.data : [])
      setPopularItems(Array.isArray(popular.data) ? popular.data : [])
      setPeakHours(Array.isArray(hours.data) ? hours.data : [])
      setProfitMargins(Array.isArray(margins.data) ? margins.data : [])
      setLoading(false)
    } catch (err) {
      console.error('Failed to fetch analytics:', err)
      setLoading(false)
    }
  }

  const saveBusinessGroup = async (): Promise<void> => {
    if (!businessId) return
    setBusinessGroupSaving(true)
    try {
      const { data } = await axios.patch<{ businessGroupId?: string | null }>(
        `/api/business/${businessId}`,
        { businessGroupId: businessGroupDraft.trim() || null },
        { headers: getAuthHeaders() }
      )
      setBusiness((prev) => (prev ? { ...prev, businessGroupId: data?.businessGroupId ?? null } : prev))
    } catch (err) {
      alert(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Could not save venue group.')
          : 'Could not save venue group.'
      )
    } finally {
      setBusinessGroupSaving(false)
    }
  }

  const enrichMenuItemDish = async (): Promise<void> => {
    if (!editingItem) return
    setDishEnrichLoading(true)
    try {
      const { data } = await axios.post<{
        ingredients?: string[]
        dishTags?: Record<string, string[]>
        canonicalDishId?: string | null
      }>(`/api/menu/item/${editingItem.id}/enrich-dish`, {}, { headers: getAuthHeaders() })
      setItemForm((f) => ({
        ...f,
        canonicalDishId: data.canonicalDishId ?? f.canonicalDishId,
        ingredients: Array.isArray(data.ingredients) ? data.ingredients.join(', ') : f.ingredients
      }))
    } catch (err) {
      alert(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Could not enrich dish metadata.')
          : 'Could not enrich dish metadata.'
      )
    } finally {
      setDishEnrichLoading(false)
    }
  }

  const saveAiGuestSettings = async (): Promise<void> => {
    if (!businessId) return
    setAiGuestSaving(true)
    try {
      const { data } = await axios.patch<{ storefrontConfig?: Business['storefrontConfig'] }>(
        apiUrl(`/api/business/${businessId}/ai-menu-settings`),
        { aiGuest: aiGuestDraft },
        { headers: getAuthHeaders() }
      )
      if (data?.storefrontConfig) {
        setBusiness((prev) => (prev ? { ...prev, storefrontConfig: data.storefrontConfig ?? null } : null))
      }
    } catch (err) {
      alert(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Could not save guest AI settings.')
          : 'Could not save guest AI settings.'
      )
    } finally {
      setAiGuestSaving(false)
    }
  }

  const saveItemMenuTranslations = async (itemId: string): Promise<void> => {
    if (!businessId || !isGuestAiMenuTier(business?.plan) || isTicketing) return
    const row: Partial<Record<'ha' | 'yo' | 'ig', string>> = {}
    const ha = itemForm.nameTransHa.trim()
    const yo = itemForm.nameTransYo.trim()
    const ig = itemForm.nameTransIg.trim()
    if (ha) row.ha = ha
    if (yo) row.yo = yo
    if (ig) row.ig = ig
    try {
      const { data } = await axios.patch<{ storefrontDetails?: Business['storefrontDetails'] }>(
        apiUrl(`/api/business/${businessId}/ai-menu-settings`),
        { menuTranslations: { [itemId]: row } },
        { headers: getAuthHeaders() }
      )
      if (data?.storefrontDetails) {
        setBusiness((prev) =>
          prev
            ? {
                ...prev,
                storefrontDetails: {
                  ...(prev.storefrontDetails || { name: '', tagline: '', cuisineTags: [] }),
                  ...data.storefrontDetails
                }
              }
            : null
        )
      }
    } catch (err) {
      console.error(err)
      alert(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Item saved, but guest-language names failed to save.')
          : 'Item saved, but guest-language names failed to save.'
      )
    }
  }

  const fetchMenu = useCallback((): void => {
    if (!businessId) return
    const presetQ = editingPresetId ? `?presetId=${encodeURIComponent(editingPresetId)}` : ''
    const headers = getAuthHeaders()
    Promise.all([
      axios.get<MenuCategory[]>(`/api/menu/business/${businessId}${presetQ}`, { headers }),
      axios.get<Category[]>(`/api/menu/categories/${businessId}${presetQ}`, { headers })
    ])
      .then(([menuRes, categoriesRes]) => {
        setMenu(menuRes.data)
        setCategories(categoriesRes.data)
      })
      .catch(err => console.error('Failed to fetch menu:', err))
  }, [businessId, editingPresetId])

  const loadQrCode = useCallback((): void => {
    if (!businessId) return
    setQrLoading(true)
    setQrError(null)
    const baseUrl = typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''
    axios
      .get<QRCodeData>(`/api/qr/generate/${businessId}${baseUrl ? `?baseUrl=${baseUrl}` : ''}`, {
        timeout: 20000,
        zuriSkipRetry: true
      } as import('axios').AxiosRequestConfig & { zuriSkipRetry?: boolean })
      .then((res) => setQrCode(res.data))
      .catch((err) => {
        console.error(err)
        setQrCode(null)
        setQrError(
          axios.isAxiosError(err)
            ? formatUserFacingError(err.response?.data, 'Could not generate QR code. Check that the API is running.')
            : 'Could not generate QR code.'
        )
      })
      .finally(() => setQrLoading(false))
  }, [businessId])

  useEffect(() => {
    if (!businessId) return
    fetchMenu()
  }, [businessId, editingPresetId, fetchMenu])

  const handleCreateItem = (e: React.FormEvent): void => {
    e.preventDefault()
    if (!businessId) return

    const itemData = {
      businessId,
      presetId: editingPresetId || undefined,
      categoryId: itemForm.categoryId || null,
      name: itemForm.name,
      description: itemForm.description,
      price: parseFloat(itemForm.price),
      cost: parseFloat(itemForm.cost) || 0,
      estimatedPrepTime: (() => {
        const n = parseInt(itemForm.estimatedPrepTime, 10)
        return Number.isFinite(n) ? n : 15
      })(),
      imageUrl: itemForm.imageUrl || null,
      available: itemForm.available,
      stockOnHand: itemForm.stockOnHand === '' ? null : parseInt(itemForm.stockOnHand, 10),
      lowStockThreshold: itemForm.lowStockThreshold === '' ? null : parseInt(itemForm.lowStockThreshold, 10),
      maxPerUser: itemForm.maxPerUser === '' ? null : parseInt(itemForm.maxPerUser, 10),
      groupSize: itemForm.groupSize === '' ? null : parseInt(itemForm.groupSize, 10),
      minPerOrder: itemForm.minPerOrder === '' ? null : parseInt(itemForm.minPerOrder, 10),
      pricingType: itemForm.pricingType || 'paid',
      perks: itemForm.perks.filter(p => p.trim()),
      canonicalDishId: itemForm.canonicalDishId.trim() || null,
      ingredients: itemForm.ingredients
    }

    const resetForm = () => {
      setItemForm(createEmptyItemForm())
      setImageUploadError(null)
      if (imageInputRef.current) imageInputRef.current.value = ''
    }

    if (editingItem) {
      axios.put(`/api/menu/item/${editingItem.id}`, {
        ...itemData,
        categoryId: itemForm.categoryId || null
      }, { headers: getAuthHeaders() })
        .then(async () => {
          await saveItemMenuTranslations(editingItem.id)
          fetchMenu()
          setShowItemForm(false)
          setEditingItem(null)
          resetForm()
        })
        .catch(err => {
          alert('Failed to update menu item')
          console.error(err)
        })
    } else {
      axios.post('/api/menu/item', itemData, { headers: getAuthHeaders() })
        .then(async (res) => {
          const newId = (res.data as { id?: string }).id
          if (newId) await saveItemMenuTranslations(newId)
          fetchMenu()
          setShowItemForm(false)
          resetForm()
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
    let categoryId = ''
    for (const category of menu) {
      if (category.items.some(i => i.id === item.id)) {
        categoryId = category.id
        break
      }
    }
    const mt = business?.storefrontDetails?.menuTranslations?.[item.id]
    setItemForm({
      name: item.name,
      description: item.description || '',
      price: item.price.toString(),
      cost: (item.cost || 0).toString(),
      estimatedPrepTime: item.estimatedPrepTime != null ? item.estimatedPrepTime.toString() : '15',
      categoryId: categoryId,
      imageUrl: item.imageUrl || '',
      available: item.available,
      stockOnHand: (item as unknown as { stockOnHand?: number | null }).stockOnHand != null ? String((item as unknown as { stockOnHand?: number }).stockOnHand) : '',
      lowStockThreshold: (item as unknown as { lowStockThreshold?: number | null }).lowStockThreshold != null ? String((item as unknown as { lowStockThreshold?: number }).lowStockThreshold) : '',
      maxPerUser: item.maxPerUser != null ? String(item.maxPerUser) : '',
      groupSize: item.groupSize != null ? String(item.groupSize) : '',
      minPerOrder: item.minPerOrder != null ? String(item.minPerOrder) : '',
      pricingType: item.pricingType || 'paid',
      perks: Array.isArray(item.perks) ? item.perks : [],
      nameTransHa: mt?.ha ?? '',
      nameTransYo: mt?.yo ?? '',
      nameTransIg: mt?.ig ?? '',
      canonicalDishId: item.canonicalDishId ?? '',
      ingredients: Array.isArray(item.ingredients) ? item.ingredients.join(', ') : ''
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

  const ordersInTimeRange = useMemo(() => {
    return orders.filter((o) =>
      isOrderInDashboardRange(orderCreatedRawForFilter(o), ordersTimePreset, ordersCustomFrom, ordersCustomTo)
    )
  }, [orders, ordersTimePreset, ordersCustomFrom, ordersCustomTo])

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

  if (isPhone) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4 font-normal">
        <div className="bg-white rounded-2xl border border-zuri-orange/20 bg-zuri-light/50 p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-zuri-black mb-2">Use a tablet or laptop</h1>
          <p className="text-zuri-black/60 text-sm mb-6">
            The business dashboard isn’t supported on phones yet. Please open it on a tablet or laptop.
          </p>
          <div className="flex gap-3 justify-center">
            <a
              href="/business/login"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium border-2 border-zuri-orange text-zuri-orange bg-transparent hover:border-zuri-orange-dark hover:text-zuri-orange-dark transition-colors"
            >
              Log in
            </a>
            <a
              href="/"
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg text-sm font-medium bg-zuri-orange text-white hover:bg-zuri-orange-dark transition"
            >
              Home
            </a>
          </div>
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
                  className={`flex items-center justify-center h-12 w-12 rounded-xl border border-gray-100 overflow-hidden bg-gray-50 hover:bg-gray-100 transition focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 ${BTN_PRESS}`}
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
                        href="/pricing"
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
                <div className="flex items-center gap-3">
                  {!editingBusinessName ? (
                    <button
                      type="button"
                      onClick={() => {
                        setBusinessNameDraft(business?.name || '')
                        setEditingBusinessName(true)
                      }}
                      className="text-xl font-bold text-zuri-black hover:underline"
                      aria-label="Edit business name"
                    >
                      {business?.name || 'Dashboard'}
                    </button>
                  ) : (
                    <input
                      value={businessNameDraft}
                      onChange={(e) => setBusinessNameDraft(e.target.value)}
                      onBlur={async () => {
                        const currentName = business?.name || ''
                        const next = businessNameDraft.trim()
                        const prevDraft = currentName
                        setEditingBusinessName(false)
                        if (!businessId || next === prevDraft) return
                        setBusinessNameSaving(true)
                        try {
                          const { data } = await axios.patch(`/api/business/${businessId}`, { name: next }, { headers: getAuthHeaders() })
                          setBusiness((prev) => (prev ? { ...prev, name: data?.name || next } : prev))
                        } catch (err) {
                          console.error(err)
                          setBusinessNameDraft(prevDraft)
                        } finally {
                          setBusinessNameSaving(false)
                        }
                      }}
                      autoFocus
                      className="text-xl font-bold text-zuri-black bg-white/90 border border-zuri-orange/30 rounded-lg px-3 py-1 focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 w-full max-w-[420px]"
                      disabled={businessNameSaving}
                    />
                  )}
                </div>
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
                  className={`relative flex items-center justify-center w-10 h-10 rounded-full bg-white border border-gray-200 hover:bg-gray-50 transition focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 ${BTN_PRESS}`}
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
                                      className={`px-2.5 py-1 bg-zuri-orange text-white rounded-lg text-[11px] font-semibold hover:bg-zuri-orange-dark transition ${BTN_PRESS}`}
                                    >
                                      Start
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                      className={`px-2.5 py-1 border border-zuri-orange text-zuri-orange rounded-lg text-[11px] font-semibold hover:bg-zuri-orange hover:text-white transition ${BTN_PRESS}`}
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
                                      className={`px-2.5 py-1 bg-zuri-orange text-white rounded-lg text-[11px] font-semibold hover:bg-zuri-orange-dark transition ${BTN_PRESS}`}
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
                                      className={`px-2.5 py-1 bg-zuri-orange text-white rounded-lg text-[11px] font-semibold hover:bg-zuri-orange-dark transition ${BTN_PRESS}`}
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => updateReservationStatus(reservation.id, 'cancelled')}
                                      className={`px-2.5 py-1 border border-zuri-orange text-zuri-orange rounded-lg text-[11px] font-semibold hover:bg-zuri-orange hover:text-white transition ${BTN_PRESS}`}
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
                  className={`flex items-center justify-center w-10 h-10 rounded-full bg-zuri-black text-white font-semibold text-sm border border-gray-200 hover:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-zuri-orange ${BTN_PRESS}`}
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
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Account</p>
                      <p className="text-xs text-gray-600 mb-2">Storefront for your customers</p>
                      <div className="flex rounded-xl border border-gray-200 overflow-hidden">
                        <button
                          type="button"
                          disabled={businessModeSaving}
                          onClick={() => {
                            void patchBusinessMode('menu')
                          }}
                          className={`flex-1 py-2 text-xs font-semibold transition ${
                            !isTicketing ? 'bg-zuri-orange text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                          } disabled:opacity-60`}
                        >
                          Menu
                        </button>
                        <button
                          type="button"
                          disabled={businessModeSaving}
                          onClick={() => {
                            void patchBusinessMode('ticketing')
                          }}
                          className={`flex-1 py-2 text-xs font-semibold transition ${
                            isTicketing ? 'bg-zuri-orange text-white' : 'bg-white text-gray-700 hover:bg-gray-50'
                          } disabled:opacity-60`}
                        >
                          Tickets
                        </button>
                      </div>
                      {businessModeSaving && <p className="text-[11px] text-gray-400 mt-1.5">Saving…</p>}
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

      {(isGrowthPlusPlan(business?.plan)) && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-3 flex flex-col items-center gap-2">
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-zuri-black">Zuri Tap</span>
              <button
                type="button"
                role="switch"
                aria-checked={tapSwitchOn}
                aria-busy={tapRoomLoading}
                aria-label={tapCode ? 'Turn Zuri Tap off' : 'Turn Zuri Tap on'}
                onClick={async () => {
                  if (!businessId) return
                  const nextOn = !tapCode
                  setTapOptimisticOn(nextOn)
                  setTapRoomError(null)
                  setTapRoomLoading(true)
                  try {
                    if (tapCode) {
                      await axios.post(apiUrl('/api/tap/room/off'), { businessId }, { headers: getAuthHeaders() })
                      setTapCode(null)
                      setTapExpiresAt(null)
                      setTapOptimisticOn(false)
                      setTapWaitingOrderId(null)
                    } else {
                      const { data } = await axios.post<{ code: string; expiresAt: string }>(apiUrl('/api/tap/room/on'), { businessId }, { headers: getAuthHeaders() })
                      setTapCode(data.code)
                      setTapExpiresAt(data.expiresAt)
                      setTapOptimisticOn(true)
                      setTapSelections({})
                    }
                  } catch (e) {
                    console.error(e)
                    const msg = axios.isAxiosError(e)
                      ? formatUserFacingError(e.response?.data, 'Could not update Zuri Tap. Please try again.')
                      : 'Could not update Zuri Tap. Please try again.'
                    setTapRoomError(msg)
                  } finally {
                    setTapRoomLoading(false)
                  }
                }}
                disabled={tapRoomLoading}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-zuri-orange focus:ring-offset-2 active:scale-[0.96] disabled:cursor-wait disabled:opacity-80 ${
                  tapSwitchOn ? 'bg-zuri-orange shadow-[0_0_0_3px_rgba(234,88,12,0.22)]' : 'bg-gray-200'
                } ${tapRoomLoading ? 'ring-2 ring-zuri-orange/35 ring-offset-2' : ''}`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-350 ease-[cubic-bezier(0.34,1.56,0.64,1)] ${
                    tapSwitchOn ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
                {tapRoomLoading && (
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                    <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin opacity-90" />
                  </span>
                )}
              </button>
            </div>
            {tapRoomError && (
              <p className="text-xs text-red-600 max-w-md text-center" role="alert">
                {tapRoomError}
              </p>
            )}
            <p className={`text-xs ${tapRoomLoading ? 'text-zuri-orange font-medium animate-pulse' : 'text-gray-500'}`}>
              {tapRoomLoading
                ? (tapSwitchOn ? 'Turning Zuri Tap on…' : 'Turning Zuri Tap off…')
                : 'Turn Zuri Tap on to send Tap requests from your menu to any customers who have joined this room.'}
            </p>
          </div>
        </div>
      )}
      {(business?.plan === 'free' || business?.plan === 'starter') && (
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-6xl mx-auto px-4 py-3 flex justify-center">
            <a href="/pricing" className="text-xs sm:text-sm text-gray-500 hover:text-zuri-orange transition">
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
                <p className="text-sm font-semibold text-gray-300 mb-2">{isTicketing ? 'Select ticket types' : 'Select menu items'}</p>
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
                    <p className="text-sm text-gray-400">
                      {isTicketing ? 'No ticket types yet. Add them in the Tickets tab.' : 'No menu items. Add items in the Menu tab.'}
                    </p>
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
                            const { data } = await axios.post<{ orderId: string }>(apiUrl('/api/tap/send'), { businessId, code: tapCode, items }, { headers: getAuthHeaders() })
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
                      if (logoInputRef.current) logoInputRef.current.value = ''
                      setShowLogoModal(false)
                    } catch (err: unknown) {
                      setLogoUploadError(axios.isAxiosError(err) ? formatUserFacingError(err.response?.data, 'Upload failed') : 'Upload failed')
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
              {business?.logoUrl && (
                <div className="pt-2">
                  <p className="text-xs text-gray-500 mb-1">Current logo</p>
                  <img
                    src={business.logoUrl}
                    alt=""
                    className="h-20 w-20 rounded-lg border object-cover"
                    onError={() => setLogoUploadError('Image failed to load')}
                  />
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
                  const msg = axios.isAxiosError(err)
                    ? formatUserFacingError(err.response?.data, 'Failed to change password. Try again.')
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
              className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition ${BTN_PRESS} ${
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
                className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition ${BTN_PRESS} ${
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
              className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition ${BTN_PRESS} ${
                activeTab === 'menu'
                  ? 'text-zuri-orange border-b-2 border-zuri-orange bg-zuri-orange/10'
                  : 'text-gray-600 hover:text-zuri-black'
              }`}
            >
              {isTicketing ? 'Tickets' : 'Menu'}
            </button>
            <button
              onClick={() => setActiveTab('qr')}
              className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition ${BTN_PRESS} ${
                activeTab === 'qr'
                  ? 'text-zuri-orange border-b-2 border-zuri-orange bg-zuri-orange/10'
                  : 'text-gray-600 hover:text-zuri-black'
              }`}
            >
              QR Code
            </button>
            {isAiInsightsTier(business?.plan) && (
              <button
                onClick={() => setActiveTab('ai')}
                className={`flex-1 min-w-0 px-4 py-3 text-sm font-semibold transition ${BTN_PRESS} ${
                  activeTab === 'ai'
                    ? 'text-zuri-orange border-b-2 border-zuri-orange bg-zuri-orange/10'
                    : 'text-gray-600 hover:text-zuri-black'
                }`}
              >
                Zuri Assist
              </button>
            )}
          </div>

          <div className="p-6">
            {/* Orders Tab */}
            {activeTab === 'orders' && (
              <div className="space-y-8">
                <h2 className="text-lg font-bold text-zuri-black mb-4">Recent orders</h2>
                <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ['all', 'All'],
                        ['today', 'Today'],
                        ['week', 'This week'],
                        ['month', 'This month'],
                        ['year', 'This year'],
                        ['custom', 'Custom range']
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setOrdersTimePreset(key)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold border transition ${BTN_PRESS} ${
                          ordersTimePreset === key
                            ? 'border-zuri-orange bg-zuri-orange text-white'
                            : 'border-gray-200 bg-white text-gray-700 hover:border-zuri-orange/50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {ordersTimePreset === 'custom' ? (
                    <div className="flex flex-col gap-3 w-full sm:w-auto sm:flex-row sm:flex-wrap sm:items-end rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                      <div className="min-w-[9.5rem] flex-1 sm:flex-initial">
                        <label htmlFor="orders-range-from" className="block text-xs font-semibold text-gray-600 mb-1.5">
                          From
                        </label>
                        <ZuriDatePicker
                          id="orders-range-from"
                          value={ordersCustomFrom}
                          onChange={(v) => {
                            setOrdersCustomFrom(v)
                            if (ordersCustomTo && v && ordersCustomTo < v) setOrdersCustomTo(v)
                          }}
                          placeholder="Start date"
                          maxDate={ordersCustomTo || undefined}
                        />
                      </div>
                      <div className="min-w-[9.5rem] flex-1 sm:flex-initial">
                        <label htmlFor="orders-range-to" className="block text-xs font-semibold text-gray-600 mb-1.5">
                          To
                        </label>
                        <ZuriDatePicker
                          id="orders-range-to"
                          value={ordersCustomTo}
                          onChange={(v) => {
                            setOrdersCustomTo(v)
                            if (ordersCustomFrom && v && v < ordersCustomFrom) setOrdersCustomFrom(v)
                          }}
                          placeholder="End date"
                          minDate={ordersCustomFrom || undefined}
                        />
                      </div>
                    </div>
                  ) : null}
                </div>
                {isOpsAiTier(business?.plan) && (
                  <div className="rounded-2xl border border-zuri-orange/20 bg-white/70 p-5">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <div className="text-sm font-semibold text-zuri-black">Live operations</div>
                      <div className="text-xs text-zuri-black/50">
                        {aiSignalsLoading ? 'Updating…' : aiSignals?.generatedAt ? `Updated ${new Date(aiSignals.generatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="rounded-xl border border-zuri-orange/15 bg-zuri-orange/5 p-4">
                        <div className="text-xs text-zuri-black/60 mb-2">Rush hour indicator</div>
                        <div className="h-2 rounded-full bg-zuri-orange/15 overflow-hidden">
                          <div
                            className="h-full bg-zuri-orange"
                            style={{
                              width: `${Math.round(Math.min(1, (aiSignals?.rush?.rushRatio || 0) / 2) * 100)}%`
                            }}
                          />
                        </div>
                        <div className="text-xs text-zuri-black/70 mt-2">
                          {aiSignals?.rush
                            ? `${aiSignals.rush.last30mOrders} orders in last 30 min • ${aiSignals.rush.rushRatio >= 1.2 ? 'Busier than usual' : aiSignals.rush.rushRatio > 0 ? 'Normal pace' : 'Quiet'}`
                            : '—'}
                        </div>
                      </div>

                      <div className="rounded-xl border border-zuri-orange/15 bg-white p-4">
                        <div className="text-xs text-zuri-black/60 mb-2">Anomaly highlight</div>
                        <div className="text-sm text-zuri-black">
                          {aiSignals?.anomaly
                            ? aiSignals.anomaly.deltaPct < -35
                              ? `Revenue is ${Math.abs(aiSignals.anomaly.deltaPct)}% below your typical pace for this time.`
                              : aiSignals.anomaly.deltaPct > 35
                                ? `Revenue is +${aiSignals.anomaly.deltaPct}% above your typical pace for this time.`
                                : 'No major anomaly detected right now.'
                            : 'Not enough history yet.'}
                        </div>
                      </div>

                      <div className="rounded-xl border border-zuri-orange/15 bg-white p-4">
                        <div className="text-xs text-zuri-black/60 mb-2">Today’s top items</div>
                        {aiSignals?.todayTopItems?.length ? (
                          <ul className="space-y-1 text-sm text-zuri-black">
                            {aiSignals.todayTopItems.slice(0, 4).map((it) => (
                              <li key={it.id} className="flex items-center justify-between gap-2">
                                <span className="truncate">{it.name}</span>
                                <span className="text-xs text-zuri-black/60 whitespace-nowrap">{it.orderCount}x</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <div className="text-sm text-zuri-black/60">No sales yet today.</div>
                        )}
                      </div>
                    </div>

                    {aiSignals?.lowStock?.length ? (
                      <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                        <div className="text-xs font-semibold text-red-800 mb-2">Low stock flags</div>
                        <div className="flex flex-wrap gap-2">
                          {aiSignals.lowStock.slice(0, 8).map((x) => (
                            <span key={x.id} className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs border border-red-200 text-red-800">
                              {x.name} • {x.stockOnHand}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
                {orders.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-12">No orders yet</p>
                ) : ordersInTimeRange.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-12">No orders in this time range.</p>
                ) : (
                  <div className="space-y-4">
                    {ordersInTimeRange.map(order => (
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
                                {isOpsAiTier(business?.plan) &&
                                  aiSignals?.lowStock?.some((x) => x.name === (item.menuItemName || '')) && (
                                    <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                      Low stock
                                    </span>
                                  )}
                              </p>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {order.status === 'pending' && (
                            <>
                              <button
                                onClick={() => updateOrderStatus(order.id, 'preparing')}
                                className={`px-3 py-1.5 bg-zuri-orange text-white rounded-xl text-xs font-semibold hover:bg-zuri-orange-dark transition ${BTN_PRESS}`}
                              >
                                Start preparing
                              </button>
                              <button
                                onClick={() => updateOrderStatus(order.id, 'cancelled')}
                                className={`px-3 py-1.5 bg-white border border-gray-200 text-gray-700 rounded-xl text-xs font-semibold hover:bg-gray-50 transition ${BTN_PRESS}`}
                              >
                                Cancel
                              </button>
                            </>
                          )}
                          {order.status === 'preparing' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'ready')}
                              className={`px-3 py-1.5 bg-green-600 text-white rounded-xl text-xs font-semibold hover:bg-green-700 transition ${BTN_PRESS}`}
                            >
                              Mark ready
                            </button>
                          )}
                          {order.status === 'ready' && (
                            <button
                              onClick={() => updateOrderStatus(order.id, 'completed')}
                              className={`px-3 py-1.5 bg-zuri-black text-white rounded-xl text-xs font-semibold hover:bg-gray-800 transition ${BTN_PRESS}`}
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
                                className={`px-3 py-1.5 bg-zuri-orange text-white rounded-xl text-xs font-semibold hover:bg-zuri-orange-dark transition ${BTN_PRESS}`}
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => updateReservationStatus(reservation.id, 'cancelled')}
                                className={`px-3 py-1.5 bg-white border border-zuri-orange text-zuri-orange rounded-xl text-xs font-semibold hover:bg-zuri-orange hover:text-white transition ${BTN_PRESS}`}
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
                {isOpsAiTier(business?.plan) && (
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-xl p-6 border border-zuri-orange/20">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-lg font-bold text-zuri-black">Daily briefing</h3>
                        <span className="text-xs text-zuri-black/50">{aiBriefing?.date || ''}</span>
                      </div>
                      {aiBriefing ? (
                        <div className="space-y-2 text-sm text-zuri-black/80">
                          <p><span className="font-semibold text-zuri-black">Revenue:</span> ₦{Math.round(aiBriefing.totalRevenue).toLocaleString()}</p>
                          <p><span className="font-semibold text-zuri-black">Orders:</span> {aiBriefing.totalOrders.toLocaleString()}</p>
                          <p><span className="font-semibold text-zuri-black">Avg order value:</span> ₦{Math.round(aiBriefing.avgOrderValue).toLocaleString()}</p>
                          <p><span className="font-semibold text-zuri-black">Top item:</span> {aiBriefing.topItem ? `${aiBriefing.topItem.name} (${aiBriefing.topItem.count}x)` : '—'}</p>
                          <p><span className="font-semibold text-zuri-black">Busiest hour (UTC):</span> {aiBriefing.busiestHourUtc ? `${aiBriefing.busiestHourUtc.hour}:00 (${aiBriefing.busiestHourUtc.orderCount} orders)` : '—'}</p>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">Not enough data yet.</p>
                      )}
                    </div>

                    <div className="bg-white rounded-xl p-6 border border-zuri-orange/20">
                      <h3 className="text-lg font-bold text-zuri-black mb-3">Slow hour detection</h3>
                      {aiSlowHours?.slowHours?.length ? (
                        <div className="space-y-3">
                          {aiSlowHours.slowHours.map((r, idx) => (
                            <div key={idx} className="rounded-lg border border-gray-200 bg-gray-50/60 p-3 text-sm">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-zuri-black">
                                  {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][r.weekday]} • {r.hour}:00
                                </span>
                                <span className="text-xs text-gray-500">{r.orderCount} orders</span>
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                Idea: run a short promo or reduce staffing during this window.
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-gray-500">Not enough history yet.</p>
                      )}
                    </div>
                  </div>
                )}

                {isGuestAiMenuTier(business?.plan) && !isTicketing && (
                  <div className="rounded-2xl border border-zuri-orange/25 bg-gradient-to-br from-zuri-orange/[0.07] to-white p-6 md:p-8 space-y-5">
                    <div>
                      <p className="text-xs font-semibold text-zuri-orange uppercase tracking-widest mb-1">AI guest menu</p>
                      <h3 className="text-xl font-bold text-zuri-black">What guests see on your link</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Trending plates, Hausa · Yoruba · Igbo names (when you add them), taste-based sorting, upsell hints, and dietary chips — tuned for African dining rooms.
                      </p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      {(
                        [
                          ['trendingOnMenu', 'Trending items', 'Badges from live sales.'],
                          ['intelligentUpsell', 'Intelligent upsell', '“Pairs well” prompts on hot combos.'],
                          ['personalisedRecs', 'AI recommendations', 'Zuri picks row on the menu.'],
                          ['tasteSortEnabled', 'Taste sorting', 'Reorder list when guests pick dietary prefs.'],
                          ['translationsEnabled', 'Translations', 'Show Hausa / Yoruba / Igbo when configured.'],
                          ['dietaryPromptEnabled', 'Dietary prefs', 'Vegetarian, meat-forward, no-dairy chips.'],
                          ['localPaymentHints', 'Local payment hints', 'MoMo & bank-transfer nudges at checkout.'],
                          ['sharedTableHints', 'Shared table hints', 'Split-bill / shared-table copy.']
                        ] as const
                      ).map(([key, label, hint]) => (
                        <label
                          key={key}
                          className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white/90 px-3 py-3 cursor-pointer hover:border-zuri-orange/40 transition"
                        >
                          <input
                            type="checkbox"
                            className="mt-1 rounded border-gray-300 text-zuri-orange focus:ring-zuri-orange"
                            checked={
                              key === 'sharedTableHints'
                                ? !!aiGuestDraft.sharedTableHints
                                : aiGuestDraft[key as keyof AiGuestStorefrontConfig] !== false
                            }
                            onChange={(e) =>
                              setAiGuestDraft((d) => ({
                                ...d,
                                [key]: e.target.checked
                              }))
                            }
                          />
                          <span>
                            <span className="font-semibold text-zuri-black block">{label}</span>
                            <span className="text-xs text-gray-500">{hint}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white/90 p-4 space-y-3">
                      <p className="text-sm font-semibold text-zuri-black">Venue group (cross-location matching)</p>
                      <p className="text-xs text-gray-600 leading-relaxed">
                        Use the same group id for sister venues so guests who opt in can see dishes they loved at your other locations.
                      </p>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          type="text"
                          maxLength={80}
                          value={businessGroupDraft}
                          onChange={(e) => setBusinessGroupDraft(e.target.value)}
                          className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                          placeholder="e.g. zuri-demo-chain"
                        />
                        <button
                          type="button"
                          disabled={businessGroupSaving}
                          onClick={() => void saveBusinessGroup()}
                          className="shrink-0 bg-zuri-orange text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-zuri-orange-dark transition disabled:opacity-60"
                        >
                          {businessGroupSaving ? 'Saving…' : 'Save group'}
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={aiGuestSaving}
                        onClick={() => void saveAiGuestSettings()}
                        className="bg-zuri-black text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-neutral-800 transition disabled:opacity-60"
                      >
                        {aiGuestSaving ? 'Saving…' : 'Save guest AI settings'}
                      </button>
                      <a href="/pricing" className="text-sm font-medium text-zuri-orange hover:underline">
                        Plan limits
                      </a>
                    </div>
                  </div>
                )}

                {isGuestAiMenuTier(business?.plan) && (
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl p-5 border border-gray-200">
                      <h4 className="text-sm font-bold text-zuri-black mb-2">Trending items</h4>
                      <p className="text-xs text-gray-500 mb-3">Live from your last 14 days of orders.</p>
                      <ul className="text-sm text-gray-800 space-y-1">
                        {(popularItems || []).slice(0, 5).map((p) => (
                          <li key={p.name} className="flex justify-between gap-2">
                            <span className="truncate">{p.name}</span>
                            <span className="text-gray-400 shrink-0">{p.totalQuantity}x</span>
                          </li>
                        ))}
                        {!popularItems?.length ? <li className="text-gray-400">No data yet</li> : null}
                      </ul>
                    </div>
                    <div className="bg-white rounded-xl p-5 border border-gray-200">
                      <h4 className="text-sm font-bold text-zuri-black mb-2">Intelligent upsell</h4>
                      <p className="text-xs text-gray-500">
                        Zuri surfaces “pairs well” tags next to fast-moving dishes so guests add sides and drinks — especially helpful for high-noise halls and events.
                      </p>
                    </div>
                    <div className="bg-white rounded-xl p-5 border border-gray-200 md:col-span-2 lg:col-span-1">
                      <h4 className="text-sm font-bold text-zuri-black mb-2">African languages & prefs</h4>
                      <p className="text-xs text-gray-500">
                        Publish Hausa, Yoruba, and Igbo dish names from the Menu tab (per item translations). Guests can filter with vegetarian / meat / no-dairy preferences stored on-device for faster picks.
                      </p>
                    </div>
                  </div>
                )}

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
                        {(Array.isArray(profitMargins) ? profitMargins : []).slice(0, 10).map((item, idx) => (
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

                {/* Premium analytics (Scale+) */}
                {isAiInsightsTier(business?.plan) &&
                  marketInsights &&
                  typeof marketInsights === 'object' &&
                  marketInsights.platform &&
                  !marketInsightsLoading && (
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
                        <BarChart
                          data={(Array.isArray(marketInsights.platform.topItemNames)
                            ? marketInsights.platform.topItemNames
                            : []
                          ).slice(0, 6)}
                        >
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
                        <BarChart
                          data={Array.isArray(marketInsights.platform.peakHours) ? marketInsights.platform.peakHours : []}
                        >
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

                {isAiInsightsTier(business?.plan) && (
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
                          <BarChart data={(Array.isArray(profitMargins) ? profitMargins : []).slice(0, 8)}>
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

                {/* Market intelligence (Scale+) – Business Graph */}
                {isAiInsightsTier(business?.plan) && (
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
                    ) : marketInsights &&
                      typeof marketInsights === 'object' &&
                      marketInsights.platform &&
                      typeof marketInsights.platform === 'object' ? (
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div>
                            <p className="text-xs text-gray-400">Platform orders (last {marketInsights.platform.periodDays ?? 30} days)</p>
                            <p className="text-xl font-bold">{(marketInsights.platform.totalOrders ?? 0).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Platform avg order</p>
                            <p className="text-xl font-bold text-zuri-yellow">₦{Math.round(marketInsights.platform.avgOrderValue ?? 0).toLocaleString()}</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-400">Order trend</p>
                            <p className={`text-xl font-bold ${(marketInsights.platform.orderCountTrendPct ?? 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {(marketInsights.platform.orderCountTrendPct ?? 0) >= 0 ? '+' : ''}{marketInsights.platform.orderCountTrendPct ?? 0}%
                            </p>
                          </div>
                          {marketInsights.yourBusiness != null && typeof marketInsights.yourBusiness === 'object' && (
                            <div>
                              <p className="text-xs text-gray-400">Your avg order</p>
                              <p className="text-xl font-bold">₦{Math.round(marketInsights.yourBusiness.avgOrderValue ?? 0).toLocaleString()}</p>
                            </div>
                          )}
                        </div>
                        {Array.isArray(marketInsights.insights) && marketInsights.insights.length > 0 && (
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
                      <p className="text-sm text-gray-500">Unable to load market insights. Upgrade to Scale if you don’t see this.</p>
                    )}
                  </div>
                )}

                {business?.plan && !isAiInsightsTier(business.plan) && (
                  <div className="bg-zuri-orange/10 rounded-xl p-6 border border-zuri-orange/30">
                    <h3 className="text-lg font-bold text-zuri-black mb-2">Market intelligence</h3>
                    <p className="text-sm text-gray-600 mb-4">See anonymous platform trends, peak times, and how you compare. Available on Scale and above.</p>
                    <a href="/pricing" className="inline-block bg-zuri-orange text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition">View plans</a>
                  </div>
                )}
              </div>
            )}

            {/* Menu Management Tab */}
            {activeTab === 'menu' && (
              <div>
                <h2 className="text-lg font-bold text-zuri-black mb-6">{isTicketing ? 'Tickets' : 'Menu'}</h2>
                <MenuCatalogPresets
                  businessId={businessId || ''}
                  plan={business?.plan}
                  catalogMode={isTicketing ? 'ticketing' : 'menu'}
                  editingPresetId={editingPresetId}
                  onEditingPresetChange={setEditingPresetId}
                  onCatalogChanged={fetchMenu}
                />
                <div className="flex justify-between items-center mb-6 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (!businessId) return
                      if (!canCustomizeStorefront) {
                        navigate(`/business/dashboard/${businessId}/payment`)
                        return
                      }
                      navigate(`/business/dashboard/${businessId}/customize`)
                    }}
                    className="bg-white border border-zuri-orange text-zuri-orange px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-zuri-orange hover:text-white transition disabled:opacity-50"
                    title={
                      canCustomizeStorefront
                        ? undefined
                        : 'Storefront themes and menu layout presets are on Growth and above'
                    }
                  >
                    {canCustomizeStorefront
                      ? isTicketing
                        ? 'Customize storefront'
                        : 'Customize menu'
                      : 'Upgrade to customize'}
                  </button>
                  {businessId && (
                    <a
                      href={`/order/${encodeURIComponent(businessId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-white border border-gray-200 text-zuri-black px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-gray-50 transition"
                    >
                      Open live storefront
                    </a>
                  )}
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
                        setItemForm(createEmptyItemForm())
                        setImageUploadError(null)
                        if (imageInputRef.current) imageInputRef.current.value = ''
                      }}
                      className="bg-zuri-orange text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition"
                    >
                      {isTicketing ? '+ Ticket' : '+ Item'}
                    </button>
                  </div>
                </div>

                {menu.length === 0 ? (
                  <div className="text-center py-12 bg-gray-50/50 rounded-xl border border-gray-100">
                    <p className="text-gray-500 text-sm mb-4">{isTicketing ? 'No ticket types yet' : 'No menu items yet'}</p>
                    <button
                      onClick={() => setShowItemForm(true)}
                      className="bg-zuri-orange text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition"
                    >
                      {isTicketing ? 'Add first ticket' : 'Add first item'}
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
                                {(item.cost ?? 0) > 0 && (
                                  <p className="text-xs text-gray-400">Cost ₦{(item.cost ?? 0).toFixed(2)}</p>
                                )}
                              </div>
                              {!isTicketing ? (
                                <p className="text-xs text-gray-500 mb-3">
                                  Avg order time: {item.estimatedPrepTime ?? 15} min
                                </p>
                              ) : (item.maxPerUser || (item.groupSize && item.groupSize > 1) || (item.minPerOrder && item.minPerOrder > 1)) ? (
                                <div className="flex flex-wrap gap-1 mb-3">
                                  {item.maxPerUser ? (
                                    <span className="text-[10px] font-medium bg-zuri-orange/10 text-zuri-orange px-1.5 py-0.5 rounded">Max {item.maxPerUser}/buyer</span>
                                  ) : null}
                                  {item.groupSize && item.groupSize > 1 ? (
                                    <span className="text-[10px] font-medium bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">Groups of {item.groupSize}</span>
                                  ) : null}
                                  {item.minPerOrder && item.minPerOrder > 1 ? (
                                    <span className="text-[10px] font-medium bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">Min {item.minPerOrder}</span>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="mb-3" />
                              )}
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
                          {editingItem ? (isTicketing ? 'Edit ticket' : 'Edit Menu Item') : isTicketing ? 'Add ticket' : 'Add Menu Item'}
                        </h3>
                        <button
                          onClick={() => {
                            setShowItemForm(false)
                            setEditingItem(null)
                            setItemForm(createEmptyItemForm())
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
                        {isTicketing ? (
                          <div className="rounded-xl border-2 border-gray-200 p-4 space-y-3">
                            <p className="text-sm font-bold text-zuri-black">What kind of ticket is this?</p>
                            <div className="grid grid-cols-3 gap-2">
                              {(['paid', 'free', 'invite_only'] as const).map((pt) => (
                                <button
                                  key={pt}
                                  type="button"
                                  onClick={() => setItemForm({ ...itemForm, pricingType: pt, ...(pt === 'free' ? { price: '0' } : {}) })}
                                  className={`px-3 py-2.5 rounded-lg text-sm font-semibold border-2 transition ${
                                    itemForm.pricingType === pt
                                      ? 'border-zuri-orange bg-zuri-orange/10 text-zuri-orange'
                                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                  }`}
                                >
                                  {pt === 'paid' ? 'Paid' : pt === 'free' ? 'Free' : 'Invite-only'}
                                </button>
                              ))}
                            </div>
                            <div className="grid grid-cols-2 gap-3 pt-1">
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Ticket capacity</label>
                                <CustomDropdown
                                  options={[{ value: 'unlimited', label: 'Unlimited' }, { value: 'limited', label: 'Limited quantity' }]}
                                  value={itemForm.stockOnHand === '' ? 'unlimited' : 'limited'}
                                  onChange={(val) => setItemForm({ ...itemForm, stockOnHand: val === 'unlimited' ? '' : '100' })}
                                  accent="yellow"
                                  size="sm"
                                />
                              </div>
                              {itemForm.stockOnHand !== '' && (
                                <div>
                                  <label className="block text-xs font-semibold text-gray-500 mb-1">Total tickets</label>
                                  <input
                                    type="number"
                                    min="1"
                                    value={itemForm.stockOnHand}
                                    onChange={(e) => setItemForm({ ...itemForm, stockOnHand: e.target.value })}
                                    className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                                    placeholder="100"
                                  />
                                </div>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-gray-500 mb-1">Purchase limit per buyer</label>
                              <CustomDropdown
                                options={[
                                  ...Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} ${i + 1 === 1 ? 'ticket' : 'tickets'}` })),
                                  { value: '', label: 'No limit' }
                                ]}
                                value={itemForm.maxPerUser || '10'}
                                onChange={(val) => setItemForm({ ...itemForm, maxPerUser: val })}
                                accent="yellow"
                                size="sm"
                              />
                            </div>
                          </div>
                        ) : null}
                        <div>
                          <label className="block text-sm font-semibold text-zuri-black mb-2">
                            {isTicketing ? 'Ticket name *' : 'Item name *'}
                          </label>
                          <input
                            type="text"
                            value={itemForm.name}
                            onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                            required
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                            placeholder={isTicketing ? 'e.g., Early bird admission' : 'e.g., Grilled Chicken'}
                            maxLength={75}
                          />
                          {isTicketing && (
                            <p className="text-xs text-gray-400 mt-1 text-right">{itemForm.name.length} / 75</p>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center justify-between gap-3 mb-2">
                            <label className="block text-sm font-semibold text-zuri-black">Description</label>
                            {isGuestAiMenuTier(business?.plan) && (
                              <button
                                type="button"
                                disabled={descPolishLoading || !itemForm.name.trim()}
                                onClick={async () => {
                                  if (!businessId || !itemForm.name.trim()) return
                                  setDescPolishLoading(true)
                                  try {
                                    const catName = categories.find((c) => c.id === itemForm.categoryId)?.name
                                    const { data } = await axios.post<{ description: string }>(
                                      '/api/ai/menu/description',
                                      { businessId, itemName: itemForm.name.trim(), categoryName: catName || undefined },
                                      { headers: getAuthHeaders() }
                                    )
                                    if (data?.description) setItemForm((prev) => ({ ...prev, description: data.description }))
                                  } catch {
                                    alert('Failed to generate description')
                                  } finally {
                                    setDescPolishLoading(false)
                                  }
                                }}
                                className="text-xs font-semibold rounded-full border border-zuri-orange/30 px-3 py-1 text-zuri-black hover:bg-zuri-orange/10 transition disabled:opacity-60"
                              >
                                {descPolishLoading ? 'Polishing…' : 'Polish with AI'}
                              </button>
                            )}
                          </div>
                          <textarea
                            value={itemForm.description}
                            onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
                            rows={3}
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                            placeholder={
                              isTicketing
                                ? 'What this ticket includes — date, seating zone, perks…'
                                : 'Describe your menu item…'
                            }
                          />
                          {isTicketing && (
                            <p className="text-xs text-gray-400 mt-1 text-right">{(itemForm.description || '').length} / 280</p>
                          )}
                        </div>
                        {!isTicketing && isGuestAiMenuTier(business?.plan) ? (
                          <div className="rounded-xl border border-gray-200 bg-gray-50/90 p-4 space-y-3">
                            <p className="text-sm font-bold text-zuri-black">Guest menu names (Hausa · Yorùbá · Igbo)</p>
                            <p className="text-xs text-gray-600 leading-relaxed">
                              Shown when guests pick a language on your public menu. Leave blank to use the English name only.
                            </p>
                            <div className="grid sm:grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Hausa</label>
                                <input
                                  type="text"
                                  maxLength={120}
                                  value={itemForm.nameTransHa}
                                  onChange={(e) => setItemForm({ ...itemForm, nameTransHa: e.target.value })}
                                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                                  placeholder="Optional"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Yorùbá</label>
                                <input
                                  type="text"
                                  maxLength={120}
                                  value={itemForm.nameTransYo}
                                  onChange={(e) => setItemForm({ ...itemForm, nameTransYo: e.target.value })}
                                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                                  placeholder="Optional"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Igbo</label>
                                <input
                                  type="text"
                                  maxLength={120}
                                  value={itemForm.nameTransIg}
                                  onChange={(e) => setItemForm({ ...itemForm, nameTransIg: e.target.value })}
                                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                                  placeholder="Optional"
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {!isTicketing && isGuestAiMenuTier(business?.plan) ? (
                          <div className="rounded-xl border border-violet-200/80 bg-violet-50/40 p-4 space-y-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-bold text-zuri-black">Dish intelligence</p>
                                <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                                  Powers true “For you” and cross-venue matches. Use a shared catalog id for the same dish across branches.
                                </p>
                              </div>
                              {editingItem ? (
                                <button
                                  type="button"
                                  disabled={dishEnrichLoading}
                                  onClick={() => void enrichMenuItemDish()}
                                  className="text-xs font-semibold text-violet-700 border border-violet-300 bg-white px-3 py-1.5 rounded-lg hover:bg-violet-50 transition disabled:opacity-60"
                                >
                                  {dishEnrichLoading ? 'Enriching…' : 'Auto-enrich with AI'}
                                </button>
                              ) : null}
                            </div>
                            <div className="grid sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Catalog dish id</label>
                                <input
                                  type="text"
                                  maxLength={120}
                                  value={itemForm.canonicalDishId}
                                  onChange={(e) => setItemForm({ ...itemForm, canonicalDishId: e.target.value })}
                                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                                  placeholder="e.g. jollof-rice-lg"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-semibold text-gray-500 mb-1">Ingredients</label>
                                <input
                                  type="text"
                                  value={itemForm.ingredients}
                                  onChange={(e) => setItemForm({ ...itemForm, ingredients: e.target.value })}
                                  className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                                  placeholder="rice, tomato, pepper, chicken"
                                />
                              </div>
                            </div>
                          </div>
                        ) : null}
                        {isTicketing ? (
                          <div className="rounded-xl border-2 border-dashed border-gray-200 p-4 space-y-3">
                            <div className="flex items-center justify-between">
                              <p className="text-sm font-bold text-zuri-black">Perks for this ticket</p>
                              <button
                                type="button"
                                onClick={() => setItemForm({ ...itemForm, perks: [...itemForm.perks, ''] })}
                                className="text-xs font-semibold text-zuri-orange hover:underline"
                              >
                                + Add perk
                              </button>
                            </div>
                            {itemForm.perks.length === 0 ? (
                              <p className="text-xs text-gray-400">No perks yet. Add perks like "Priority entry", "Lounge access", etc.</p>
                            ) : (
                              <div className="space-y-2">
                                {itemForm.perks.map((perk, idx) => (
                                  <div key={idx} className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      value={perk}
                                      onChange={(e) => {
                                        const next = [...itemForm.perks]
                                        next[idx] = e.target.value
                                        setItemForm({ ...itemForm, perks: next })
                                      }}
                                      className="flex-1 px-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                                      placeholder="e.g., Priority entry, Free drink..."
                                    />
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const next = itemForm.perks.filter((_, i) => i !== idx)
                                        setItemForm({ ...itemForm, perks: next })
                                      }}
                                      className="text-red-400 hover:text-red-600 text-lg leading-none shrink-0"
                                      aria-label="Remove perk"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ) : null}
                        {isOpsAiTier(business?.plan) && !isTicketing && (
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-semibold text-zuri-black mb-2">Stock on hand</label>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={itemForm.stockOnHand}
                                onChange={(e) => setItemForm({ ...itemForm, stockOnHand: e.target.value })}
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                                placeholder="Leave empty to disable stock tracking"
                              />
                              <p className="text-xs text-gray-500 mt-1">When this reaches 0, the item is auto-hidden.</p>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-zuri-black mb-2">Low stock threshold</label>
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={itemForm.lowStockThreshold}
                                onChange={(e) => setItemForm({ ...itemForm, lowStockThreshold: e.target.value })}
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                                placeholder="e.g. 5"
                              />
                              <p className="text-xs text-gray-500 mt-1">Zuri Assist flags items below this threshold.</p>
                            </div>
                          </div>
                        )}
                        {isTicketing && itemForm.pricingType === 'free' ? null : (
                          <>
                            {isTicketing ? (
                              <div className="rounded-xl border border-zuri-orange/25 bg-zuri-orange/5 p-4">
                                <p className="text-sm font-semibold text-zuri-black">ZURI fee on each ticket sale</p>
                                <p className="text-xs text-gray-600 mt-1">{formatModeTransactionFee('ticketing')}.</p>
                                <p className="text-xs text-gray-700 mt-2">
                                  {ticketFeePreview > 0
                                    ? `At ₦${ticketDraftPrice.toFixed(2)}, ZURI collects ₦${ticketFeePreview.toFixed(2)} and your payout stays at ₦${ticketNetPreview.toFixed(2)} before settlement timing.`
                                    : 'Enter a ticket price to preview the exact ZURI fee and your net payout.'}
                                </p>
                              </div>
                            ) : null}
                            <div className="grid md:grid-cols-2 gap-4">
                              <div>
                                <label className="block text-sm font-semibold text-zuri-black mb-2">Price (₦) *</label>
                                <input
                                  type="number"
                                  step="0.01"
                                  value={itemForm.price}
                                  onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
                                  required={itemForm.pricingType !== 'free'}
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
                              {!isTicketing ? (
                                <div>
                                  <label className="block text-sm font-semibold text-zuri-black mb-2">Avg order time (min)</label>
                                  <input
                                    type="number"
                                    step="1"
                                    min="0"
                                    value={itemForm.estimatedPrepTime}
                                    onChange={(e) => setItemForm({ ...itemForm, estimatedPrepTime: e.target.value })}
                                    className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                                    placeholder="15"
                                  />
                                  <p className="text-xs text-gray-500 mt-1">Used to estimate how long orders take</p>
                                </div>
                              ) : null}
                            </div>
                          </>
                        )}
                        {isTicketing ? (
                          <div className="grid md:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-semibold text-zuri-black mb-2">Group size (people per ticket)</label>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={itemForm.groupSize}
                                onChange={(e) => setItemForm({ ...itemForm, groupSize: e.target.value })}
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                                placeholder="1 (single admission)"
                              />
                              <p className="text-xs text-gray-500 mt-1">How many people one ticket admits (e.g. 5 for group/table)</p>
                            </div>
                            <div>
                              <label className="block text-sm font-semibold text-zuri-black mb-2">Min tickets per order</label>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={itemForm.minPerOrder}
                                onChange={(e) => setItemForm({ ...itemForm, minPerOrder: e.target.value })}
                                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                                placeholder="1"
                              />
                              <p className="text-xs text-gray-500 mt-1">Minimum quantity required to purchase</p>
                            </div>
                          </div>
                        ) : null}
                        <div>
                          <label className="block text-sm font-semibold text-zuri-black mb-2">Category</label>
                          <CustomDropdown
                            options={[
                              { value: '', label: 'Uncategorized' },
                              ...categories.map(cat => ({ value: cat.id, label: cat.name }))
                            ]}
                            value={itemForm.categoryId}
                            onChange={(val) => setItemForm({ ...itemForm, categoryId: val })}
                            placeholder="Select category"
                            searchable={categories.length > 5}
                            accent="yellow"
                          />
                        </div>
                        {business?.plan && business.plan !== 'free' ? (
                          <div>
                            <label className="block text-sm font-semibold text-zuri-black mb-2">
                              {isTicketing ? 'Ticket image (optional)' : 'Item image'}
                            </label>
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
                                      const msg = axios.isAxiosError(err) ? formatUserFacingError(err.response?.data, 'Upload failed') : 'Upload failed'
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
                              Upgrade to <strong>Starter</strong> (₦9,900/mo) to add{' '}
                              {isTicketing ? 'images to ticket types' : 'pictures to menu items'}.
                            </p>
                            <a href="/pricing" target="_blank" rel="noopener noreferrer" className="text-sm text-zuri-yellow font-semibold hover:underline mt-1 inline-block">
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
                            {isTicketing ? 'Available for sale' : 'Available for ordering'}
                          </label>
                        </div>
                        <div className="flex space-x-4 pt-4">
                          <button
                            type="button"
                            onClick={() => {
                              setShowItemForm(false)
                              setEditingItem(null)
                              setItemForm(createEmptyItemForm())
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
                          <label className="block text-sm font-semibold text-zuri-black mb-2">Category name *</label>
                          <input
                            type="text"
                            value={categoryForm.name}
                            onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                            required
                            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-zuri-yellow"
                            placeholder={
                              isTicketing ? 'e.g., Admission, VIP, Add-ons' : 'e.g., Appetizers, Main Courses'
                            }
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
                {qrLoading ? (
                  <div className="py-12 flex items-center justify-center w-full">
                    <PaperPlaneLoader size="md" />
                  </div>
                ) : qrCode ? (
                  <div>
                    <div className="bg-white p-6 rounded-xl inline-block mb-6 border border-gray-200">
                      <img src={qrCode.qrCodeDataUrl} alt="QR Code" className="w-56 h-56" />
                    </div>
                    <p className="text-gray-500 text-sm mb-1">Links to your live catalog preset on:</p>
                    <p className="text-xs text-zuri-orange font-mono break-all mb-4 px-4">{qrCode.qrUrl}</p>
                    <p className="text-gray-500 text-sm mb-4">Print and place on your tables</p>
                    <p className="text-xs text-gray-400 mb-6">Scan with any phone camera — no app needed</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={downloadQrCode}
                        className="inline-block bg-zuri-orange text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={loadQrCode}
                        className="inline-block bg-white border border-gray-200 text-zuri-black px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-gray-50 transition"
                      >
                        Refresh QR
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-8 px-4 max-w-md mx-auto">
                    <p className="text-sm text-red-600 mb-4">{qrError || 'Could not load QR code.'}</p>
                    <button
                      type="button"
                      onClick={loadQrCode}
                      className="inline-block bg-zuri-orange text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition"
                    >
                      Try again
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Zuri Assist dashboard (Scale and above) */}
            {activeTab === 'ai' && isAiInsightsTier(business?.plan) && (
              <div className="max-w-5xl mx-auto">
                <div className="rounded-3xl border border-zuri-orange/20 bg-white/75 backdrop-blur-sm px-5 py-6 sm:px-10 sm:py-8 shadow-[0_10px_30px_rgba(255,189,89,0.08)]">
                  <div className="flex items-center justify-between mb-8">
                    <div className="inline-flex items-center gap-2 rounded-full border border-zuri-orange/20 bg-zuri-orange/5 px-3 py-1 text-xs text-zuri-black/80">
                      <span className="h-5 w-5 rounded-full bg-zuri-black text-white grid place-items-center text-[10px]">AI</span>
                      <button
                        type="button"
                        onClick={() => setShowAiChats((v) => !v)}
                        className="cursor-pointer font-semibold hover:text-zuri-black transition"
                        aria-expanded={showAiChats}
                      >
                        Past chats{aiChats.length ? ` (${aiChats.length})` : ''}
                      </button>
                    </div>
                    <div className="h-8 w-8 rounded-full bg-zuri-orange/20 border border-zuri-orange/35 grid place-items-center text-zuri-black text-xs font-semibold">
                      {business?.name?.charAt(0)?.toUpperCase() || 'U'}
                    </div>
                  </div>

                  {showAiChats && (
                    <div className="mb-8 rounded-2xl border border-zuri-orange/20 bg-white/60 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-zuri-black text-sm">Past chats</h3>
                        <button
                          type="button"
                          onClick={() => setShowAiChats(false)}
                          className="text-xs text-zuri-black/60 hover:text-zuri-black transition"
                        >
                          Hide
                        </button>
                      </div>

                      {aiChats.length === 0 ? (
                        <p className="text-sm text-zuri-black/60">No past chats yet. Ask a question to get started.</p>
                      ) : (
                        <div className="max-h-56 overflow-auto space-y-2 pr-1">
                          {aiChats.map((c) => {
                            const summary =
                              c.type === 'custom'
                                ? (c.query || 'Custom question')
                                : c.type.replace(/_/g, ' ')
                            const stamp = formatAiChatStamp(c.createdAt)

                            return (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  setShowAiChats(false)
                                  setActiveAiChatId(c.id)
                                  setAiInsightLoading(false)
                                  setAiInsight(c.insight)
                                }}
                                className={[
                                  'w-full text-left rounded-xl border px-3 py-2 transition',
                                  c.id === activeAiChatId ? 'border-zuri-orange/50 bg-zuri-orange/10' : 'border-zuri-orange/20 bg-white/80 hover:bg-zuri-orange/5'
                                ].join(' ')}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="font-semibold text-zuri-black text-sm truncate">
                                      {summary}
                                    </div>
                                    <div className="text-xs text-zuri-black/60 truncate w-full">
                                      {c.type === 'custom' ? 'Custom query' : 'Quick prompt'}
                                    </div>
                                  </div>
                                  <div className="text-[11px] text-zuri-black/40 whitespace-nowrap">
                                    {stamp}
                                  </div>
                                </div>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="text-center mb-8">
                    <p className="text-zuri-black/75 text-xl sm:text-2xl">Hi {business?.name || 'there'}</p>
                    <h2 className="text-zuri-black text-3xl sm:text-4xl font-semibold leading-tight mt-1">What would you like to know?</h2>
                    <p className="text-zuri-black/55 text-sm mt-2">Use one of the most common prompts below or ask your own question.</p>
                  </div>

                  {/* Customer Intelligence metrics (Scale+) */}
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
                        onClick={() => requestAiInsight(type as AiInsightType)}
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
                      onClick={() => requestAiInsight('custom', { query: aiCustomQuery.trim() })}
                      className="h-7 w-7 rounded-full bg-zuri-orange/20 text-zuri-black grid place-items-center hover:bg-zuri-orange/35 transition disabled:opacity-50"
                      aria-label="Ask AI"
                    >
                      {`->`}
                    </button>
                  </div>

                  {aiInsight !== null && (
                    <div className="rounded-2xl border border-zuri-orange/20 bg-zuri-orange/5 p-5 mt-5">
                      <h3 className="font-semibold text-zuri-black mb-2">{aiInsightLoading ? 'Thinking...' : 'Insight'}</h3>
                      <div className="prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-strong:text-zuri-black prose-headings:text-zuri-black prose-a:text-zuri-orange prose-code:text-zuri-black prose-pre:bg-white/60">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {aiInsightLoading
                            ? ''
                            : aiInsightTypingDone
                              ? aiInsight || ''
                              : safeMarkdownDuringTyping(aiInsightTyped)}
                        </ReactMarkdown>
                        {!aiInsightLoading && !aiInsightTypingDone && (
                          <span className="inline-block w-[0.6ch] text-zuri-black/60">|</span>
                        )}
                      </div>
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

