// Business Types
export type PlanId =
  | 'free'
  | 'starter'
  | 'growth'
  | 'scale'
  | 'enterprise'
  | 'pro'
  | 'zuri_plus'
  | 'basic'
  | 'advanced'

/** Languages supported for guest menu copy (expand over time). */
export type GuestMenuLang = 'en' | 'ha' | 'yo' | 'ig'

export type AiGuestStorefrontConfig = {
  /** Surface trending dishes on the guest menu (from recent sales). */
  trendingOnMenu?: boolean
  /** Suggest add-ons / pairs well hints. */
  intelligentUpsell?: boolean
  /** “Zuri picks” and personalised ordering hints. */
  personalisedRecs?: boolean
  /** Re-rank items using guest dietary prefs (session). */
  tasteSortEnabled?: boolean
  /** Use Hausa / Yoruba / Igbo strings from menu translations when present. */
  translationsEnabled?: boolean
  /** Show optional dietary preference chips for guests. */
  dietaryPromptEnabled?: boolean
  /** MoMo / bank-transfer nudges for African cash-heavy venues. */
  localPaymentHints?: boolean
  /** Nudge split-bill or shared-table behaviour. */
  sharedTableHints?: boolean
}

export type BillingInterval = 'monthly' | 'yearly'

/** Restaurant menu ordering vs event ticketing storefront */
export type BusinessMode = 'menu' | 'ticketing'

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
  /** Present when loaded from API (camelCase) */
  businessMode?: BusinessMode
  /** Public order page: Scale-tier image pills (For you / Reorder / Trending) */
  scaleGuestMenuTags?: boolean
  /** Optional chain / group id for cross-venue dish matching */
  businessGroupId?: string | null
  /** Number of AI storefront generations used by this business */
  storefrontAiGenerations?: number
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
export type StorefrontMenuTemplateId =
  | 'classic'
  | 'marketplace'
  | 'bistro'
  | 'night-market'
  | 'express'
  | 'premium-dark'
  | 'minimal'
  | 'editorial'
export type StorefrontCardLayout = 'stacked' | 'horizontal'
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

  /** Preset chosen in the customizer; `custom` means manual tweaks only */
  menuTemplate?: StorefrontMenuTemplateId | 'custom'
  layout: StorefrontMenuLayout
  gridStyle: 'two_col' | 'row_list' | 'wide_cards'
  cardLayout: StorefrontCardLayout
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
  /** Full-width hero photo (Growth+). Shown under text with overlay from `heroOverlay`. */
  heroBannerUrl?: string | null
  /** Guest-side AI menu behaviour (Growth+). Merged in `mergeStorefrontConfig`. */
  aiGuest?: AiGuestStorefrontConfig
}

export type StorefrontDetails = {
  name: string
  tagline: string
  cuisineTags: string[]
  /** Optional per–menu-item translations for African languages (by item id). */
  menuTranslations?: Record<string, Partial<Record<'ha' | 'yo' | 'ig', string>>>
}

export const PLAN_LABELS: Record<PlanId, string> = {
  free: 'Free',
  starter: 'Starter',
  growth: 'Growth',
  scale: 'Scale',
  /** Legacy slug; migrated to Scale in DB — label as Scale for operators. */
  pro: 'Scale',
  zuri_plus: 'Zuri Plus (legacy)',
  enterprise: 'Enterprise',
  basic: 'Basic',
  advanced: 'Advanced'
}

export const PLAN_PRICES: Record<PlanId, string> = {
  free: '₦0',
  starter: '₦9,900',
  growth: '₦24,900',
  scale: '₦59,900',
  pro: '₦40,000',
  zuri_plus: '₦60,000',
  enterprise: 'Custom',
  basic: '₦24,900',
  advanced: '₦59,900'
}

export const PLAN_PRICES_YEARLY: Record<PlanId, string> = {
  free: '₦0',
  starter: '₦95,040',
  growth: '₦239,040',
  scale: '₦575,040',
  pro: '₦384,000',
  zuri_plus: '₦576,000',
  enterprise: 'Custom',
  basic: '₦239,040',
  advanced: '₦575,040'
}

/** When billing yearly, show this monthly equivalent on pricing cards (total/12). Full total shown at checkout. */
export const PLAN_PRICES_YEARLY_AS_MONTHLY: Record<PlanId, string> = {
  free: '₦0',
  starter: '₦7,920',
  growth: '₦19,920',
  scale: '₦47,920',
  pro: '₦32,000',
  zuri_plus: '₦48,000',
  enterprise: 'Custom',
  basic: '₦19,920',
  advanced: '₦47,920'
}

export const YEARLY_DISCOUNT_PCT = 20

// Menu Types
export type TicketPricingType = 'free' | 'paid' | 'invite_only'

export interface MenuItem {
  id: string
  name: string
  description?: string
  price: number
  cost?: number
  /**
   * Average estimated prep/fulfillment time (minutes) for this item.
   * Used to compute the expected prep time shown on the order.
   */
  estimatedPrepTime?: number
  imageUrl?: string
  available: boolean
  displayOrder?: number
  /** Ticketing: max tickets a single buyer can purchase for this type (null = unlimited) */
  maxPerUser?: number | null
  /** Ticketing: tickets sold in groups of N (e.g. 2 = pairs only). null/1 = individual. */
  groupSize?: number | null
  /** Ticketing: minimum tickets per order for this type (null/1 = no minimum) */
  minPerOrder?: number | null
  /** Ticketing: free, paid, or invite-only */
  pricingType?: TicketPricingType | null
  /** Ticketing: list of perks/benefits included with this ticket */
  perks?: string[] | null
  /** Ticketing: total capacity (null = unlimited) — maps to stockOnHand in DB */
  totalCapacity?: number | null
  /** Shared catalog id for cross-venue exact match */
  canonicalDishId?: string | null
  /** Ingredient list for taste matching */
  ingredients?: string[]
  /** Structured tags: protein, course, cuisine, spice, allergens */
  dishTags?: Record<string, string[]>
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

/** Business Graph (Phase 3): anonymous platform market insights – Scale+ */
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

