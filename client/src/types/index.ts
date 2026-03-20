// Business Types
export type PlanId = 'free' | 'starter' | 'growth' | 'pro' | 'zuri_plus' | 'enterprise' | 'basic' | 'advanced'

export type BillingInterval = 'monthly' | 'yearly'

export interface Business {
  id: string
  name: string
  email: string
  phone?: string
  address?: string
  createdAt?: string
  plan?: PlanId
  paystackPublicKey?: string | null
  logoUrl?: string | null
  storefrontConfig?: StorefrontConfig | null
  storefrontDetails?: StorefrontDetails | null
  bankAccount?: {
    bankName: string | null
    accountNumberMasked: string | null
    accountName: string | null
  } | null
}

// Storefront Customizer Types (published to customer ordering page)
export type StorefrontHeroOverlay = 'gradient' | 'solid' | 'dim' | 'split'
export type StorefrontFontFamily = 'sans' | 'serif' | 'mono'
export type StorefrontMenuLayout = 'grid' | 'list' | 'cards'
export type StorefrontCardImageShape = 'square' | 'rounded' | 'circle'
export type StorefrontDividerStyle = 'none' | 'soft' | 'bold' | 'dotted'
export type StorefrontPillShape = 'pill' | 'rectangle' | 'underline'
export type StorefrontSectionTitleTreatment = 'underlined' | 'uppercase' | 'chip'
export type StorefrontShadowDepth = 'flat' | 'soft' | 'deep'
export type StorefrontBackgroundTone = 'light' | 'warm' | 'dark'

export type StorefrontConfig = {
  brandColor: string
  backgroundTone: StorefrontBackgroundTone
  heroOverlay: StorefrontHeroOverlay
  priceTextColor: string

  fontFamily: StorefrontFontFamily
  titleSize: number
  menuItemFontScale: number

  layout: StorefrontMenuLayout
  gridStyle: 'two_col' | 'row_list' | 'wide_cards'
  showPhotos: boolean
  showDescriptions: boolean
  showCalories: boolean
  showRatings: boolean
  cardSize: number

  cardImageShape: StorefrontCardImageShape
  cardGap: number
  cardRadius: number
  dividerStyle: StorefrontDividerStyle

  pillShape: StorefrontPillShape
  sectionTitleTreatment: StorefrontSectionTitleTreatment
  shadowDepth: StorefrontShadowDepth
  categoryStripBorder: boolean
  heroHeight: number
}

export type StorefrontDetails = {
  name: string
  tagline: string
  cuisineTags: string[]
}

export const PLAN_LABELS: Record<PlanId, string> = {
  free: 'Free',
  starter: 'Starter',
  growth: 'Growth',
  pro: 'Pro',
  zuri_plus: 'Zuri AI',
  enterprise: 'Enterprise',
  basic: 'Basic',
  advanced: 'Advanced'
}

export const PLAN_PRICES: Record<PlanId, string> = {
  free: '₦0',
  starter: '₦7,500',
  growth: '₦20,000',
  pro: '₦40,000',
  zuri_plus: '₦60,000',
  enterprise: 'Custom',
  basic: '₦20,000',
  advanced: '₦40,000'
}

export const PLAN_PRICES_YEARLY: Record<PlanId, string> = {
  free: '₦0',
  starter: '₦72,000',
  growth: '₦192,000',
  pro: '₦384,000',
  zuri_plus: '₦576,000',
  enterprise: 'Custom',
  basic: '₦192,000',
  advanced: '₦384,000'
}

/** When billing yearly, show this monthly equivalent on pricing cards (total/12). Full total shown at checkout. */
export const PLAN_PRICES_YEARLY_AS_MONTHLY: Record<PlanId, string> = {
  free: '₦0',
  starter: '₦6,000',
  growth: '₦16,000',
  pro: '₦32,000',
  zuri_plus: '₦48,000',
  enterprise: 'Custom',
  basic: '₦16,000',
  advanced: '₦32,000'
}

export const YEARLY_DISCOUNT_PCT = 20

// Menu Types
export interface MenuItem {
  id: string
  name: string
  description?: string
  price: number
  cost?: number
  imageUrl?: string
  available: boolean
  displayOrder?: number
}

export interface MenuCategory {
  id: string
  name: string
  items: MenuItem[]
}

// Order Types
export interface OrderItem {
  id?: string
  menuItemId: string
  menuItemName?: string
  quantity: number
  price: number
  specialNotes?: string
}

export interface Order {
  id: string
  businessId: string
  customerName?: string
  customerPhone?: string
  customerEmail?: string
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'
  totalAmount: number
  estimatedPrepTime: number
  createdAt: string
  completedAt?: string
  payment_status?: string
  items?: OrderItem[]
  /** Zuri Network: returning customer across Zuri businesses */
  returningZuriCustomer?: boolean
  zuriCustomerStats?: {
    avgOrderValue: number
    totalOrders: number
    businessCount: number
  }
}

// Reservations (table booking requests -> business confirmation)
export interface Reservation {
  id: string
  businessId?: string
  business_id?: string

  customerName?: string
  customer_name?: string

  customerPhone?: string
  customer_phone?: string

  partySize?: number
  party_size?: number

  reservedFor?: string
  reserved_for?: string

  notes?: string | null
  status: 'requested' | 'confirmed' | 'cancelled'
  createdAt?: string
  created_at?: string

  confirmedAt?: string | null
  confirmed_at?: string | null

  cancelledAt?: string | null
  cancelled_at?: string | null
}

export interface Review {
  id: string
  businessId?: string
  business_id?: string
  orderId?: string
  order_id?: string
  customerName?: string
  customer_name?: string
  customerEmail?: string
  customer_email?: string
  rating: number
  comment?: string | null
  createdAt?: string
  created_at?: string
}

// Analytics Types
export interface SalesSummary {
  totalOrders: number
  totalRevenue: number
  averageOrderValue: number
  completedRevenue: number
}

export interface SalesByDate {
  date: string
  orderCount: number
  revenue: number
  completedRevenue: number
}

export interface PopularItem {
  id: string
  name: string
  price: number
  totalQuantity: number
  totalRevenue: number
  orderCount: number
}

export interface PeakHour {
  hour: string
  orderCount: number
  revenue: number
}

export interface ProfitMargin {
  id: string
  name: string
  price: number
  cost: number
  totalQuantity: number
  totalRevenue: number
  totalCost: number
  profit: number
  marginPercentage: number
}

export interface CustomerIntelligence {
  uniqueCustomers: number
  repeatCustomers: number
  repeatRatePct: number
  totalOrders: number
  totalRevenue: number
  avgSpendPerOrder: number
  ordersPerCustomer: number
  returnWithin10DaysPct: number
}

/** Business Graph (Phase 3): anonymous platform market insights – Pro+ only */
export interface MarketInsights {
  platform: {
    totalOrders: number
    totalRevenue: number
    avgOrderValue: number
    orderCountTrendPct: number
    peakHours: { hour: number; orderCount: number }[]
    topItemNames: { name: string; orderCount: number }[]
    periodDays: number
  }
  yourBusiness?: {
    totalOrders: number
    totalRevenue: number
    avgOrderValue: number
  }
  insights: string[]
}

// QR Code Types
export interface QRCodeData {
  qrUrl: string
  qrCodeDataUrl: string
  businessId: string
}

// Form Types
export interface SavedCard {
  id: string
  last4: string
  card_type: string
  created_at?: string
}
export interface CustomerInfo {
  name: string
  phone: string
  email: string
}

export interface BusinessFormData {
  name: string
  email: string
  password: string
  phone?: string
  address?: string
}

