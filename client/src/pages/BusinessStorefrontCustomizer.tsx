import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import type { Business, StorefrontConfig, StorefrontDetails, StorefrontHeroOverlay } from '../types'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'
import { NoticeModal } from '../components/NoticeModal'
import type { NoticeVariant } from '../components/NoticeModal'
import { DEFAULT_STOREFRONT_CONFIG, getStorefrontTheme } from '../lib/storefrontTheme'
import { StorefrontCustomerLayout } from '../components/storefront/StorefrontCustomerLayout'
import { StorefrontMenuGrid, type StorefrontMenuGridCategory } from '../components/storefront/StorefrontMenuGrid'

const PREVIEW_MENU: StorefrontMenuGridCategory[] = [
  {
    id: 'p1',
    name: 'Popular picks',
    items: [
      { id: 'a', name: 'Jollof & grilled chicken', description: 'Smoky rice with house marinade.', price: 4500, available: true },
      { id: 'b', name: 'Afro grain bowl', description: 'Greens, grains, and pepper sauce.', price: 5200, available: true }
    ]
  },
  {
    id: 'p2',
    name: 'Sides & extras',
    items: [
      { id: 'c', name: 'Plantain wedges', description: 'Crispy sweet plantain.', price: 1200, available: true },
      { id: 'd', name: 'Chef’s salad', description: 'Ask staff for today’s mix.', price: 2500, available: true }
    ]
  }
]

const PREVIEW_CART = [
  { id: 'a', name: 'Jollof & grilled chicken', price: 4500, quantity: 1, available: true },
  { id: 'c', name: 'Plantain wedges', price: 1200, quantity: 2, available: true }
]

const PREVIEW_CART_ITEM_COUNT = PREVIEW_CART.length
const PREVIEW_CART_TOTAL = PREVIEW_CART.reduce((sum, item) => sum + item.price * item.quantity, 0)

const HERO_OVERLAYS: StorefrontHeroOverlay[] = ['gradient', 'solid', 'dim', 'split']

function BusinessStorefrontCustomizer(): JSX.Element {
  const { businessId } = useParams<{ businessId: string }>()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [business, setBusiness] = useState<Business | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ open: boolean; message: string; variant?: NoticeVariant }>({ open: false, message: '' })
  const [config, setConfig] = useState<StorefrontConfig>(DEFAULT_STOREFRONT_CONFIG)
  const [details, setDetails] = useState<StorefrontDetails>({ name: '', tagline: '', cuisineTags: ['African', 'Fast food'] })
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')

  useEffect(() => {
    if (!businessId) return
    const token = localStorage.getItem('zuri_business_token')
    if (!token) {
      navigate('/business/login', { replace: true })
      return
    }
    axios.get<Business>(`/api/business/${businessId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setBusiness(res.data)
        const cfg = res.data.storefrontConfig && typeof res.data.storefrontConfig === 'object' ? res.data.storefrontConfig : null
        const dt = res.data.storefrontDetails && typeof res.data.storefrontDetails === 'object' ? res.data.storefrontDetails : null
        if (cfg) setConfig((prev) => ({ ...prev, ...cfg }))
        setDetails({
          name: dt?.name || res.data.name || 'Your store',
          tagline: dt?.tagline || 'Fresh, fast, and loved by locals',
          cuisineTags: Array.isArray(dt?.cuisineTags) && dt?.cuisineTags.length ? dt.cuisineTags : ['African', 'Fast food']
        })
      })
      .finally(() => setLoading(false))
  }, [businessId, navigate])

  const previewTheme = getStorefrontTheme(config)

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <PaperPlaneLoader size="lg" />
      </div>
    )
  }

  const canCustomize =
    !!business?.plan &&
    ['growth', 'pro', 'zuri_plus', 'enterprise'].includes(business.plan)

  if (!business || !canCustomize) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full">
          <h1 className="text-xl font-bold text-zuri-black mb-2">Upgrade required</h1>
          <p className="text-gray-600 text-sm mb-6">
            Storefront customization is available on Growth and above.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={() => navigate(`/business/dashboard/${businessId}`)}
              className="px-4 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              Back to dashboard
            </button>
            <a
              href="/#pricing"
              className="px-4 py-2 rounded-xl bg-zuri-orange text-white text-sm font-semibold hover:bg-zuri-orange-dark transition text-center"
            >
              View plans
            </a>
          </div>
        </div>
      </div>
    )
  }

  const saveChanges = async (): Promise<void> => {
    if (!businessId) return
    const token = localStorage.getItem('zuri_business_token')
    if (!token) return
    setSaving(true)
    try {
      await axios.patch(
        `/api/business/${businessId}/storefront`,
        { config, details },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      setNotice({ open: true, message: 'Storefront changes published.', variant: 'success' })
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setNotice({ open: true, message: 'Upgrade to Growth or above to use storefront customization.', variant: 'warning' })
      } else {
        setNotice({ open: true, message: 'Could not save changes.', variant: 'error' })
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <button type="button" onClick={() => navigate(`/business/dashboard/${businessId}`)} className="text-sm font-medium text-gray-600 hover:text-zuri-orange transition">
            Back to dashboard
          </button>
          <h1 className="text-lg font-semibold text-zuri-black">Storefront customization</h1>
          <button
            type="button"
            onClick={saveChanges}
            disabled={saving}
            className="bg-zuri-orange text-white px-3 py-2 rounded-lg text-[13px] leading-none font-semibold hover:bg-zuri-orange-dark transition-colors disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Publish'}
          </button>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-4 py-8 grid lg:grid-cols-[360px_1fr] gap-6 h-[calc(100dvh-78px)]">
        <aside className="rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-4 h-fit lg:h-full min-h-0 overflow-y-auto">
          <p className="text-sm text-gray-600">Business: {business?.name || 'N/A'}</p>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Store name</label>
            <input
              value={details.name}
              onChange={(e) => setDetails((s) => ({ ...s, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Tagline</label>
            <input
              value={details.tagline}
              onChange={(e) => setDetails((s) => ({ ...s, tagline: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Brand color</label>
            <input
              type="color"
              value={config.brandColor}
              onChange={(e) => setConfig((s) => ({ ...s, brandColor: e.target.value }))}
              className="w-full h-10 p-1 border border-gray-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Price / accent text</label>
            <input
              type="color"
              value={config.priceTextColor}
              onChange={(e) => setConfig((s) => ({ ...s, priceTextColor: e.target.value }))}
              className="w-full h-10 p-1 border border-gray-200 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Hero overlay</label>
            <div className="grid grid-cols-2 gap-2">
              {HERO_OVERLAYS.map((o) => (
                <button
                  key={o}
                  type="button"
                  onClick={() => setConfig((s) => ({ ...s, heroOverlay: o }))}
                  className={`px-2 py-1.5 rounded-lg text-xs border capitalize ${
                    config.heroOverlay === o ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => setConfig((s) => ({ ...s, backgroundTone: 'light' }))} className={`px-3 py-2 rounded-lg text-sm border ${config.backgroundTone === 'light' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>Light</button>
            <button type="button" onClick={() => setConfig((s) => ({ ...s, backgroundTone: 'warm' }))} className={`px-3 py-2 rounded-lg text-sm border ${config.backgroundTone === 'warm' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>Warm</button>
            <button type="button" onClick={() => setConfig((s) => ({ ...s, backgroundTone: 'dark' }))} className={`px-3 py-2 rounded-lg text-sm border col-span-2 ${config.backgroundTone === 'dark' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>Dark</button>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Layout</label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setConfig((s) => ({ ...s, gridStyle: 'two_col' }))} className={`px-2 py-1.5 rounded-lg text-xs border ${config.gridStyle === 'two_col' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>2 Col</button>
              <button type="button" onClick={() => setConfig((s) => ({ ...s, gridStyle: 'row_list' }))} className={`px-2 py-1.5 rounded-lg text-xs border ${config.gridStyle === 'row_list' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>List</button>
              <button type="button" onClick={() => setConfig((s) => ({ ...s, gridStyle: 'wide_cards' }))} className={`px-2 py-1.5 rounded-lg text-xs border ${config.gridStyle === 'wide_cards' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>Wide</button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Card radius ({config.cardRadius}px)</label>
            <input type="range" min={8} max={28} value={config.cardRadius} onChange={(e) => setConfig((s) => ({ ...s, cardRadius: Number(e.target.value) }))} className="w-full" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Card gap ({config.cardGap}px)</label>
            <input type="range" min={8} max={24} value={config.cardGap} onChange={(e) => setConfig((s) => ({ ...s, cardGap: Number(e.target.value) }))} className="w-full" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Item font scale ({config.menuItemFontScale.toFixed(1)}x)</label>
            <input type="range" min={0.9} max={1.2} step={0.05} value={config.menuItemFontScale} onChange={(e) => setConfig((s) => ({ ...s, menuItemFontScale: Number(e.target.value) }))} className="w-full" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Font family</label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => setConfig((s) => ({ ...s, fontFamily: 'sans' }))} className={`px-2 py-1.5 rounded-lg text-xs border ${config.fontFamily === 'sans' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>Sans</button>
              <button type="button" onClick={() => setConfig((s) => ({ ...s, fontFamily: 'serif' }))} className={`px-2 py-1.5 rounded-lg text-xs border ${config.fontFamily === 'serif' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>Serif</button>
              <button type="button" onClick={() => setConfig((s) => ({ ...s, fontFamily: 'mono' }))} className={`px-2 py-1.5 rounded-lg text-xs border ${config.fontFamily === 'mono' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>Mono</button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Hero height ({config.heroHeight}px)</label>
            <input type="range" min={160} max={320} value={config.heroHeight} onChange={(e) => setConfig((s) => ({ ...s, heroHeight: Number(e.target.value) }))} className="w-full" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Title size ({config.titleSize}px)</label>
            <input type="range" min={24} max={48} value={config.titleSize} onChange={(e) => setConfig((s) => ({ ...s, titleSize: Number(e.target.value) }))} className="w-full" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show descriptions</span>
            <input type="checkbox" checked={config.showDescriptions} onChange={(e) => setConfig((s) => ({ ...s, showDescriptions: e.target.checked }))} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show photos</span>
            <input type="checkbox" checked={config.showPhotos} onChange={(e) => setConfig((s) => ({ ...s, showPhotos: e.target.checked }))} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Section titles</label>
            <div className="grid grid-cols-3 gap-2">
              {(['underlined', 'uppercase', 'chip'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setConfig((s) => ({ ...s, sectionTitleTreatment: t }))}
                  className={`px-2 py-1.5 rounded-lg text-xs border capitalize ${
                    config.sectionTitleTreatment === t ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Card shadow</label>
            <div className="grid grid-cols-3 gap-2">
              {(['flat', 'soft', 'deep'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setConfig((s) => ({ ...s, shadowDepth: d }))}
                  className={`px-2 py-1.5 rounded-lg text-xs border capitalize ${
                    config.shadowDepth === d ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Category divider</label>
            <div className="grid grid-cols-2 gap-2">
              {(['none', 'soft', 'bold', 'dotted'] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setConfig((s) => ({ ...s, dividerStyle: d }))}
                  className={`px-2 py-1.5 rounded-lg text-xs border capitalize ${
                    config.dividerStyle === d ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Category strip border</span>
            <input
              type="checkbox"
              checked={config.categoryStripBorder}
              onChange={(e) => setConfig((s) => ({ ...s, categoryStripBorder: e.target.checked }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Photo shape</label>
            <div className="grid grid-cols-3 gap-2">
              {(['square', 'rounded', 'circle'] as const).map((sh) => (
                <button
                  key={sh}
                  type="button"
                  onClick={() => setConfig((s) => ({ ...s, cardImageShape: sh }))}
                  className={`px-2 py-1.5 rounded-lg text-xs border capitalize ${
                    config.cardImageShape === sh ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {sh}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Tag / chip shape</label>
            <div className="grid grid-cols-3 gap-2">
              {(['pill', 'rectangle', 'underline'] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setConfig((s) => ({ ...s, pillShape: p }))}
                  className={`px-2 py-1.5 rounded-lg text-xs border capitalize ${
                    config.pillShape === p ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="lg:sticky lg:top-6 h-full">
          <div className="rounded-2xl border border-gray-200 shadow-sm bg-gray-100 h-full overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-zuri-black">Live preview</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPreviewDevice('desktop')}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                    previewDevice === 'desktop'
                      ? 'border-zuri-orange text-zuri-orange bg-zuri-orange/10'
                      : 'border-gray-200 text-gray-600 hover:bg-white'
                  }`}
                >
                  Desktop
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewDevice('mobile')}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition ${
                    previewDevice === 'mobile'
                      ? 'border-zuri-orange text-zuri-orange bg-zuri-orange/10'
                      : 'border-gray-200 text-gray-600 hover:bg-white'
                  }`}
                >
                  Mobile
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <div className={previewDevice === 'mobile' ? 'mx-auto w-[390px] max-w-full h-full overflow-hidden' : 'h-full'}>
                <StorefrontCustomerLayout
                  embedded
                  config={config}
                  details={details}
                  businessNameFallback={business?.name || 'Your store'}
                  logoUrl={business?.logoUrl}
                  phone={business?.phone || undefined}
                  showPreviewBadge
                  headerRight={
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <div className="text-right min-w-[48px]">
                        <p className="text-[11px]" style={{ color: previewTheme.sub }}>Cart</p>
                        <p className="text-sm font-bold" style={{ color: previewTheme.text }}>{PREVIEW_CART_ITEM_COUNT}</p>
                      </div>
                      <div
                        className="rounded-xl px-3 py-2 border text-sm font-bold"
                        style={{
                          backgroundColor: `${config.brandColor}14`,
                          borderColor: `${config.brandColor}44`,
                          color: config.brandColor
                        }}
                      >
                        ₦{PREVIEW_CART_TOTAL.toFixed(2)}
                      </div>
                    </div>
                  }
                >
                  <div className="grid lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-2">
                      <StorefrontMenuGrid config={config} categories={PREVIEW_MENU} onItemClick={(item) => { void item }} />
                    </div>
                    <div className="lg:col-span-1">
                      <div
                        className="rounded-2xl border p-6 lg:sticky lg:top-24"
                        style={{ background: previewTheme.panel, borderColor: previewTheme.border }}
                      >
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <h2 className="text-lg font-bold" style={{ color: previewTheme.text }}>Order summary</h2>
                          <a
                            href={businessId ? `/reserve/${businessId}` : '/reserve'}
                            className="border border-zuri-orange text-zuri-orange px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-zuri-orange hover:text-white transition whitespace-nowrap"
                            style={{ background: previewTheme.panel }}
                          >
                            Book a table
                          </a>
                        </div>

                        <div className="space-y-3 mb-6 max-h-80 overflow-y-auto" style={{ borderColor: previewTheme.border }}>
                          {PREVIEW_CART.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center justify-between py-3 border-b"
                              style={{ borderColor: previewTheme.border }}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-semibold text-sm truncate" style={{ color: previewTheme.text }}>{item.name}</p>
                                <p className="text-xs" style={{ color: previewTheme.sub }}>₦{item.price.toFixed(2)} each</p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium"
                                  style={{ background: previewTheme.page, color: previewTheme.text }}
                                >
                                  −
                                </button>
                                <span className="font-semibold text-sm w-6 text-center" style={{ color: previewTheme.text }}>
                                  {item.quantity}
                                </span>
                                <button
                                  type="button"
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-medium"
                                  style={{ background: previewTheme.page, color: previewTheme.text }}
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  className="ml-1 text-red-500 hover:text-red-700 text-sm"
                                  aria-label="Remove"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>

                        <div className="pt-4 mb-6 border-t" style={{ borderColor: previewTheme.border }}>
                          <div className="flex justify-between items-center mb-4">
                            <span className="text-sm" style={{ color: previewTheme.sub }}>Subtotal</span>
                            <span className="font-semibold" style={{ color: previewTheme.text }}>₦{PREVIEW_CART_TOTAL.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-bold" style={{ color: previewTheme.text }}>Total</span>
                            <span className="text-lg font-bold" style={{ color: config.priceTextColor || config.brandColor }}>
                              ₦{PREVIEW_CART_TOTAL.toFixed(2)}
                            </span>
                          </div>
                        </div>

                        <form onSubmit={(e) => e.preventDefault()} className="space-y-3">
                          <input
                            type="text"
                            placeholder="Your name *"
                            value="Preview customer"
                            readOnly
                            className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                            style={{ borderColor: previewTheme.border, background: previewTheme.panel, color: previewTheme.text }}
                          />
                          <input
                            type="tel"
                            placeholder="Phone *"
                            value="0800 000 0000"
                            readOnly
                            className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                            style={{ borderColor: previewTheme.border, background: previewTheme.panel, color: previewTheme.text }}
                          />
                          <input
                            type="email"
                            placeholder="Email *"
                            value="preview@example.com"
                            readOnly
                            className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                            style={{ borderColor: previewTheme.border, background: previewTheme.panel, color: previewTheme.text }}
                          />
                          <button
                            type="submit"
                            className="w-full text-white py-1.5 rounded-lg text-sm hover:opacity-95 transition"
                            style={{ background: config.brandColor }}
                          >
                            Place order
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                </StorefrontCustomerLayout>
              </div>
            </div>
          </div>
        </div>
      </div>
      <NoticeModal open={notice.open} message={notice.message} variant={notice.variant} onClose={() => setNotice((s) => ({ ...s, open: false }))} />
    </div>
  )
}

export default BusinessStorefrontCustomizer
