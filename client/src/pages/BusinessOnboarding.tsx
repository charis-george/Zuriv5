import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { PLAN_LABELS, type PlanId, type Business, type BusinessMode } from '../types'
import { getBusinessToken } from '../lib/businessAuthStorage'
import { formatUserFacingError } from '../lib/formatApiError'
import { normalizeUuidParam } from '../lib/normalizeUuid'
import { ZURI_FEATURES_BY_TIER, planHighlights } from '../lib/zuriFeaturesByTier'
import { CustomDropdown } from '../components/CustomDropdown'
import { formatModeTransactionFee } from '../lib/transactionFees'
import { catalogLabelForMode, catalogNounForMode } from '../lib/businessMode'

const ONBOARDING_KEY = 'zuri_onboarding_done'

type UseCase = 'team' | 'business' | 'side'
type BusinessSize = 'solo' | 'small' | 'medium' | 'large'

const useCases: { id: UseCase; title: string; description: string }[] = [
  { id: 'team', title: 'For my team', description: 'Collaborate on orders, menu, and daily operations together.' },
  { id: 'business', title: 'For my business', description: 'Run your storefront, track orders, and get paid.' },
  { id: 'side', title: 'For a side project', description: 'Keep it simple — one place for menu and payments.' }
]

const businessSizes: { id: BusinessSize; title: string; description: string }[] = [
  { id: 'solo', title: 'Just me', description: 'Solo owner or freelancer' },
  { id: 'small', title: '2–10 people', description: 'Small team or café' },
  { id: 'medium', title: '11–50 people', description: 'Growing business' },
  { id: 'large', title: '50+ people', description: 'Larger operation' }
]

const dashboardHighlights: { title: string; description: string }[] = [
  { title: 'Orders', description: 'See every order in real time and update status as you prepare.' },
  { title: 'Menu', description: 'Add categories and items, set prices, and toggle availability.' },
  {
    title: 'Analytics',
    description:
      'Sales, trends, popular dishes, and peak hours from Growth. Scale adds Zuri Assist metrics, market intelligence, and richer margin views.'
  },
  { title: 'QR Code', description: 'Download your QR so customers can scan and order from their phone.' },
  { title: 'Payment & pricing', description: 'Payouts, plans — upgrade to Growth for analytics & guest AI menu, Scale for Zuri Assist & CSV import.' },
  { title: 'Profile', description: 'Business details, logo, Zuri Tap (Growth+), and password — all in one place.' }
]

const dashboardHighlightsTicketing: { title: string; description: string }[] = [
  { title: 'Orders', description: 'See ticket orders, holds, and paid confirmations as they come in.' },
  { title: 'Tickets', description: 'Create tiers (GA, VIP, add-ons), set prices, and control availability.' },
  {
    title: 'Analytics',
    description: 'Same revenue analytics as restaurants — Growth for dashboards; Scale for Zuri Assist and network benchmarks.'
  },
  { title: 'QR Code', description: 'Guests scan your code to open your ticket storefront and checkout.' },
  { title: 'Payment & pricing', description: 'Payouts and plans — CSV ticket import on Scale and above.' },
  { title: 'Profile', description: 'Event name, branding, Zuri Tap (Growth+), and password — all in one place.' }
]

const dashboardHighlightsShop: { title: string; description: string }[] = [
  { title: 'Orders', description: 'See catalog orders in real time and update fulfillment as you pack.' },
  { title: 'Catalog', description: 'Add categories and products, set prices, and toggle availability.' },
  {
    title: 'Analytics',
    description:
      'Sales, trends, popular products, and peak hours from Growth. Scale adds Zuri Assist metrics and richer margin views.'
  },
  { title: 'QR Code', description: 'Download your QR so customers can browse your catalog and pay from their phone.' },
  { title: 'Payment & pricing', description: 'Payouts, plans — upgrade to Growth for analytics, Scale for Zuri Assist & CSV import.' },
  { title: 'Profile', description: 'Shop details, logo, Zuri Tap (Growth+), and password — all in one place.' }
]

const SAMPLE_MENU_CATEGORIES = [
  {
    name: 'Popular',
    items: [
      { name: 'Grilled chicken plate', description: 'House marinade with seasonal sides.', price: 4500, cost: 0 },
      { name: 'Garden grain bowl', description: 'Greens, grains, and house dressing.', price: 5200, cost: 0 }
    ]
  },
  {
    name: 'Sides & extras',
    items: [
      { name: 'Crispy wedges', description: 'Golden, lightly seasoned.', price: 1200, cost: 0 },
      { name: 'Chef’s salad', description: 'Ask staff for today’s mix.', price: 2500, cost: 0 }
    ]
  },
  {
    name: 'Drinks',
    items: [
      { name: 'House iced tea', description: 'Chilled and lightly sweetened.', price: 1800, cost: 0 },
      { name: 'Fresh juice', description: 'Pick your flavour.', price: 2000, cost: 0 }
    ]
  }
]

type DigitizedMenuCategory = {
  name: string
  items: Array<{
    name: string
    description?: string
    price?: number
    available?: boolean
  }>
}

const SAMPLE_SHOP_CATEGORIES = [
  {
    name: 'Featured',
    items: [
      { name: 'Signature tote', description: 'Everyday carry with your brand mark.', price: 8500, cost: 0 },
      { name: 'Limited drop tee', description: 'Soft cotton, small-batch print.', price: 12000, cost: 0 }
    ]
  },
  {
    name: 'Accessories',
    items: [
      { name: 'Cap', description: 'Adjustable fit.', price: 5500, cost: 0 },
      { name: 'Sticker pack', description: 'Five designs.', price: 1500, cost: 0 }
    ]
  },
  {
    name: 'Care',
    items: [
      { name: 'Gift wrap', description: 'Optional wrap for presents.', price: 1000, cost: 0 },
      { name: 'Express pack', description: 'Priority packing for same-day pickup.', price: 2000, cost: 0 }
    ]
  }
]

const SAMPLE_TICKET_CATEGORIES = [
  {
    name: 'Admission',
    items: [
      {
        name: 'General admission',
        description: 'Standard entry for your published date and session.',
        price: 5000,
        cost: 0
      },
      {
        name: 'VIP access',
        description: 'Priority entry and lounge access where applicable.',
        price: 15000,
        cost: 0
      }
    ]
  },
  {
    name: 'Add-ons',
    items: [
      {
        name: 'Meet & greet',
        description: 'Limited slots after the main session.',
        price: 12000,
        cost: 0
      }
    ]
  }
]

function BusinessOnboarding(): JSX.Element {
  const { businessId: rawBusinessId } = useParams<{ businessId: string }>()
  const businessId = normalizeUuidParam(rawBusinessId)
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [business, setBusiness] = useState<Business | null>(null)
  const [useCase, setUseCase] = useState<UseCase | null>(null)
  const [businessSize, setBusinessSize] = useState<BusinessSize | null>(null)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [direction, setDirection] = useState<'in' | 'out'>('in')
  const [businessPlan, setBusinessPlan] = useState<PlanId>('free')
  /** Persisted to the business when leaving step 2 */
  const [storefrontUseCase, setStorefrontUseCase] = useState<BusinessMode | null>(null)

  type MenuSetupChoice = 'empty' | 'sample' | 'upload' | 'spreadsheet'
  const [menuChoice, setMenuChoice] = useState<MenuSetupChoice | null>(null)
  const [menuSetupLoading, setMenuSetupLoading] = useState(false)
  const [menuSetupError, setMenuSetupError] = useState<string | null>(null)
  const [menuDigitizeSummary, setMenuDigitizeSummary] = useState<{
    categoryCount: number
    itemCount: number
    notes: string | null
  } | null>(null)
  const [menuDigitizeQuota, setMenuDigitizeQuota] = useState<{
    used: number
    limit: number | null
    remaining: number | null
    unlimited: boolean
    hourlyRemaining: number
  } | null>(null)
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([])
  const [bankForm, setBankForm] = useState({ bankCode: '', bankName: '', accountNumber: '', accountName: '' })
  const [bankResolving, setBankResolving] = useState(false)
  const [bankResolveError, setBankResolveError] = useState<string | null>(null)
  const [bankPassword, setBankPassword] = useState('')
  const [bankSaving, setBankSaving] = useState(false)
  const [bankFormError, setBankFormError] = useState<string | null>(null)
  const [showBankForm, setShowBankForm] = useState(true)

  const getAuthHeaders = () => {
    const token = getBusinessToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
  }

  const canImportSpreadsheet =
    businessPlan === 'scale' || businessPlan === 'pro' || businessPlan === 'zuri_plus' || businessPlan === 'enterprise'
  const canUploadMenuPictures = businessPlan !== 'free'
  const previewHighlights =
    storefrontUseCase === 'ticketing'
      ? dashboardHighlightsTicketing
      : storefrontUseCase === 'shop'
        ? dashboardHighlightsShop
        : dashboardHighlights
  const catalogLabel = catalogLabelForMode(storefrontUseCase)
  const catalogNoun = catalogNounForMode(storefrontUseCase)
  const previewNavTabs =
    storefrontUseCase === 'ticketing'
      ? (['Orders', 'Analytics', 'Tickets', 'QR Code', 'Payment', 'Profile'] as const)
      : storefrontUseCase === 'shop'
        ? (['Orders', 'Analytics', 'Catalog', 'QR Code', 'Payment', 'Profile'] as const)
        : (['Orders', 'Analytics', 'Menu', 'QR Code', 'Payment', 'Profile'] as const)

  const parseCsvLine = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i]
      if (ch === '"') {
        const next = line[i + 1]
        if (inQuotes && next === '"') {
          cur += '"'
          i += 1
        } else {
          inQuotes = !inQuotes
        }
      } else if (ch === ',' && !inQuotes) {
        out.push(cur.trim())
        cur = ''
      } else {
        cur += ch
      }
    }
    out.push(cur.trim())
    return out
  }

  const createSampleMenu = async (): Promise<void> => {
    if (!businessId) return
    if (menuSetupLoading) return
    setMenuSetupLoading(true)
    setMenuSetupError(null)
    try {
      const isTickets = storefrontUseCase === 'ticketing'
      const categories = isTickets
        ? SAMPLE_TICKET_CATEGORIES
        : storefrontUseCase === 'shop'
          ? SAMPLE_SHOP_CATEGORIES
          : SAMPLE_MENU_CATEGORIES

      const createdCategoryIds: Record<string, string> = {}
      // Create categories first so items can reference them.
      for (let i = 0; i < categories.length; i += 1) {
        const cat = categories[i]
        const res = await axios.post('/api/menu/category', { businessId, name: cat.name, displayOrder: i }, { headers: getAuthHeaders() })
        createdCategoryIds[cat.name] = res.data?.id
      }

      for (let i = 0; i < categories.length; i += 1) {
        const cat = categories[i]
        const categoryId = createdCategoryIds[cat.name]
        for (let j = 0; j < cat.items.length; j += 1) {
          const it = cat.items[j]
          await axios.post(
            '/api/menu/item',
            {
              businessId,
              categoryId,
              name: it.name,
              description: it.description,
              price: it.price,
              cost: it.cost,
              imageUrl: null,
              available: true,
              displayOrder: j
            },
            { headers: getAuthHeaders() }
          )
        }
      }

      setMenuChoice('sample')
    } catch (err) {
      const fallback =
        storefrontUseCase === 'ticketing'
          ? 'Failed to create sample tickets. Please try again.'
          : storefrontUseCase === 'shop'
            ? 'Failed to create sample catalog. Please try again.'
            : 'Failed to create sample menu. Please try again.'
      setMenuSetupError(axios.isAxiosError(err) ? formatUserFacingError(err.response?.data, fallback) : fallback)
    } finally {
      setMenuSetupLoading(false)
    }
  }

  const importSpreadsheetCsv = async (file: File): Promise<void> => {
    if (!businessId) return
    if (!canImportSpreadsheet) {
      setMenuSetupError('Spreadsheet import is available on Scale and above.')
      return
    }
    if (menuSetupLoading) return
    setMenuSetupLoading(true)
    setMenuSetupError(null)
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
      if (lines.length < 2) throw new Error('No rows found')

      const headers = parseCsvLine(lines[0]).map(h => h.toLowerCase())
      const idx = (key: string) => headers.indexOf(key.toLowerCase())

      const get = (row: string[], key: string) => {
        const i = idx(key)
        if (i === -1) return ''
        return row[i] ?? ''
      }

      const categoryKey = idx('category') !== -1 ? 'category' : (idx('category_name') !== -1 ? 'category_name' : 'category')
      const nameKey = idx('name') !== -1 ? 'name' : 'item_name'
      const priceKey = idx('price') !== -1 ? 'price' : 'item_price'

      const rows = lines.slice(1).map((line) => parseCsvLine(line))
      const normalized = rows
        .map((row) => {
          const categoryName = get(row, categoryKey)
          const itemName = get(row, nameKey)
          if (!categoryName || !itemName) return null
          const description = get(row, 'description')
          const priceRaw = get(row, priceKey)
          const costRaw = get(row, 'cost')
          const availableRaw = get(row, 'available')
          const imageUrl = get(row, 'image_url') || get(row, 'imageurl')

          const price = Number(priceRaw)
          const cost = Number(costRaw)
          const available = availableRaw ? !['false', '0', 'no'].includes(String(availableRaw).toLowerCase()) : true

          if (Number.isNaN(price)) return null

          return {
            categoryName,
            itemName,
            description,
            price,
            cost: Number.isNaN(cost) ? 0 : cost,
            available,
            imageUrl: imageUrl || null
          }
        })
        .filter(Boolean) as Array<{
          categoryName: string
          itemName: string
          description: string
          price: number
          cost: number
          available: boolean
          imageUrl: string | null
        }>

      if (!normalized.length) throw new Error('No valid rows found')

      const byCategory = new Map<string, typeof normalized>()
      normalized.forEach((r) => {
        const list = byCategory.get(r.categoryName) || []
        list.push(r)
        byCategory.set(r.categoryName, list)
      })

      const createdCategoryIds: Record<string, string> = {}
      const categoryNames = [...byCategory.keys()]
      for (let i = 0; i < categoryNames.length; i += 1) {
        const name = categoryNames[i]
        const res = await axios.post('/api/menu/category', { businessId, name, displayOrder: i }, { headers: getAuthHeaders() })
        createdCategoryIds[name] = res.data?.id
      }

      const categoryNameArr = categoryNames
      for (let i = 0; i < categoryNameArr.length; i += 1) {
        const catName = categoryNameArr[i]
        const categoryId = createdCategoryIds[catName]
        const items = byCategory.get(catName) || []
        for (let j = 0; j < items.length; j += 1) {
          const it = items[j]
          await axios.post(
            '/api/menu/item',
            {
              businessId,
              categoryId,
              name: it.itemName,
              description: it.description || null,
              price: it.price,
              cost: it.cost || 0,
              imageUrl: it.imageUrl,
              available: it.available,
              displayOrder: j
            },
            { headers: getAuthHeaders() }
          )
        }
      }

      setMenuChoice('spreadsheet')
    } catch (err) {
      setMenuSetupError(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Failed to import spreadsheet. Please try again.')
          : 'Failed to import spreadsheet. Please try again.'
      )
    } finally {
      setMenuSetupLoading(false)
    }
  }

  const importDigitizedMenu = async (categories: DigitizedMenuCategory[]): Promise<void> => {
    if (!businessId) return
    const createdCategoryIds: Record<string, string> = {}

    for (let i = 0; i < categories.length; i += 1) {
      const cat = categories[i]
      const res = await axios.post(
        '/api/menu/category',
        { businessId, name: cat.name, displayOrder: i },
        { headers: getAuthHeaders() }
      )
      const id = res.data?.id as string | undefined
      if (id) createdCategoryIds[cat.name] = id
    }

    for (let i = 0; i < categories.length; i += 1) {
      const cat = categories[i]
      const categoryId = createdCategoryIds[cat.name]
      if (!categoryId) continue
      for (let j = 0; j < cat.items.length; j += 1) {
        const it = cat.items[j]
        await axios.post(
          '/api/menu/item',
          {
            businessId,
            categoryId,
            name: it.name,
            description: it.description || null,
            price: it.price ?? 0,
            cost: 0,
            imageUrl: null,
            available: it.available !== false,
            displayOrder: j
          },
          { headers: getAuthHeaders() }
        )
      }
    }
  }

  const uploadMenuImage = async (file: File): Promise<void> => {
    if (!businessId) return
    if (menuSetupLoading) return
    setMenuSetupLoading(true)
    setMenuSetupError(null)
    setMenuDigitizeSummary(null)
    try {
      const isImage = file.type.startsWith('image/')
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      if (!isImage && !isPdf) {
        throw new Error('Upload a menu photo (JPEG, PNG) or PDF.')
      }

      const form = new FormData()
      form.append('businessId', businessId)
      form.append('file', file)

      const digitizeRes = await axios.post('/api/menu/digitize', form, {
        headers: getAuthHeaders(),
        timeout: 120000
      })

      const categories = digitizeRes.data?.categories as DigitizedMenuCategory[] | undefined
      if (!categories?.length) {
        throw new Error('No menu items were detected. Try a clearer photo with visible prices.')
      }

      await importDigitizedMenu(categories)

      setMenuDigitizeSummary({
        categoryCount: Number(digitizeRes.data?.categoryCount) || categories.length,
        itemCount: Number(digitizeRes.data?.itemCount) || categories.reduce((n, c) => n + c.items.length, 0),
        notes: (digitizeRes.data?.notes as string | null) || null
      })
      if (digitizeRes.data?.quota) {
        setMenuDigitizeQuota(digitizeRes.data.quota)
      }
      setMenuChoice('upload')
    } catch (err) {
      setMenuSetupError(
        axios.isAxiosError(err)
          ? formatUserFacingError(
              err.response?.data,
              storefrontUseCase === 'ticketing'
                ? 'Failed to digitize ticket artwork. Please try again.'
                : 'Failed to digitize menu. Please try again.'
            )
          : (err as Error).message ||
              (storefrontUseCase === 'ticketing'
                ? 'Failed to digitize ticket artwork. Please try again.'
                : 'Failed to digitize menu. Please try again.')
      )
    } finally {
      setMenuSetupLoading(false)
    }
  }

  useEffect(() => {
    const token = getBusinessToken()
    if (!token || !businessId) {
      navigate('/business/login', { replace: true })
      return
    }
    axios
      .get<Business>(`/api/business/${businessId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setBusiness(res.data)
        const plan = res.data?.plan as PlanId | undefined
        if (plan) setBusinessPlan(plan)
        const bm = res.data?.businessMode
        if (bm === 'menu' || bm === 'ticketing' || bm === 'shop') setStorefrontUseCase(bm)
        if (res.data?.bankAccount?.accountName) setShowBankForm(false)
      })
      .catch(() => {})
    axios
      .get<{ code: string; name: string }[]>('/api/banks')
      .then((res) => setBanks(Array.isArray(res.data) ? res.data : []))
      .catch(() => {})
    if (localStorage.getItem(`${ONBOARDING_KEY}_${businessId}`) === '1') {
      navigate(`/business/dashboard/${businessId}`, { replace: true })
    }
  }, [businessId, navigate])

  useEffect(() => {
    if (step === 3) setHighlightIndex(0)
  }, [step, storefrontUseCase])

  useEffect(() => {
    if (step !== 4 || !businessId) return
    axios
      .get<{ quota: typeof menuDigitizeQuota }>(`/api/menu/digitize-quota?businessId=${businessId}`, {
        headers: getAuthHeaders()
      })
      .then((res) => {
        if (res.data?.quota) setMenuDigitizeQuota(res.data.quota)
      })
      .catch(() => {})
  }, [step, businessId])

  useEffect(() => {
    if (step !== 3) return
    const len =
      storefrontUseCase === 'ticketing'
        ? dashboardHighlightsTicketing.length
        : storefrontUseCase === 'shop'
          ? dashboardHighlightsShop.length
          : dashboardHighlights.length
    const t = setInterval(() => {
      setHighlightIndex((i) => (i + 1) % len)
    }, 2200)
    return () => clearInterval(t)
  }, [step, storefrontUseCase])

  const handleNext = async (): Promise<void> => {
    if (step === 2 && businessId && storefrontUseCase) {
      try {
        await axios.patch(
          `/api/business/${businessId}`,
          { businessMode: storefrontUseCase },
          { headers: getAuthHeaders() }
        )
      } catch (err) {
        const msg = axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Could not save your choice. Please try again.')
          : 'Could not save your choice. Please try again.'
        alert(msg)
        return
      }
    }
    if (step < 5) {
      setDirection('out')
      setTimeout(() => {
        setStep(s => s + 1)
        setDirection('in')
      }, 200)
    } else {
      if (businessId) {
        localStorage.setItem(`${ONBOARDING_KEY}_${businessId}`, '1')
        navigate(`/business/dashboard/${businessId}`, { replace: true })
      }
    }
  }

  const handleBack = (): void => {
    if (step > 0) {
      setDirection('out')
      setTimeout(() => {
        setStep(s => s - 1)
        setDirection('in')
      }, 200)
    }
  }

  const canProceed =
    (step === 0 && useCase !== null) ||
    (step === 1 && businessSize !== null) ||
    (step === 2 && storefrontUseCase !== null) ||
    step >= 3
  const hasVerifiedBankAccount = !!business?.bankAccount?.accountName

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center py-12 px-4">
      <div
        className={`w-full max-w-4xl transition-all duration-300 ease-out ${
          direction === 'out' ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'
        }`}
      >
        {/* Progress */}
        <div className="flex justify-center gap-1.5 mb-10">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <div
              key={i}
              className={`h-1 rounded-full transition-all duration-300 ${
                i <= step ? 'w-8 bg-zuri-orange' : 'w-4 bg-gray-200'
              }`}
            />
          ))}
        </div>

        {/* Step 0: How are you planning to use ZURI? */}
        {step === 0 && (
          <div className="animate-fadeIn">
            <h1 className="text-2xl md:text-3xl font-bold text-zuri-black mb-2">
              How are you planning to use ZURI?
            </h1>
            <p className="text-gray-600 mb-8">We&apos;ll tailor your setup experience accordingly.</p>
            <div className="grid gap-4">
              {useCases.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setUseCase(opt.id)}
                  className={`text-left p-5 rounded-2xl border-2 transition-all duration-200 flex items-start gap-4 relative ${
                    useCase === opt.id
                      ? 'border-zuri-orange bg-white shadow-md shadow-zuri-orange/20'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-zuri-black">
                    {opt.id === 'team' && (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                    )}
                    {opt.id === 'business' && (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                    )}
                    {opt.id === 'side' && (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zuri-black">{opt.title}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{opt.description}</p>
                  </div>
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${useCase === opt.id ? 'border-zuri-orange bg-zuri-orange' : 'border-gray-300'}`}>
                    {useCase === opt.id && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 1: Business size */}
        {step === 1 && (
          <div className="animate-fadeIn">
            <h1 className="text-2xl md:text-3xl font-bold text-zuri-black mb-2">
              What&apos;s your business size?
            </h1>
            <p className="text-gray-600 mb-8">We&apos;ll recommend a plan that fits.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              {businessSizes.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setBusinessSize(opt.id)}
                  className={`text-left p-5 rounded-2xl border-2 transition-all duration-200 flex items-start gap-3 relative ${
                    businessSize === opt.id
                      ? 'border-zuri-orange bg-white shadow-md shadow-zuri-orange/20'
                      : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                  }`}
                >
                  <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-zuri-black">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-zuri-black">{opt.title}</p>
                    <p className="text-sm text-gray-600 mt-0.5">{opt.description}</p>
                  </div>
                  <span className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${businessSize === opt.id ? 'border-zuri-orange bg-zuri-orange' : 'border-gray-300'}`}>
                    {businessSize === opt.id && <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Menu vs shop vs ticketing storefront */}
        {step === 2 && (
          <div className="animate-fadeIn">
            <h1 className="text-2xl md:text-3xl font-bold text-zuri-black mb-2">
              What will customers order from you?
            </h1>
            <p className="text-gray-600 mb-8">
              Menus suit restaurants and cafés. Shops use a product catalog. Ticketing is for events and paid entry — you can switch anytime in Account. On{' '}
              <strong>Growth</strong> and above, guests get Zuri Assist on your public storefront when you enable it in the dashboard.
            </p>
            <div className="grid gap-4">
              <button
                type="button"
                onClick={() => setStorefrontUseCase('menu')}
                className={`text-left p-5 rounded-2xl border-2 transition-all duration-200 flex items-start gap-4 ${
                  storefrontUseCase === 'menu'
                    ? 'border-zuri-orange bg-white shadow-md shadow-zuri-orange/20'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-zuri-black text-lg" aria-hidden>
                  ☰
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-zuri-black">Menus & table ordering</p>
                  <p className="text-sm text-gray-600 mt-0.5">Categories, dishes, prep times — the classic Zuri storefront.</p>
                </div>
                <span
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    storefrontUseCase === 'menu' ? 'border-zuri-orange bg-zuri-orange' : 'border-gray-300'
                  }`}
                >
                  {storefrontUseCase === 'menu' && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setStorefrontUseCase('shop')}
                className={`text-left p-5 rounded-2xl border-2 transition-all duration-200 flex items-start gap-4 ${
                  storefrontUseCase === 'shop'
                    ? 'border-zuri-orange bg-white shadow-md shadow-zuri-orange/20'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-zuri-black" aria-hidden>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-zuri-black">Shops & catalog</p>
                  <p className="text-sm text-gray-600 mt-0.5">Sell products from a catalog — more frequent than events, simpler than a full restaurant menu.</p>
                </div>
                <span
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    storefrontUseCase === 'shop' ? 'border-zuri-orange bg-zuri-orange' : 'border-gray-300'
                  }`}
                >
                  {storefrontUseCase === 'shop' && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setStorefrontUseCase('ticketing')}
                className={`text-left p-5 rounded-2xl border-2 transition-all duration-200 flex items-start gap-4 ${
                  storefrontUseCase === 'ticketing'
                    ? 'border-zuri-orange bg-white shadow-md shadow-zuri-orange/20'
                    : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                <span className="flex-shrink-0 w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-zuri-black" aria-hidden>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
                  </svg>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-zuri-black">Tickets & events</p>
                  <p className="text-sm text-gray-600 mt-0.5">Ticket-style checkout for your guests. Your dashboard still uses the same items list (as ticket types).</p>
                </div>
                <span
                  className={`flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                    storefrontUseCase === 'ticketing' ? 'border-zuri-orange bg-zuri-orange' : 'border-gray-300'
                  }`}
                >
                  {storefrontUseCase === 'ticketing' && (
                    <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Dashboard guide with live preview */}
        {step === 3 && (
          <div className="animate-fadeIn">
            <h1 className="text-2xl md:text-3xl font-bold text-zuri-black mb-2">
              Your dashboard at a glance
            </h1>
            <p className="text-gray-600 mb-8">See the main areas and how they work, in a live dashboard preview.</p>
            <div className="flex flex-col md:flex-row gap-6 items-stretch">
              <div className="space-y-3 md:w-2/5">
                {previewHighlights.map((item, i) => (
                  <div
                    key={item.title}
                    className={`p-4 rounded-2xl border-2 transition-all duration-300 ${
                      i === highlightIndex ? 'border-zuri-orange bg-white shadow-md shadow-zuri-orange/20' : 'border-gray-100 bg-white/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold transition-colors ${
                        i === highlightIndex ? 'bg-zuri-orange text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {i + 1}
                      </span>
                      <div>
                        <p className="font-semibold text-zuri-black">{item.title}</p>
                        <p className="text-sm text-gray-600">{item.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Large dashboard preview */}
              <div className="md:w-3/5 rounded-2xl border border-gray-200 bg-white shadow-md p-4 md:p-6 min-h-[260px] md:min-h-[340px] flex flex-col">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {storefrontUseCase === 'ticketing'
                        ? 'Demo event'
                        : storefrontUseCase === 'shop'
                          ? 'Demo shop'
                          : 'Demo restaurant'}
                    </p>
                    <p className="text-[11px] text-gray-500">ZURI dashboard preview</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-400" />
                    <span className="w-2 h-2 rounded-full bg-yellow-400" />
                    <span className="w-2 h-2 rounded-full bg-green-400" />
                  </div>
                </div>
                <div className="rounded-xl border border-gray-200 overflow-hidden bg-white flex-1 flex flex-col">
                  <div className="flex text-[11px] font-medium border-b border-gray-200">
                    {previewNavTabs.map((label) => {
                      const hi = previewHighlights[highlightIndex]
                      const isActive =
                        (label === 'Orders' && hi.title === 'Orders') ||
                        (label === 'Menu' && hi.title === 'Menu') ||
                        (label === 'Catalog' && hi.title === 'Catalog') ||
                        (label === 'Tickets' && hi.title === 'Tickets') ||
                        (label === 'Analytics' && hi.title === 'Analytics') ||
                        (label === 'QR Code' && hi.title === 'QR Code') ||
                        (label === 'Payment' && hi.title === 'Payment & pricing') ||
                        (label === 'Profile' && hi.title === 'Profile')

                      return (
                        <div
                          key={label}
                          className={`flex-1 px-2.5 py-1.5 text-center cursor-default transition-colors ${
                            isActive
                              ? 'bg-zuri-orange/10 text-zuri-orange border-b-2 border-zuri-orange'
                              : 'text-gray-500 hover:text-zuri-black'
                          }`}
                        >
                          {label}
                        </div>
                      )
                    })}
                  </div>
                  <div className="p-3 text-[11px] h-full flex flex-col gap-3">
                    <div className="space-y-2">
                      {/* Orders preview */}
                      <div
                        className={`rounded-lg border px-3 py-2 flex items-center justify-between ${
                          previewHighlights[highlightIndex].title === 'Orders'
                            ? 'border-zuri-orange bg-zuri-orange/20'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-zuri-black text-xs">
                            {storefrontUseCase === 'ticketing' ? 'Order #T4B2' : 'Order #A24F'}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {storefrontUseCase === 'ticketing'
                              ? '2 tickets · ₦18,000'
                              : storefrontUseCase === 'shop'
                                ? '2 products · ₦20,500'
                                : '2 items · ₦4,200'}
                          </p>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 font-medium">
                          {storefrontUseCase === 'ticketing' ? 'awaiting pay' : 'preparing'}
                        </span>
                      </div>

                      {/* Menu / catalog / tickets preview */}
                      <div
                        className={`rounded-lg border px-3 py-2 flex items-center justify-between ${
                          previewHighlights[highlightIndex].title === 'Menu' ||
                          previewHighlights[highlightIndex].title === 'Catalog' ||
                          previewHighlights[highlightIndex].title === 'Tickets'
                            ? 'border-zuri-orange bg-zuri-orange/20'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-zuri-black text-xs">
                            {storefrontUseCase === 'ticketing'
                              ? 'General admission'
                              : storefrontUseCase === 'shop'
                                ? 'Signature tote'
                                : 'Grilled Chicken'}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {storefrontUseCase === 'ticketing'
                              ? '₦5,000 · On sale'
                              : storefrontUseCase === 'shop'
                                ? '₦8,500 · Available'
                                : '₦3,500 · Available'}
                          </p>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                          {catalogLabel}
                        </span>
                      </div>

                      <div
                        className={`rounded-lg border px-3 py-2 flex items-center justify-between ${
                          previewHighlights[highlightIndex].title === 'Analytics'
                            ? 'border-zuri-orange bg-zuri-orange/20'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div>
                          <p className="font-semibold text-zuri-black text-xs">Last 7 days</p>
                          <p className="text-[11px] text-gray-500">₦42k revenue · 38 orders</p>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-zuri-orange/15 text-zuri-orange font-medium">
                          Analytics
                        </span>
                      </div>
                    </div>

                    {/* QR / Payment / Profile row */}
                    <div className="grid grid-cols-3 gap-2 mt-auto">
                      <div
                        className={`rounded-lg border px-2 py-1.5 ${
                          previewHighlights[highlightIndex].title === 'QR Code'
                            ? 'border-zuri-orange bg-zuri-orange/20'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <p className="text-[10px] font-semibold text-zuri-black mb-0.5">QR Code</p>
                        <div className="w-10 h-10 bg-gray-200 rounded-md mx-auto" />
                      </div>
                      <div
                        className={`rounded-lg border px-2 py-1.5 ${
                          previewHighlights[highlightIndex].title === 'Payment & pricing'
                            ? 'border-zuri-orange bg-zuri-orange/20'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <p className="text-[10px] font-semibold text-zuri-black mb-0.5">Payment</p>
                        <p className="text-[10px] text-gray-500">Bank · Plans</p>
                      </div>
                      <div
                        className={`rounded-lg border px-2 py-1.5 ${
                          previewHighlights[highlightIndex].title === 'Profile'
                            ? 'border-zuri-orange bg-zuri-orange/20'
                            : 'border-gray-200 bg-white'
                        }`}
                      >
                        <p className="text-[10px] font-semibold text-zuri-black mb-0.5">Profile</p>
                        <p className="text-[10px] text-gray-500 truncate">Logo · Zuri Tap · password</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

              <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50/70 p-5 md:p-6">
                <h2 className="text-lg font-bold text-zuri-black mb-1">Plans and features</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Each column builds on the one before.{' '}
                  <a href="/pricing" className="text-zuri-orange font-semibold hover:underline">
                    View live pricing →
                  </a>
                </p>
                <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4 max-h-[min(480px,55vh)] overflow-y-auto pr-1">
                  {ZURI_FEATURES_BY_TIER.map((block) => (
                    <div key={block.tier} className="rounded-xl border border-gray-200 bg-white p-4 flex flex-col shadow-sm">
                      <p className="text-xs font-bold uppercase tracking-wide text-zuri-orange">{block.title}</p>
                      <p className="text-xs text-gray-500 mb-3">{block.subtitle}</p>
                      <ul className="text-xs text-gray-700 space-y-1.5 list-disc pl-4 flex-1">
                        {block.bullets.map((b, i) => (
                          <li key={`${block.tier}-${i}`}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-gray-500 mt-4 leading-relaxed">
                  If your account still shows Zuri Plus, you get the same core features as Scale. Contact support if
                  you&apos;d like to switch to the Scale plan name.
                </p>
              </div>
          </div>
        )}

        {/* Step 4: Setup your menu */}
        {step === 4 && (
          <div className="animate-fadeIn">
            <h1 className="text-2xl md:text-3xl font-bold text-zuri-black mb-2">
              {storefrontUseCase === 'ticketing'
                ? 'Set up your tickets'
                : storefrontUseCase === 'shop'
                  ? 'Set up your catalog'
                  : 'Setup your menu'}
            </h1>
            <p className="text-gray-600 mb-8">
              {storefrontUseCase === 'ticketing'
                ? 'Add ticket types and prices the same way you would menu items — you can refine them anytime in your dashboard.'
                : storefrontUseCase === 'shop'
                  ? 'Add products and prices to your catalog — you can refine them anytime in your dashboard.'
                  : "Let's set up and verify your information for seamless experience."}
            </p>

            <div className="rounded-xl border border-zuri-orange/30 bg-zuri-orange/5 px-4 py-3 mb-6">
              <p className="text-xs font-semibold text-zuri-black mb-1.5">
                Your plan today:{' '}
                <span className="text-zuri-orange">{PLAN_LABELS[businessPlan] || 'Free'}</span>
              </p>
              <ul className="text-xs text-gray-700 space-y-1 list-disc pl-4">
                {planHighlights(businessPlan).map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-6">
              <div className="grid md:grid-cols-2 gap-4">
                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="font-semibold text-zuri-black text-sm mb-2">
                    {storefrontUseCase === 'ticketing'
                      ? 'Upload poster or ticket artwork'
                      : storefrontUseCase === 'shop'
                        ? 'Upload a catalog photo or PDF'
                        : 'Upload your menu photo or PDF'}
                  </p>
                  <p className="text-sm text-gray-600 mb-3">
                    {storefrontUseCase === 'ticketing'
                      ? 'Free AI reads your poster or price list and creates editable ticket tiers with prices.'
                      : storefrontUseCase === 'shop'
                        ? 'Free AI reads your product list and creates editable categories, items, and prices.'
                        : 'Free AI reads your menu photo or PDF and creates editable categories, items, and prices.'}
                  </p>
                  {menuDigitizeQuota ? (
                    <p className="text-xs text-gray-500 mb-2">
                      {menuDigitizeQuota.unlimited
                        ? 'Unlimited AI menu uploads on your plan.'
                        : `${menuDigitizeQuota.remaining ?? 0} of ${menuDigitizeQuota.limit} AI uploads remaining`}
                    </p>
                  ) : null}
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                    disabled={
                      menuSetupLoading ||
                      (menuDigitizeQuota != null &&
                        !menuDigitizeQuota.unlimited &&
                        (menuDigitizeQuota.remaining ?? 0) <= 0)
                    }
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      void uploadMenuImage(f)
                      e.target.value = ''
                    }}
                    className="w-full text-sm"
                  />
                  {menuSetupLoading ? (
                    <p className="text-xs text-zuri-orange mt-2 font-semibold animate-pulse">
                      AI is reading your{' '}
                      {storefrontUseCase === 'ticketing'
                        ? 'ticket list'
                        : storefrontUseCase === 'shop'
                          ? 'catalog'
                          : 'menu'}
                      …
                    </p>
                  ) : null}
                  {!canUploadMenuPictures ? (
                    <p className="text-xs text-gray-500 mt-2">
                      Item photos on your menu still require Starter — AI text import is free.
                    </p>
                  ) : null}
                  {menuChoice === 'upload' && menuDigitizeSummary ? (
                    <p className="text-xs text-green-700 mt-2 font-semibold">
                      AI imported {menuDigitizeSummary.categoryCount}{' '}
                      {menuDigitizeSummary.categoryCount === 1 ? 'category' : 'categories'} and{' '}
                      {menuDigitizeSummary.itemCount}{' '}
                      {menuDigitizeSummary.itemCount === 1 ? 'item' : 'items'}. Review prices in your dashboard.
                      {menuDigitizeSummary.notes ? (
                        <span className="block text-gray-600 font-normal mt-1">{menuDigitizeSummary.notes}</span>
                      ) : null}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-gray-200 p-4">
                  <p className="font-semibold text-zuri-black text-sm mb-2">
                    {storefrontUseCase === 'ticketing' ? 'Import ticket types from CSV' : `Import ${catalogNoun} from spreadsheet`}
                  </p>
                  <p className="text-sm text-gray-600 mb-3">Only available on Scale and enterprise.</p>
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    disabled={!canImportSpreadsheet || menuSetupLoading}
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      if (!f) return
                      void importSpreadsheetCsv(f)
                    }}
                    className="w-full text-sm"
                  />
                  <a
                    href="/menu-sample-sheet.csv"
                    className="inline-block text-xs text-zuri-orange hover:underline mt-2"
                  >
                    {storefrontUseCase === 'ticketing'
                      ? 'Download sample CSV (same columns — each row is a ticket type)'
                      : 'Download sample sheet'}
                  </a>
                  {!canImportSpreadsheet ? (
                    <p className="text-xs text-gray-500 mt-2">Upgrade to Scale to import a CSV spreadsheet.</p>
                  ) : null}
                  {menuChoice === 'spreadsheet' ? (
                    <p className="text-xs text-green-700 mt-2 font-semibold">Spreadsheet imported.</p>
                  ) : null}
                </div>

                <div className="rounded-xl border border-gray-200 p-4 md:col-span-2">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div>
                      <p className="font-semibold text-zuri-black text-sm">
                        {storefrontUseCase === 'ticketing'
                          ? 'Create sample tickets'
                          : storefrontUseCase === 'shop'
                            ? 'Create a sample catalog'
                            : 'Create a sample menu'}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        {storefrontUseCase === 'ticketing'
                          ? 'Adds admission tiers and an add-on so you can preview checkout right away.'
                          : storefrontUseCase === 'shop'
                            ? 'Adds a few products so you can preview checkout right away.'
                            : 'Generate a sample menu to streamline the setup process'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void createSampleMenu()}
                      disabled={menuSetupLoading}
                      className="px-5 py-2.5 rounded-xl font-semibold text-sm bg-zuri-orange text-white hover:bg-zuri-orange-dark transition disabled:opacity-50"
                    >
                      {menuSetupLoading
                        ? 'Working…'
                        : storefrontUseCase === 'ticketing'
                          ? 'Create sample tickets'
                          : storefrontUseCase === 'shop'
                            ? 'Create a sample catalog'
                            : 'Create a sample menu'}
                    </button>
                  </div>
                  {menuChoice === 'sample' ? (
                    <p className="text-xs text-green-700 mt-3 font-semibold">
                      {storefrontUseCase === 'ticketing'
                        ? 'Sample tickets created.'
                        : storefrontUseCase === 'shop'
                          ? 'Sample catalog created.'
                          : 'Sample menu created.'}
                    </p>
                  ) : null}
                </div>
              </div>

              {menuSetupError ? (
                <p className="text-sm text-red-600 mt-4 font-semibold">
                  {menuSetupError}
                </p>
              ) : null}

              <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => {
                    setMenuChoice('empty')
                    handleNext()
                  }}
                  className="px-5 py-2.5 rounded-xl font-semibold text-sm border-2 border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition"
                  disabled={menuSetupLoading}
                >
                  Skip for now
                </button>
                <div className="text-xs text-gray-500">
                  {storefrontUseCase === 'ticketing'
                    ? 'Ticket types can be edited anytime in your dashboard.'
                    : storefrontUseCase === 'shop'
                      ? 'Your catalog can be edited anytime in your dashboard.'
                      : 'Your menu can be edited anytime in your dashboard.'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 5: You're all set */}
        {step === 5 && (
          <div className="animate-fadeIn text-center">
            <div className="w-16 h-16 rounded-2xl bg-zuri-orange/20 flex items-center justify-center mx-auto mb-6">
              <svg className="w-8 h-8 text-zuri-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-zuri-black mb-2">
              {hasVerifiedBankAccount ? "You're all set" : 'Verify your payout account'}
            </h1>
            <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
              {hasVerifiedBankAccount
                ? 'Your payout bank is ready. You can head straight to the dashboard and start taking payments.'
                : 'Add your bank and account number now. ZURI checks the account name via Paystack, then asks for your ZURI password before saving so payout details cannot be changed by accident.'}
            </p>

            <div className="max-w-2xl mx-auto rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-sm">
              <div className="rounded-xl border border-zuri-orange/25 bg-zuri-orange/5 p-4 mb-5">
                <p className="text-sm font-semibold text-zuri-black">Current transaction fee</p>
                <p className="text-xs text-gray-600 mt-1">
                  {formatModeTransactionFee(storefrontUseCase || 'menu')}
                </p>
              </div>

              {banks.length === 0 ? (
                <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <p className="text-sm font-semibold text-amber-900">Bank list unavailable</p>
                  <p className="text-xs text-amber-800 mt-1">
                    We couldn&apos;t load banks from Paystack right now. You can continue onboarding and verify your payout account later in Payment &amp; pricing.
                  </p>
                </div>
              ) : null}

              {hasVerifiedBankAccount && !showBankForm ? (
                <div className="rounded-xl border border-zuri-orange/30 bg-zuri-orange/10 p-5">
                  <p className="font-semibold text-zuri-black text-sm">Verified payout account</p>
                  <p className="text-gray-600 text-sm mt-1">
                    {business?.bankAccount?.bankName} — {business?.bankAccount?.accountNumberMasked}
                  </p>
                  <p className="text-gray-600 text-sm">{business?.bankAccount?.accountName}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setShowBankForm(true)
                      setBankForm({ bankCode: '', bankName: '', accountNumber: '', accountName: '' })
                      setBankResolveError(null)
                      setBankFormError(null)
                      setBankPassword('')
                    }}
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
                    setBankFormError(null)
                    if (!businessId || !bankForm.bankCode || !bankForm.bankName || !bankForm.accountNumber.trim() || !bankForm.accountName.trim()) {
                      setBankFormError('Select a bank, enter your account number, and verify so the account name appears before saving.')
                      return
                    }
                    if (!bankPassword.trim()) {
                      setBankFormError('Enter your ZURI business password to confirm this payout account.')
                      return
                    }
                    setBankSaving(true)
                    try {
                      await axios.patch(
                        `/api/business/${businessId}`,
                        {
                          bank_code: bankForm.bankCode,
                          bank_name: bankForm.bankName,
                          account_number: bankForm.accountNumber.trim(),
                          account_name: bankForm.accountName.trim(),
                          password: bankPassword.trim()
                        },
                        { headers: getAuthHeaders() }
                      )
                      const { data } = await axios.get<Business>(`/api/business/${businessId}`, { headers: getAuthHeaders() })
                      setBusiness(data)
                      setBankForm({ bankCode: '', bankName: '', accountNumber: '', accountName: '' })
                      setBankPassword('')
                      setShowBankForm(false)
                      setBankFormError(null)
                      setBankResolveError(null)
                    } catch (err) {
                      if (axios.isAxiosError(err) && err.response?.status === 401) {
                        setBankFormError(
                          formatUserFacingError(err.response?.data, 'That password doesn’t match your ZURI business account. Try again.')
                        )
                      } else if (axios.isAxiosError(err)) {
                        setBankFormError(formatUserFacingError(err.response?.data, 'Couldn’t save bank details. Check your connection and try again.'))
                      } else {
                        setBankFormError('Couldn’t save bank details. Check your connection and try again.')
                      }
                    } finally {
                      setBankSaving(false)
                    }
                  }}
                  className="space-y-4"
                >
                  <div>
                    <label className="block text-sm font-semibold text-zuri-black mb-2">Bank</label>
                    <CustomDropdown
                      options={banks.map((b) => ({ value: b.code, label: b.name }))}
                      value={bankForm.bankCode}
                      onChange={(val, label) => {
                        setBankForm((f) => ({ ...f, bankCode: val, bankName: label }))
                        setBankFormError(null)
                        setBankResolveError(null)
                      }}
                      placeholder="Select bank"
                      searchable
                      disabled={banks.length === 0 || bankSaving}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-zuri-black mb-2">Account number</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={bankForm.accountNumber}
                      onChange={(e) => {
                        setBankForm((f) => ({ ...f, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 16) }))
                        setBankFormError(null)
                        setBankResolveError(null)
                      }}
                      placeholder="8–16 digits (usually 10 for NUBAN)"
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
                          setBankForm((f) => ({ ...f, accountName: data.account_name || '' }))
                        } catch (err: unknown) {
                          const ax = err as { response?: { data?: { error?: string } } }
                          const msg = formatUserFacingError(ax.response?.data, '')
                          setBankResolveError(
                            msg ||
                              'Paystack could not match this account. Double-check the bank and NUBAN, then try Verify again.'
                          )
                        } finally {
                          setBankResolving(false)
                        }
                      }}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-zuri-black text-white text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-50"
                    >
                      {bankResolving ? 'Verifying…' : 'Verify account'}
                    </button>
                    {bankResolveError ? (
                      <p className="text-xs text-red-600 mt-2">{bankResolveError}</p>
                    ) : bankForm.accountName ? (
                      <p className="text-xs text-green-700 mt-2 font-semibold">Account name: {bankForm.accountName}</p>
                    ) : (
                      <p className="text-xs text-gray-500 mt-2">Paystack will return the account name before you save.</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-zuri-black mb-2">Confirm with your ZURI password</label>
                    <input
                      type="password"
                      value={bankPassword}
                      onChange={(e) => {
                        setBankPassword(e.target.value)
                        setBankFormError(null)
                      }}
                      placeholder="Your business login password"
                      className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      We use your ZURI password here instead of OTP to stop unauthorized payout changes.
                    </p>
                  </div>
                  {bankFormError ? <p className="text-sm text-red-600 font-semibold">{bankFormError}</p> : null}
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                    <button
                      type="submit"
                      disabled={bankSaving}
                      className="px-5 py-2.5 rounded-xl font-semibold text-sm bg-zuri-orange text-white hover:bg-zuri-orange-dark transition disabled:opacity-50"
                    >
                      {bankSaving ? 'Saving…' : 'Save payout account'}
                    </button>
                    {hasVerifiedBankAccount ? (
                      <button
                        type="button"
                        onClick={() => setShowBankForm(false)}
                        className="px-5 py-2.5 rounded-xl font-semibold text-sm border border-gray-200 text-gray-700 hover:bg-gray-50 transition"
                      >
                        Cancel
                      </button>
                    ) : null}
                  </div>
                </form>
              ) : null}
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between mt-10">
          <button
            type="button"
            onClick={handleBack}
            className={`text-sm font-medium text-gray-500 hover:text-zuri-orange transition ${step === 0 ? 'invisible' : ''}`}
          >
            Back
          </button>
          <button
            type="button"
            onClick={handleNext}
            disabled={!canProceed && step < 3}
            className="px-6 py-2.5 rounded-xl font-semibold text-sm bg-zuri-orange text-white hover:bg-zuri-orange-dark transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {step === 5
              ? (hasVerifiedBankAccount
                ? 'Go to dashboard'
                : 'Skip for now')
              : 'Continue'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.35s ease-out forwards;
        }
      `}</style>
    </div>
  )
}

export default BusinessOnboarding
