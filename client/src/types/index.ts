// Business Types
export interface Business {
  id: string
  name: string
  email: string
  phone?: string
  address?: string
  createdAt?: string
}

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

