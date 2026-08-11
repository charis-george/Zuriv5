import { useEffect, useState, useRef, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import axios from 'axios'
import io from 'socket.io-client'
import type { Business, StorefrontConfig, StorefrontDetails, StorefrontHeroOverlay, GuestMenuLang, StorefrontProfile } from '../types'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'
import { NoticeModal } from '../components/NoticeModal'
import type { NoticeVariant } from '../components/NoticeModal'
import { DEFAULT_STOREFRONT_CONFIG, getStorefrontTheme, mergeStorefrontConfig } from '../lib/storefrontTheme'
import { StorefrontCustomerLayout } from '../components/storefront/StorefrontCustomerLayout'
import { StorefrontMenuGrid, type StorefrontMenuGridCategory } from '../components/storefront/StorefrontMenuGrid'
import { StorefrontTemplatePicker } from '../components/storefront/StorefrontTemplatePicker'
import { StorefrontFontPairingPicker } from '../components/storefront/StorefrontFontPairingPicker'
import { EventLandingBuilder } from '../components/storefront/EventLandingBuilder'
import { EventLandingView } from '../components/storefront/EventLandingView'
import { StorefrontPreviewChrome } from '../components/storefront/StorefrontPreviewChrome'
import { createDefaultEventPage, eventShareUrl } from '../lib/storefrontEventPages'
import {
  createDefaultStorefrontProfile,
  normalizeStorefrontProfiles,
  storefrontShareUrl,
  slugifyStorefrontName,
  updateProfileInList
} from '../lib/storefrontProfiles'
import { StorefrontProfilePicker } from '../components/storefront/StorefrontProfilePicker'
import { formatZuriEventTitle, formatZuriStorefrontTitle } from '../lib/storefrontSeoTitles'
import type { StorefrontFontPairingId } from '../types'
import { getBusinessToken } from '../lib/businessAuthStorage'
import { formatUserFacingError } from '../lib/formatApiError'
import { normalizeUuidParam } from '../lib/normalizeUuid'
import { isGrowthPlusPlan, isScaleGuestMenuTagPlan } from '../lib/planAccess'

const PREVIEW_MENU: StorefrontMenuGridCategory[] = [
  {
    id: 'p1',
    name: 'Popular picks',
    items: [
      { id: 'a', name: 'Grilled chicken plate', description: 'House marinade with seasonal sides.', price: 4500, available: true },
      { id: 'b', name: 'Garden grain bowl', description: 'Greens, grains, and house dressing.', price: 5200, available: true }
    ]
  },
  {
    id: 'p2',
    name: 'Sides & extras',
    items: [
      { id: 'c', name: 'Crispy wedges', description: 'Golden, lightly seasoned.', price: 1200, available: true },
      { id: 'd', name: 'Chef’s salad', description: 'Ask staff for today’s mix.', price: 2500, available: true }
    ]
  }
]

const PREVIEW_TICKETS: StorefrontMenuGridCategory[] = [
  {
    id: 't1',
    name: 'Admission',
    items: [
      {
        id: 'vip',
        name: 'VIP access',
        description: 'Priority entry, lounge access, and dedicated support line.',
        price: 25000,
        available: true,
        maxPerUser: 4,
        groupSize: 2
      },
      {
        id: 'ga',
        name: 'General admission',
        description: 'Standard entry for the listed date and session.',
        price: 8000,
        available: true,
        maxPerUser: 10
      }
    ]
  },
  {
    id: 't2',
    name: 'Add-ons',
    items: [
      {
        id: 'meet',
        name: 'Meet & greet',
        description: 'Scheduled slot after the main session (limited availability).',
        price: 15000,
        available: true,
        maxPerUser: 2,
        minPerOrder: 1
      }
    ]
  }
]

const PREVIEW_CART_MENU = [
  { id: 'a', name: 'Grilled chicken plate', price: 4500, quantity: 1, available: true },
  { id: 'c', name: 'Crispy wedges', price: 1200, quantity: 2, available: true }
]

const PREVIEW_CART_TICKETS = [
  { id: 'ga', name: 'General admission', price: 8000, quantity: 2, available: true },
  { id: 'meet', name: 'Meet & greet', price: 15000, quantity: 1, available: true }
]


const HERO_OVERLAYS: StorefrontHeroOverlay[] = ['gradient', 'solid', 'dim', 'split']

const WS_URL =
  (import.meta.env.VITE_WS_URL as string) ||
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? 'http://localhost:3000'
    : (typeof window !== 'undefined' ? window.location.origin : ''))

function BusinessStorefrontCustomizer(): JSX.Element {
  const { businessId: rawBusinessId } = useParams<{ businessId: string }>()
  const businessId = normalizeUuidParam(rawBusinessId)
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [business, setBusiness] = useState<Business | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<{ open: boolean; message: string; variant?: NoticeVariant }>({ open: false, message: '' })
  const [config, setConfig] = useState<StorefrontConfig>(DEFAULT_STOREFRONT_CONFIG)
  const [details, setDetails] = useState<StorefrontDetails>({ name: '', tagline: '', cuisineTags: [] })
  const [cuisineTagDraft, setCuisineTagDraft] = useState('')
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [aiPromptInput, setAiPromptInput] = useState('')
  const [aiReferenceFiles, setAiReferenceFiles] = useState<File[]>([])
  const [aiGenerating, setAiGenerating] = useState(false)
  const [aiReasoning, setAiReasoning] = useState<string | null>(null)
  const aiReferenceInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [bannerError, setBannerError] = useState<string | null>(null)
  const previewMenuLang: GuestMenuLang = 'en'
  const [previewGuestDietary, setPreviewGuestDietary] = useState<{
    vegetarian?: boolean
    meatLover?: boolean
    noDairy?: boolean
  }>({})
  const [isPhone, setIsPhone] = useState(false)
  const [mobileTab, setMobileTab] = useState<'customize' | 'preview'>('customize')
  const [customizerPanel, setCustomizerPanel] = useState<'storefront' | 'events'>('storefront')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)
  const [storefrontProfiles, setStorefrontProfiles] = useState<StorefrontProfile[]>([])
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)

  const mergedPreviewConfig = useMemo(() => mergeStorefrontConfig(config), [config])

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const apply = (): void => setIsPhone(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    if (isPhone) setPreviewDevice('mobile')
  }, [isPhone])

  const patchConfig = (patch: Partial<StorefrontConfig>): void => {
    setConfig((s) => ({ ...s, ...patch, menuTemplate: 'custom' }))
  }

  useEffect(() => {
    if (!businessId) return
    const token = getBusinessToken()
    if (!token) {
      navigate('/business/login', { replace: true })
      return
    }
    axios.get<Business>(`/api/business/${businessId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        setBusiness(res.data)
        const profiles = normalizeStorefrontProfiles(res.data)
        setStorefrontProfiles(profiles)
        const initialProfile = profiles.find((p) => p.isDefault) || profiles[0]
        setSelectedProfileId(initialProfile?.id ?? null)
        const cfg = initialProfile?.config ?? (res.data.storefrontConfig && typeof res.data.storefrontConfig === 'object' ? res.data.storefrontConfig : null)
        const dt = initialProfile?.details ?? (res.data.storefrontDetails && typeof res.data.storefrontDetails === 'object' ? res.data.storefrontDetails : null)
        if (cfg) setConfig((prev) => ({ ...prev, ...cfg }))
        const loadedDetails: StorefrontDetails = {
          name: dt?.name || res.data.name || 'Your store',
          tagline: dt?.tagline || 'Fresh, fast, and loved by locals',
          cuisineTags: Array.isArray(dt?.cuisineTags) ? dt.cuisineTags : [],
          contactPhone: dt?.contactPhone || res.data.phone || '',
          instagramHandle: dt?.instagramHandle || '',
          whatsappNumber: dt?.whatsappNumber || '',
          eventPages: Array.isArray(dt?.eventPages) ? dt.eventPages : []
        }
        setDetails(loadedDetails)
        const firstEvent = loadedDetails.eventPages?.[0]
        setSelectedEventId(firstEvent?.id ?? null)
      })
      .finally(() => setLoading(false))
  }, [businessId, navigate])

  const loadProfileIntoEditor = (profile: StorefrontProfile): void => {
    setSelectedProfileId(profile.id)
    setConfig((prev) => ({ ...prev, ...(profile.config ?? {}) }))
    const loadedDetails: StorefrontDetails = {
      name: profile.details?.name || business?.name || 'Your store',
      tagline: profile.details?.tagline || 'Fresh, fast, and loved by locals',
      cuisineTags: Array.isArray(profile.details?.cuisineTags) ? profile.details.cuisineTags : [],
      contactPhone: profile.details?.contactPhone || business?.phone || '',
      instagramHandle: profile.details?.instagramHandle || '',
      whatsappNumber: profile.details?.whatsappNumber || '',
      eventPages: Array.isArray(profile.details?.eventPages) ? profile.details.eventPages : []
    }
    setDetails(loadedDetails)
    setSelectedEventId(loadedDetails.eventPages?.[0]?.id ?? null)
  }

  const handleSelectProfile = (profileId: string): void => {
    const profile = storefrontProfiles.find((p) => p.id === profileId)
    if (!profile) return
    loadProfileIntoEditor(profile)
  }

  const handleAddStorefront = (): void => {
    const next = createDefaultStorefrontProfile(`Storefront ${storefrontProfiles.length + 1}`, {
      isDefault: storefrontProfiles.length === 0
    })
    const updated = [...storefrontProfiles, next]
    setStorefrontProfiles(updated)
    loadProfileIntoEditor(next)
  }

  useEffect(() => {
    if (!businessId) return
    const socket = io(WS_URL)
    socket.emit('join-storefront', businessId)
    socket.on(
      'storefront-updated',
      (payload: {
        config?: unknown
        details?: unknown
        profiles?: StorefrontProfile[]
        profileId?: string | null
        businessMode?: Business['businessMode']
      }) => {
        if (payload.profiles?.length) {
          setStorefrontProfiles(payload.profiles)
          setBusiness((prev) => (prev ? { ...prev, storefrontProfiles: payload.profiles } : prev))
        }
        if (payload.profileId && payload.profileId !== selectedProfileId) return
        setBusiness((prev) => {
          if (!prev) return prev
          return {
            ...prev,
            storefrontConfig: (payload.config as Business['storefrontConfig']) ?? prev.storefrontConfig,
            storefrontDetails: (payload.details as Business['storefrontDetails']) ?? prev.storefrontDetails,
            ...(payload.businessMode === 'menu' ||
            payload.businessMode === 'ticketing' ||
            payload.businessMode === 'shop'
              ? { businessMode: payload.businessMode }
              : {})
          }
        })
        if (payload.config && typeof payload.config === 'object') {
          setConfig((c) => ({ ...c, ...(payload.config as StorefrontConfig) }))
        }
        if (payload.details && typeof payload.details === 'object') {
          setDetails((d) => ({
            ...d,
            ...(payload.details as StorefrontDetails)
          }))
        }
      }
    )
    return () => {
      socket.disconnect()
    }
  }, [businessId, selectedProfileId])

  const previewTheme = getStorefrontTheme(mergedPreviewConfig)

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <PaperPlaneLoader size="lg" />
      </div>
    )
  }

  const canCustomize = isGrowthPlusPlan(business?.plan)
  const aiUsed = Number(business?.storefrontAiGenerations || 0)
  const isGrowth = business?.plan === 'growth'
  const aiUsageLabel = isGrowth
    ? `AI generations used: ${aiUsed}/1 • Remaining: ${Math.max(0, 1 - aiUsed)}`
    : 'AI generations: Unlimited on this plan'

  if (!business || !canCustomize) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-200 p-8 max-w-md w-full">
          <h1 className="text-xl font-bold text-zuri-black mb-2">Upgrade required</h1>
          <p className="text-gray-600 text-sm mb-6">
            Storefront themes, menu layout presets, and full customization are available on Growth and above.
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
              href="/pricing"
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
    const token = getBusinessToken()
    if (!token) return
    const profileId = selectedProfileId || storefrontProfiles[0]?.id
    if (!profileId) return
    const updatedProfiles = updateProfileInList(storefrontProfiles, profileId, { config, details })
    setStorefrontProfiles(updatedProfiles)
    setSaving(true)
    try {
      const { data } = await axios.patch<{
        storefrontProfiles?: StorefrontProfile[]
        storefrontConfig?: Business['storefrontConfig']
        storefrontDetails?: Business['storefrontDetails']
      }>(
        `/api/business/${businessId}/storefront`,
        { profileId, config, details, profiles: updatedProfiles },
        { headers: { Authorization: `Bearer ${token}` } }
      )
      if (data.storefrontProfiles?.length) setStorefrontProfiles(data.storefrontProfiles)
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

  const isTicketing = business.businessMode === 'ticketing'
  const previewEvent =
    (details.eventPages ?? []).find((p) => p.id === selectedEventId) ??
    details.eventPages?.[0] ??
    null
  const previewCategories = isTicketing ? PREVIEW_TICKETS : PREVIEW_MENU
  const previewDisplayPhone = details.contactPhone?.trim() || business?.phone?.trim() || ''
  const previewCart = isTicketing ? PREVIEW_CART_TICKETS : PREVIEW_CART_MENU
  const previewCartItemCount = previewCart.length
  const previewCartTotal = previewCart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const previewAg = mergedPreviewConfig.aiGuest ?? {}
  const storefrontDisplayName = details.name?.trim() || business?.name || 'Your store'
  const previewIsEventPage = isTicketing && customizerPanel === 'events' && !!previewEvent
  const previewPageTitle = previewIsEventPage
    ? formatZuriEventTitle(previewEvent!.title, storefrontDisplayName)
    : formatZuriStorefrontTitle(storefrontDisplayName)
  const selectedProfile =
    storefrontProfiles.find((p) => p.id === selectedProfileId) ?? storefrontProfiles[0] ?? null
  const previewPageUrl = previewIsEventPage && businessId && previewEvent
    ? eventShareUrl(businessId, previewEvent.slug)
    : businessId && selectedProfile
      ? storefrontShareUrl(businessId, selectedProfile, { publicSlug: business?.publicSlug })
      : businessId
        ? `${typeof window !== 'undefined' ? window.location.origin : 'https://zuriqo.com'}/order/${encodeURIComponent(businessId)}`
        : 'https://zuriqo.com/order/…'

  const publishButton = (
    <button
      type="button"
      onClick={saveChanges}
      disabled={saving}
      className="dashboard-btn w-full sm:w-auto bg-zuri-orange text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition-colors disabled:opacity-60"
    >
      {saving ? 'Saving…' : 'Publish changes'}
    </button>
  )

  return (
    <div
      className={
        isPhone
          ? 'min-h-[100dvh] flex flex-col bg-white pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))]'
          : 'h-screen flex flex-col bg-white overflow-hidden'
      }
    >
      <header className="bg-white border-b border-gray-200 shrink-0">
        <div className={`${isPhone ? 'px-4 py-3' : 'max-w-6xl mx-auto px-4 py-4'} flex items-center justify-between gap-2`}>
          <button
            type="button"
            onClick={() => navigate(`/business/dashboard/${businessId}`)}
            className="dashboard-btn text-sm font-medium text-gray-600 hover:text-zuri-orange transition shrink-0"
          >
            {isPhone ? 'Back' : 'Back to dashboard'}
          </button>
          <h1 className={`font-semibold text-zuri-black truncate text-center flex-1 ${isPhone ? 'text-sm' : 'text-lg'}`}>
            {isTicketing ? (isPhone ? 'Tickets' : 'Ticket storefront') : isPhone ? 'Customize' : 'Storefront customization'}
          </h1>
          {!isPhone ? publishButton : <span className="w-12 shrink-0" aria-hidden />}
        </div>
        <div className={`${isPhone ? 'px-4 pb-3' : 'max-w-6xl mx-auto px-4 pb-4'}`}>
          <div className="inline-flex items-center rounded-full border border-zuri-orange/30 bg-zuri-orange/10 px-3 py-1.5 max-w-full">
            <span className="text-xs font-semibold text-zuri-orange truncate">{aiUsageLabel}</span>
          </div>
        </div>
      </header>

      {isPhone ? (
        <div className="storefront-customizer-mobile-tabs" role="tablist" aria-label="Customizer panels">
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'customize'}
            className={`storefront-customizer-mobile-tab dashboard-btn ${mobileTab === 'customize' ? 'storefront-customizer-mobile-tab--active' : ''}`}
            onClick={() => setMobileTab('customize')}
          >
            Customize
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileTab === 'preview'}
            className={`storefront-customizer-mobile-tab dashboard-btn ${mobileTab === 'preview' ? 'storefront-customizer-mobile-tab--active' : ''}`}
            onClick={() => setMobileTab('preview')}
          >
            Live preview
          </button>
        </div>
      ) : null}

      <div
        className={
          isPhone
            ? 'flex-1 min-h-0 flex flex-col overflow-hidden'
            : 'max-w-6xl mx-auto px-4 py-8 grid lg:grid-cols-[360px_1fr] gap-6 flex-1 min-h-0 w-full'
        }
      >
        {(!isPhone || mobileTab === 'customize') && (
        <aside
          className={
            isPhone
              ? 'flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4 space-y-4'
              : 'rounded-2xl border border-gray-200 bg-white shadow-sm p-5 space-y-4 h-fit lg:h-full min-h-0 overflow-y-auto'
          }
        >
          <p className="text-sm text-gray-600">Business: {business?.name || 'N/A'}</p>
          {storefrontProfiles.length > 0 ? (
            <div className="rounded-xl border border-gray-200 bg-zuri-light/50 p-3 space-y-3">
              <StorefrontProfilePicker
                businessId={businessId || ''}
                profiles={storefrontProfiles}
                selectedId={selectedProfileId}
                onSelectId={handleSelectProfile}
                onAdd={handleAddStorefront}
              />
              {selectedProfile && storefrontProfiles.length > 1 ? (
                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Storefront name</label>
                    <input
                      value={selectedProfile.name}
                      onChange={(e) => {
                        const name = e.target.value
                        const slug = slugifyStorefrontName(name || selectedProfile.name)
                        const next = storefrontProfiles.map((p) =>
                          p.id === selectedProfile.id ? { ...p, name, slug, details: { ...p.details, name } } : p
                        )
                        setStorefrontProfiles(next)
                        setDetails((s) => ({ ...s, name }))
                      }}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                    />
                  </div>
                  <p className="text-[10px] text-gray-500 break-all">
                    URL:{' '}
                    {business?.publicSlug && selectedProfile?.isDefault
                      ? `/${business.publicSlug}`
                      : `/order/…/${selectedProfile.slug}`}
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}
          {isTicketing ? (
            <div className="flex rounded-xl border border-gray-200 p-1 bg-gray-50" role="tablist" aria-label="Customizer sections">
              <button
                type="button"
                role="tab"
                aria-selected={customizerPanel === 'storefront'}
                className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${
                  customizerPanel === 'storefront' ? 'bg-white text-zuri-orange shadow-sm' : 'text-gray-600'
                }`}
                onClick={() => setCustomizerPanel('storefront')}
              >
                Storefront
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={customizerPanel === 'events'}
                className={`flex-1 rounded-lg px-2 py-2 text-xs font-semibold transition ${
                  customizerPanel === 'events' ? 'bg-white text-zuri-orange shadow-sm' : 'text-gray-600'
                }`}
                onClick={() => setCustomizerPanel('events')}
              >
                Event pages
              </button>
            </div>
          ) : null}
          {customizerPanel === 'storefront' ? (
          <>
          <div className="rounded-xl border border-gray-200 bg-zuri-light/50 p-3">
            <StorefrontTemplatePicker config={mergedPreviewConfig} onApply={setConfig} />
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
            <p className="text-xs font-semibold text-gray-700">AI storefront designer</p>
            <p className="text-xs text-gray-500 leading-snug">
              Describe the look you want — mood, colors, layout, venue vibe. Upload up to 3 reference images (screenshots, posters, menus).
              Claude applies changes live in the preview. Growth includes one generation; Scale can regenerate anytime.
            </p>
            <textarea
              value={aiPromptInput}
              onChange={(e) => setAiPromptInput(e.target.value)}
              placeholder={'Example: Dark nightclub aesthetic with gold accents, bold typography, wide ticket cards, minimal copy. Inspired by premium event pages.'}
              className="w-full h-28 px-3 py-2 border border-gray-200 rounded-lg text-xs bg-white"
            />
            <input
              ref={aiReferenceInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                const picked = Array.from(e.target.files || []).slice(0, 3)
                setAiReferenceFiles(picked)
              }}
            />
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={() => aiReferenceInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-white"
              >
                {aiReferenceFiles.length ? 'Change references' : 'Upload references'}
              </button>
              {aiReferenceFiles.length > 0 ? (
                <span className="text-[11px] text-gray-500">{aiReferenceFiles.length} image{aiReferenceFiles.length === 1 ? '' : 's'} selected</span>
              ) : null}
              {aiReferenceFiles.length > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setAiReferenceFiles([])
                    if (aiReferenceInputRef.current) aiReferenceInputRef.current.value = ''
                  }}
                  className="text-[11px] text-red-600 font-semibold"
                >
                  Clear
                </button>
              ) : null}
            </div>
            {aiReferenceFiles.length > 0 ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {aiReferenceFiles.map((file) => (
                  <img
                    key={`${file.name}-${file.size}`}
                    src={URL.createObjectURL(file)}
                    alt=""
                    className="h-14 w-20 rounded-lg object-cover border border-gray-200 shrink-0"
                  />
                ))}
              </div>
            ) : null}
            {aiReasoning ? (
              <p className="text-[11px] text-gray-600 bg-white border border-gray-200 rounded-lg px-3 py-2 leading-relaxed">
                <span className="font-semibold text-gray-700">AI:</span> {aiReasoning}
              </p>
            ) : null}
            <button
              type="button"
              disabled={aiGenerating}
              onClick={async () => {
                if (!businessId) return
                const token = getBusinessToken()
                if (!token) return
                const prompt = aiPromptInput.trim()
                if (prompt.length < 12) {
                  setNotice({ open: true, message: 'Describe your design in at least a sentence or two.', variant: 'warning' })
                  return
                }
                setAiGenerating(true)
                setAiReasoning(null)
                try {
                  const formData = new FormData()
                  formData.append('businessId', businessId)
                  formData.append('prompt', prompt)
                  formData.append('storeName', details.name || business?.name || '')
                  formData.append('taglineHint', details.tagline || '')
                  formData.append('currentConfig', JSON.stringify(config))
                  formData.append('currentDetails', JSON.stringify(details))
                  for (const file of aiReferenceFiles) {
                    formData.append('referenceImages', file)
                  }
                  const { data } = await axios.post<{
                    storefrontConfig: StorefrontConfig
                    storefrontDetails: StorefrontDetails
                    reasoning?: string | null
                    generationsRemainingOnGrowth?: number
                    generationsUsed?: number
                  }>(
                    '/api/ai/storefront-generate',
                    formData,
                    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
                  )
                  if (data?.storefrontConfig) setConfig((prev) => ({ ...prev, ...data.storefrontConfig }))
                  if (data?.storefrontDetails) setDetails(data.storefrontDetails)
                  setAiReasoning(data?.reasoning || null)
                  setBusiness((prev) => prev ? { ...prev, storefrontAiGenerations: Number(data?.generationsUsed ?? (prev.storefrontAiGenerations || 0)) } : prev)
                  const remain = Number(data?.generationsRemainingOnGrowth ?? -1)
                  setNotice({
                    open: true,
                    variant: 'success',
                    message: remain >= 0
                      ? `AI design applied live. Growth generations remaining: ${remain}.`
                      : 'AI design applied live. Review and publish when ready.'
                  })
                } catch (err) {
                  setNotice({
                    open: true,
                    variant: 'warning',
                    message: axios.isAxiosError(err)
                      ? formatUserFacingError(err.response?.data, 'Could not generate storefront right now.')
                      : 'Could not generate storefront right now.'
                  })
                } finally {
                  setAiGenerating(false)
                }
              }}
              className="w-full bg-zuri-black text-white px-3 py-2 rounded-lg text-xs font-semibold hover:bg-gray-800 transition disabled:opacity-60"
            >
              {aiGenerating ? 'Claude is designing your storefront…' : 'Apply AI design live'}
            </button>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Store name</label>
            <input
              value={details.name}
              onChange={(e) => setDetails((s) => ({ ...s, name: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <p className="text-[10px] text-gray-500 mt-1 truncate" title={formatZuriStorefrontTitle(details.name || business?.name || 'Your store')}>
              Browser tab &amp; shares: {formatZuriStorefrontTitle(details.name || business?.name || 'Your store')}
            </p>
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
            <label className="block text-xs font-semibold text-gray-500 mb-1">Hero tags</label>
            <p className="text-[11px] text-gray-500 mb-2 leading-snug">
              Optional labels on your hero banner (e.g. Grill, Vegan, Live music). Up to 8 — leave empty to hide them.
            </p>
            {(details.cuisineTags?.length ?? 0) > 0 ? (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {details.cuisineTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-700"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() =>
                        setDetails((s) => ({
                          ...s,
                          cuisineTags: (s.cuisineTags ?? []).filter((t) => t !== tag)
                        }))
                      }
                      className="text-gray-400 hover:text-gray-700 leading-none"
                      aria-label={`Remove ${tag}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <input
                value={cuisineTagDraft}
                onChange={(e) => setCuisineTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  const tag = cuisineTagDraft.trim()
                  if (!tag) return
                  setDetails((s) => {
                    const existing = s.cuisineTags ?? []
                    if (existing.length >= 8) return s
                    if (existing.some((t) => t.toLowerCase() === tag.toLowerCase())) return s
                    return { ...s, cuisineTags: [...existing, tag] }
                  })
                  setCuisineTagDraft('')
                }}
                placeholder="Add a tag"
                disabled={(details.cuisineTags?.length ?? 0) >= 8}
                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm disabled:opacity-50"
              />
              <button
                type="button"
                disabled={!cuisineTagDraft.trim() || (details.cuisineTags?.length ?? 0) >= 8}
                onClick={() => {
                  const tag = cuisineTagDraft.trim()
                  if (!tag) return
                  setDetails((s) => {
                    const existing = s.cuisineTags ?? []
                    if (existing.length >= 8) return s
                    if (existing.some((t) => t.toLowerCase() === tag.toLowerCase())) return s
                    return { ...s, cuisineTags: [...existing, tag] }
                  })
                  setCuisineTagDraft('')
                }}
                className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold bg-zuri-black text-white hover:bg-gray-800 transition disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-3">
            <p className="text-xs font-semibold text-gray-700">Contact & social</p>
            <p className="text-[11px] text-gray-500 leading-snug">Shown on your storefront header and event pages (replaces the default placeholder).</p>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Phone</label>
              <input
                value={details.contactPhone ?? ''}
                onChange={(e) => setDetails((s) => ({ ...s, contactPhone: e.target.value }))}
                placeholder={business?.phone || 'e.g. 0803 123 4567'}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Instagram</label>
              <div className="flex items-center gap-1">
                <span className="text-sm text-gray-400">@</span>
                <input
                  value={details.instagramHandle ?? ''}
                  onChange={(e) => setDetails((s) => ({ ...s, instagramHandle: e.target.value.replace(/^@/, '') }))}
                  placeholder="yourvenue"
                  className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">WhatsApp</label>
              <input
                value={details.whatsappNumber ?? ''}
                onChange={(e) => setDetails((s) => ({ ...s, whatsappNumber: e.target.value }))}
                placeholder="2348012345678"
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white"
              />
            </div>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <StorefrontFontPairingPicker
              config={mergedPreviewConfig}
              onSelect={(id: StorefrontFontPairingId) => patchConfig({ fontFamily: id })}
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
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 space-y-2">
            <p className="text-xs font-semibold text-gray-700">Hero banner image</p>
            <p className="text-[11px] text-gray-500 leading-snug">
              Optional wide photo behind your store name (JPEG, PNG, WebP or GIF, max 4 MB). Tint follows your hero overlay above.
            </p>
            {config.heroBannerUrl ? (
              <div className="relative h-24 rounded-lg overflow-hidden border border-gray-200 bg-gray-200">
                <img src={config.heroBannerUrl} alt="" className="w-full h-full object-cover" />
              </div>
            ) : null}
            <input
              ref={bannerInputRef}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file || !businessId) return
                const token = getBusinessToken()
                if (!token) return
                setBannerError(null)
                setBannerUploading(true)
                try {
                  const formData = new FormData()
                  formData.append('banner', file)
                  const { data } = await axios.post<{ heroBannerUrl: string; storefrontConfig: StorefrontConfig }>(
                    `/api/business/${businessId}/upload-storefront-banner`,
                    formData,
                    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' } }
                  )
                  const next = data.storefrontConfig
                  if (next && typeof next === 'object') {
                    const full = mergeStorefrontConfig(next)
                    setConfig((c) => ({ ...c, ...full }))
                    setBusiness((prev) => (prev ? { ...prev, storefrontConfig: full } : prev))
                  } else if (data.heroBannerUrl) {
                    setConfig((c) => ({ ...c, heroBannerUrl: data.heroBannerUrl }))
                    setBusiness((prev) =>
                      prev
                        ? {
                            ...prev,
                            storefrontConfig: mergeStorefrontConfig({
                              ...(prev.storefrontConfig || {}),
                              heroBannerUrl: data.heroBannerUrl
                            })
                          }
                        : prev
                    )
                  }
                  setNotice({ open: true, message: 'Banner uploaded. It is live on your storefront.', variant: 'success' })
                } catch (err: unknown) {
                  setBannerError(axios.isAxiosError(err) ? formatUserFacingError(err.response?.data, 'Upload failed') : 'Upload failed')
                } finally {
                  setBannerUploading(false)
                  if (bannerInputRef.current) bannerInputRef.current.value = ''
                }
              }}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={bannerUploading}
                onClick={() => bannerInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-300 text-gray-700 hover:bg-white disabled:opacity-50"
              >
                {bannerUploading ? 'Uploading…' : config.heroBannerUrl ? 'Replace banner' : 'Upload banner'}
              </button>
              {config.heroBannerUrl ? (
                <button
                  type="button"
                  disabled={bannerUploading}
                  onClick={async () => {
                    if (!businessId) return
                    const token = getBusinessToken()
                    if (!token) return
                    setBannerError(null)
                    setBannerUploading(true)
                    try {
                      const { data } = await axios.delete<{ storefrontConfig: StorefrontConfig }>(
                        `/api/business/${businessId}/storefront-banner`,
                        { headers: { Authorization: `Bearer ${token}` } }
                      )
                      const next = data.storefrontConfig
                      if (next && typeof next === 'object') {
                        setConfig((c) => {
                          const { heroBannerUrl: _omit, ...rest } = c
                          return { ...rest, ...next }
                        })
                        setBusiness((prev) => (prev ? { ...prev, storefrontConfig: next } : prev))
                      } else {
                        setConfig((c) => {
                          const { heroBannerUrl: _omit, ...rest } = c
                          return rest
                        })
                        setBusiness((prev) => {
                          if (!prev?.storefrontConfig || typeof prev.storefrontConfig !== 'object') return prev
                          const { heroBannerUrl: _o, ...rest } = prev.storefrontConfig
                          return { ...prev, storefrontConfig: rest }
                        })
                      }
                      setNotice({ open: true, message: 'Banner removed.', variant: 'success' })
                    } catch (err: unknown) {
                      setBannerError(axios.isAxiosError(err) ? formatUserFacingError(err.response?.data, 'Could not remove') : 'Could not remove')
                    } finally {
                      setBannerUploading(false)
                    }
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                >
                  Remove banner
                </button>
              ) : null}
            </div>
            {bannerError ? <p className="text-xs text-red-600">{bannerError}</p> : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => patchConfig({ backgroundTone: 'light' })} className={`px-3 py-2 rounded-lg text-sm border ${config.backgroundTone === 'light' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>Light</button>
            <button type="button" onClick={() => patchConfig({ backgroundTone: 'warm' })} className={`px-3 py-2 rounded-lg text-sm border ${config.backgroundTone === 'warm' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>Warm</button>
            <button type="button" onClick={() => patchConfig({ backgroundTone: 'dark' })} className={`px-3 py-2 rounded-lg text-sm border col-span-2 ${config.backgroundTone === 'dark' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>Dark</button>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Layout</label>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => patchConfig({ gridStyle: 'two_col', cardLayout: 'stacked' })} className={`px-2 py-1.5 rounded-lg text-xs border ${config.gridStyle === 'two_col' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>2 Col</button>
              <button type="button" onClick={() => patchConfig({ gridStyle: 'row_list', cardLayout: 'horizontal' })} className={`px-2 py-1.5 rounded-lg text-xs border ${config.gridStyle === 'row_list' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>List</button>
              <button type="button" onClick={() => patchConfig({ gridStyle: 'wide_cards', cardLayout: 'stacked' })} className={`px-2 py-1.5 rounded-lg text-xs border ${config.gridStyle === 'wide_cards' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>Wide</button>
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
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show calories</span>
            <input type="checkbox" checked={config.showCalories} onChange={(e) => patchConfig({ showCalories: e.target.checked })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-700">Show ratings</span>
            <input type="checkbox" checked={config.showRatings} onChange={(e) => patchConfig({ showRatings: e.target.checked })} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Card size ({config.cardSize.toFixed(2)}x)</label>
            <input type="range" min={0.85} max={1.15} step={0.05} value={config.cardSize} onChange={(e) => patchConfig({ cardSize: Number(e.target.value) })} className="w-full" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1">Card content layout</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => patchConfig({ cardLayout: 'stacked' })} className={`px-2 py-1.5 rounded-lg text-xs border ${config.cardLayout === 'stacked' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>Stacked</button>
              <button type="button" onClick={() => patchConfig({ cardLayout: 'horizontal' })} className={`px-2 py-1.5 rounded-lg text-xs border ${config.cardLayout === 'horizontal' ? 'border-zuri-orange text-zuri-orange' : 'border-gray-200 text-gray-600'}`}>Horizontal</button>
            </div>
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
          </>
          ) : (
            <div className="space-y-4">
              <EventLandingBuilder
                businessId={businessId || ''}
                businessName={business?.name}
                details={details}
                selectedId={selectedEventId}
                onSelectId={setSelectedEventId}
                onChange={(eventPages) => setDetails((s) => ({ ...s, eventPages }))}
                storefrontProfiles={storefrontProfiles}
                activeStorefrontId={selectedProfileId}
              />
              {!details.eventPages?.length ? (
                <button
                  type="button"
                  className="w-full rounded-xl border border-dashed border-zuri-orange/50 text-zuri-orange text-xs font-semibold py-3 hover:bg-zuri-orange/5"
                  onClick={() => {
                    const evt = createDefaultEventPage('Launch night')
                    setDetails((s) => ({ ...s, eventPages: [evt] }))
                    setSelectedEventId(evt.id)
                  }}
                >
                  Create your first event page
                </button>
              ) : null}
            </div>
          )}
        </aside>
        )}

        {(!isPhone || mobileTab === 'preview') && (
        <div className={isPhone ? 'flex-1 min-h-0 flex flex-col px-4 py-3' : 'h-full min-h-0'}>
          <div
            className={
              isPhone
                ? 'rounded-2xl border border-gray-200 shadow-sm bg-gray-100 flex-1 min-h-0 overflow-hidden flex flex-col'
                : 'rounded-2xl border border-gray-200 shadow-sm bg-gray-100 h-full overflow-hidden flex flex-col'
            }
          >
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between gap-2 shrink-0">
              <p className="text-sm font-semibold text-zuri-black">
                {isPhone ? 'Preview' : 'Preview (matches live)'}
                {isTicketing && customizerPanel === 'events' ? ' · Event page' : ''}
              </p>
              <div className="flex items-center gap-2 shrink-0">
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

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
              <div
                className={
                  previewDevice === 'mobile' || isPhone
                    ? 'mx-auto w-full max-w-[390px] min-h-full overflow-y-auto'
                    : 'h-full'
                }
              >
                <StorefrontPreviewChrome pageTitle={previewPageTitle} url={previewPageUrl}>
                {isTicketing && customizerPanel === 'events' && previewEvent && business ? (
                  <EventLandingView
                    event={previewEvent}
                    config={mergedPreviewConfig}
                    details={details}
                    business={{ id: businessId || '', name: business.name, logoUrl: business.logoUrl, phone: business.phone }}
                    ticketItems={PREVIEW_TICKETS.flatMap((cat) =>
                      cat.items.map((it) => ({ ...it, categoryName: cat.name }))
                    )}
                    cartQtyById={Object.fromEntries(PREVIEW_CART_TICKETS.map((c) => [c.id, c.quantity]))}
                    onQtyChange={() => undefined}
                    brandColor={mergedPreviewConfig.brandColor}
                    previewMode
                    showShare={false}
                  />
                ) : (
                <StorefrontCustomerLayout
                  embedded
                  config={mergedPreviewConfig}
                  details={details}
                  businessNameFallback={business?.name || 'Your store'}
                  logoUrl={business?.logoUrl}
                  phone={previewDisplayPhone || undefined}
                  headerRight={
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <div className="text-right min-w-[48px]">
                        <p className="text-[11px]" style={{ color: previewTheme.sub }}>{isTicketing ? 'Selection' : 'Cart'}</p>
                        <p className="text-sm font-bold" style={{ color: previewTheme.text }}>{previewCartItemCount}</p>
                      </div>
                      <div
                        className="rounded-xl px-3 py-2 border text-sm font-bold"
                        style={{
                          backgroundColor: `${mergedPreviewConfig.brandColor}14`,
                          borderColor: `${mergedPreviewConfig.brandColor}44`,
                          color: mergedPreviewConfig.brandColor
                        }}
                      >
                        ₦{previewCartTotal.toFixed(2)}
                      </div>
                    </div>
                  }
                >
                  <div className={`grid gap-6 ${isPhone ? 'grid-cols-1' : 'lg:grid-cols-3 gap-8'}`}>
                    <div className={isPhone ? '' : 'lg:col-span-2'}>
                      {!isTicketing &&
                      (previewAg.dietaryPromptEnabled !== false ||
                        previewAg.localPaymentHints) ? (
                        <div
                          className="mb-6 rounded-2xl border p-4 sm:p-5"
                          style={{ background: previewTheme.panel, borderColor: previewTheme.border }}
                        >
                          <p className="text-xs font-semibold mb-3" style={{ color: previewTheme.sub }}>
                            Personalise this menu
                          </p>
                          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
                            {previewAg.dietaryPromptEnabled !== false ? (
                              <div className="flex-1">
                                <p className="text-[11px] font-medium mb-1.5" style={{ color: previewTheme.sub }}>
                                  Taste preferences (preview)
                                </p>
                                <div className="flex flex-wrap gap-2">
                                  {(
                                    [
                                      ['vegetarian', 'Vegetarian-forward'],
                                      ['meatLover', 'Meat lover'],
                                      ['noDairy', 'No dairy']
                                    ] as const
                                  ).map(([key, label]) => (
                                    <button
                                      key={key}
                                      type="button"
                                      onClick={() =>
                                        setPreviewGuestDietary((d) => ({
                                          ...d,
                                          [key]: !d[key]
                                        }))
                                      }
                                      className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                                        previewGuestDietary[key]
                                          ? 'border-zuri-orange bg-zuri-orange/15 text-zuri-orange'
                                          : 'border-gray-200 text-gray-600'
                                      }`}
                                      style={{ background: previewGuestDietary[key] ? undefined : previewTheme.page }}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                          {previewAg.localPaymentHints ? (
                            <p className="text-[11px] mt-3 leading-relaxed" style={{ color: previewTheme.sub }}>
                              Pay securely by card here. Your host may also offer MoMo or bank transfer for the bill — ask before you checkout.
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                      <StorefrontMenuGrid
                        config={mergedPreviewConfig}
                        categories={previewCategories}
                        variant={isTicketing ? 'ticketing' : 'menu'}
                        businessId={businessId || ''}
                        onItemClick={(item) => {
                          void item
                        }}
                        showQuickPicks={!isTicketing}
                        trendingItemIds={[]}
                        upsellSeedIds={[]}
                        activeMenuLang={previewMenuLang}
                        menuTranslations={details.menuTranslations}
                        guestDietaryPrefs={previewGuestDietary}
                        scaleGuestMenuTags={
                          !!(business?.scaleGuestMenuTags ?? isScaleGuestMenuTagPlan(business?.plan))
                        }
                        reorderHintItemIds={[]}
                      />
                    </div>
                    <div className={isPhone ? 'order-first' : 'lg:col-span-1'}>
                      <div
                        className={`rounded-2xl border p-4 sm:p-6 ${isPhone ? '' : 'lg:sticky lg:top-24'}`}
                        style={{ background: previewTheme.panel, borderColor: previewTheme.border }}
                      >
                        <div className="flex items-center justify-between gap-3 mb-4">
                          <h2 className="text-lg font-bold" style={{ color: previewTheme.text }}>
                            {isTicketing ? 'Your tickets' : 'Order summary'}
                          </h2>
                          {!isTicketing ? (
                            <a
                              href={businessId ? `/reserve/${businessId}` : '/reserve'}
                              className="border border-zuri-orange text-zuri-orange px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-zuri-orange hover:text-white transition whitespace-nowrap"
                              style={{ background: previewTheme.panel }}
                            >
                              Book a table
                            </a>
                          ) : (
                            <span className="text-[11px] font-medium px-2 py-1 rounded-lg border" style={{ borderColor: previewTheme.border, color: previewTheme.sub }}>
                              Receipt after pay
                            </span>
                          )}
                        </div>

                        <div className="space-y-3 mb-6 max-h-80 overflow-y-auto" style={{ borderColor: previewTheme.border }}>
                          {previewCart.map((item) => (
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
                            <span className="font-semibold" style={{ color: previewTheme.text }}>₦{previewCartTotal.toFixed(2)}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-bold" style={{ color: previewTheme.text }}>Total</span>
                            <span className="text-lg font-bold" style={{ color: config.priceTextColor || config.brandColor }}>
                              ₦{previewCartTotal.toFixed(2)}
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
                            value={previewDisplayPhone || 'Your phone'}
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
                            {isTicketing ? 'Continue to checkout' : 'Place order'}
                          </button>
                        </form>
                      </div>
                    </div>
                  </div>
                </StorefrontCustomerLayout>
                )}
                </StorefrontPreviewChrome>
              </div>
            </div>
          </div>
        </div>
        )}
      </div>

      {isPhone ? (
        <div className="storefront-customizer-mobile-publish">{publishButton}</div>
      ) : null}

      <NoticeModal open={notice.open} message={notice.message} variant={notice.variant} onClose={() => setNotice((s) => ({ ...s, open: false }))} />
    </div>
  )
}

export default BusinessStorefrontCustomizer
