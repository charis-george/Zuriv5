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
  bankAccount?: {
    bankName: string | null
    accountNumberMasked: string | null
    accountName: string | null
  } | null
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
  starter: '₦81,000',
  growth: '₦216,000',
  pro: '₦432,000',
  zuri_plus: '₦648,000',
  enterprise: 'Custom',
  basic: '₦216,000',
  advanced: '₦432,000'
}

export const YEARLY_DISCOUNT_PCT = 10

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
  items?: OrderItem[]
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

