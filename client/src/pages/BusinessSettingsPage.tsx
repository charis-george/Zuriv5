import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Business, type ReceiptEmailConfig } from '../types'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'
import { apiUrl } from '../lib/apiBase'
import { clearBusinessAuth, getBusinessToken } from '../lib/businessAuthStorage'
import { formatUserFacingError } from '../lib/formatApiError'
import { normalizeUuidParam } from '../lib/normalizeUuid'
import { canonicalStorefrontUrl } from '../lib/storefrontProfiles'

const BTN_PRESS = 'dashboard-btn'

const DEFAULT_RECEIPT: ReceiptEmailConfig = {
  accentColor: '#ffbd59',
  subjectTemplate: '',
  headerTitle: '',
  greeting: '',
  footerText: '',
  showLogo: true,
  showZuriBadge: true
}

function BusinessSettingsPage(): JSX.Element {
  const { businessId: rawBusinessId } = useParams<{ businessId: string }>()
  const businessId = normalizeUuidParam(rawBusinessId)
  const navigate = useNavigate()

  const getAuthHeaders = () => {
    const t = getBusinessToken()
    return t ? { Authorization: `Bearer ${t}` } : {}
  }

  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [agentEnabled, setAgentEnabled] = useState(false)
  const [agentForwardingNumber, setAgentForwardingNumber] = useState<string | null>(null)
  const [agentAllowedDraft, setAgentAllowedDraft] = useState('')
  const [agentStaffDraft, setAgentStaffDraft] = useState('')
  const [agentWindowDraft, setAgentWindowDraft] = useState('20')
  const [terminalIdDraft, setTerminalIdDraft] = useState('')
  const [agentSaving, setAgentSaving] = useState(false)
  const [agentError, setAgentError] = useState<string | null>(null)
  const [agentMessage, setAgentMessage] = useState<string | null>(null)

  const [slugDraft, setSlugDraft] = useState('')
  const [slugStatus, setSlugStatus] = useState<string | null>(null)
  const [slugSaving, setSlugSaving] = useState(false)
  const [slugError, setSlugError] = useState<string | null>(null)

  const [emailCfg, setEmailCfg] = useState<ReceiptEmailConfig>(DEFAULT_RECEIPT)
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailMessage, setEmailMessage] = useState<string | null>(null)

  useEffect(() => {
    if (!businessId) return
    const token = getBusinessToken()
    if (!token) {
      navigate('/business/login', { replace: true })
      return
    }
    const headers = getAuthHeaders()
    Promise.all([
      axios.get<Business>(apiUrl(`/api/business/${businessId}`), { headers }),
      axios.get<{
        paymentAgentEnabled: boolean
        agentForwardingNumber: string | null
        matchWindowMinutes: number
        agentStaffMsisdn: string | null
        agentAllowedMsisdns: string[]
        paystackTerminalId?: string | null
        terminalApiReady?: boolean
      }>(apiUrl('/api/agent/settings'), { headers })
    ])
      .then(([bizRes, agentRes]) => {
        setBusiness(bizRes.data)
        setSlugDraft(bizRes.data.publicSlug || '')
        setEmailCfg({
          ...DEFAULT_RECEIPT,
          ...(bizRes.data.receiptEmailConfig || {}),
          accentColor:
            bizRes.data.receiptEmailConfig?.accentColor ||
            bizRes.data.storefrontConfig?.brandColor ||
            DEFAULT_RECEIPT.accentColor
        })
        const agent = agentRes.data
        setAgentEnabled(Boolean(agent.paymentAgentEnabled ?? bizRes.data.paymentAgentEnabled))
        setAgentForwardingNumber(agent.agentForwardingNumber || bizRes.data.agentForwardingNumber || null)
        setAgentAllowedDraft((agent.agentAllowedMsisdns || bizRes.data.agentAllowedMsisdns || []).join(', '))
        setAgentStaffDraft(agent.agentStaffMsisdn || bizRes.data.agentStaffMsisdn || '')
        setAgentWindowDraft(String(agent.matchWindowMinutes ?? bizRes.data.matchWindowMinutes ?? 20))
        setTerminalIdDraft(agent.paystackTerminalId || bizRes.data.paystackTerminalId || '')
        setLoadError(null)
        setLoading(false)
      })
      .catch((err) => {
        if (err.response?.status === 401) {
          clearBusinessAuth()
          navigate('/business/login', { replace: true })
        } else {
          console.error(err)
          setLoadError(
            axios.isAxiosError(err)
              ? formatUserFacingError(err.response?.data, 'Could not load settings.')
              : 'Could not load settings.'
          )
          setLoading(false)
        }
      })
  }, [businessId, navigate])

  const saveAgentSettings = async (enabledOverride?: boolean) => {
    if (!businessId) return
    const enabled = enabledOverride !== undefined ? enabledOverride : agentEnabled
    setAgentError(null)
    setAgentMessage(null)
    setAgentSaving(true)
    try {
      const { data } = await axios.post(
        apiUrl('/api/agent/enable'),
        {
          enabled,
          allowedMsisdns: agentAllowedDraft,
          staffMsisdn: agentStaffDraft || undefined,
          matchWindowMinutes: Number(agentWindowDraft) || 20,
          paystackTerminalId: terminalIdDraft.trim() || null
        },
        { headers: getAuthHeaders() }
      )
      setAgentEnabled(Boolean(data.paymentAgentEnabled))
      setAgentForwardingNumber(data.agentForwardingNumber || null)
      setAgentAllowedDraft((data.agentAllowedMsisdns || []).join(', '))
      setAgentStaffDraft(data.agentStaffMsisdn || '')
      setAgentWindowDraft(String(data.matchWindowMinutes ?? 20))
      setTerminalIdDraft(data.paystackTerminalId || '')
      setBusiness((prev) =>
        prev
          ? {
              ...prev,
              paymentAgentEnabled: Boolean(data.paymentAgentEnabled),
              agentForwardingNumber: data.agentForwardingNumber || null,
              agentAllowedMsisdns: data.agentAllowedMsisdns || [],
              agentStaffMsisdn: data.agentStaffMsisdn || null,
              matchWindowMinutes: data.matchWindowMinutes ?? 20,
              paystackTerminalId: data.paystackTerminalId || null
            }
          : prev
      )
      if (enabledOverride !== undefined) {
        setAgentMessage(data.paymentAgentEnabled ? 'Payment matching is on.' : 'Payment matching is off.')
      } else {
        setAgentMessage('Assist settings saved.')
      }
    } catch (err) {
      if (enabledOverride !== undefined) {
        // Revert optimistic toggle if enable/disable failed
        setAgentEnabled(!enabledOverride)
      }
      setAgentError(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Could not update Zuri Assist.')
          : 'Could not update Zuri Assist.'
      )
    } finally {
      setAgentSaving(false)
    }
  }

  const checkSlugAvailability = async (): Promise<void> => {
    setSlugError(null)
    setSlugStatus(null)
    try {
      const { data } = await axios.get<{ available: boolean; slug: string | null; reason: string | null }>(
        apiUrl(`/api/business/slug-available?slug=${encodeURIComponent(slugDraft)}`),
        { headers: getAuthHeaders() }
      )
      if (data.available) setSlugStatus(`Available: zuriqo.com/${data.slug}`)
      else setSlugStatus(data.reason === 'taken' ? 'That URL is taken.' : 'Invalid or reserved name.')
    } catch {
      setSlugError('Could not check availability.')
    }
  }

  const savePublicSlug = async (): Promise<void> => {
    if (!businessId) return
    setSlugSaving(true)
    setSlugError(null)
    setSlugStatus(null)
    try {
      const { data } = await axios.patch(
        apiUrl(`/api/business/${businessId}`),
        { publicSlug: slugDraft },
        { headers: getAuthHeaders() }
      )
      setBusiness((prev) => (prev ? { ...prev, publicSlug: data.publicSlug || null } : prev))
      setSlugDraft(data.publicSlug || '')
      setSlugStatus(`Saved: ${canonicalStorefrontUrl(businessId, data.publicSlug)}`)
    } catch (err) {
      setSlugError(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Could not save storefront URL.')
          : 'Could not save storefront URL.'
      )
    } finally {
      setSlugSaving(false)
    }
  }

  const saveEmailConfig = async (): Promise<void> => {
    if (!businessId) return
    setEmailSaving(true)
    setEmailError(null)
    setEmailMessage(null)
    try {
      const { data } = await axios.patch(
        apiUrl(`/api/business/${businessId}`),
        { receiptEmailConfig: emailCfg },
        { headers: getAuthHeaders() }
      )
      const next = data.receiptEmailConfig || emailCfg
      setEmailCfg({ ...DEFAULT_RECEIPT, ...next })
      setBusiness((prev) => (prev ? { ...prev, receiptEmailConfig: next } : prev))
      setEmailMessage('Guest email branding saved.')
    } catch (err) {
      setEmailError(
        axios.isAxiosError(err)
          ? formatUserFacingError(err.response?.data, 'Could not save email settings.')
          : 'Could not save email settings.'
      )
    } finally {
      setEmailSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <PaperPlaneLoader size="lg" />
      </div>
    )
  }

  if (!businessId || !business) {
    return (
      <div className="min-h-screen bg-[#f7f7f5] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-zuri-black mb-2">
            {loadError ? 'Could not load settings' : 'Invalid page'}
          </h1>
          <p className="text-gray-500 text-sm mb-6">
            {loadError || 'Please log in again.'}
          </p>
          <button
            type="button"
            onClick={() => navigate(loadError && businessId ? `/business/dashboard/${businessId}` : '/business/login')}
            className={`dashboard-btn inline-block bg-zuri-orange text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition ${BTN_PRESS}`}
          >
            {loadError && businessId ? 'Back to dashboard' : 'Log in'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5]">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(`/business/dashboard/${businessId}`)}
              className={`dashboard-btn flex items-center justify-center h-10 w-10 rounded-xl border border-gray-100 bg-white text-zuri-black hover:bg-gray-50 transition ${BTN_PRESS}`}
              aria-label="Back to dashboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 truncate">
                {business.name}
              </p>
              <h1 className="text-lg font-bold text-zuri-black leading-tight">Settings</h1>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h2 className="text-sm font-semibold text-zuri-black">Storefront link</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Choose a short link guests can open, like zuriqo.com/your-business. Links you already shared still work.
          </p>
        </div>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Your storefront link
          </label>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1 flex items-center rounded-xl border border-gray-200 overflow-hidden">
              <span className="px-3 text-xs text-gray-400 bg-gray-50 border-r border-gray-200 whitespace-nowrap">
                zuriqo.com/
              </span>
              <input
                type="text"
                value={slugDraft}
                onChange={(e) => setSlugDraft(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                placeholder="your-business"
                className="flex-1 px-3 py-2.5 text-sm text-zuri-black focus:outline-none"
              />
            </div>
            <button
              type="button"
              onClick={() => void checkSlugAvailability()}
              className={`dashboard-btn px-4 py-2.5 rounded-xl text-sm font-semibold border border-gray-200 bg-white hover:bg-gray-50 ${BTN_PRESS}`}
            >
              Check
            </button>
            <button
              type="button"
              disabled={slugSaving || !slugDraft.trim()}
              onClick={() => void savePublicSlug()}
              className={`dashboard-btn px-4 py-2.5 rounded-xl text-sm font-semibold bg-zuri-black text-white hover:bg-gray-800 disabled:opacity-50 ${BTN_PRESS}`}
            >
              {slugSaving ? 'Saving…' : 'Save URL'}
            </button>
          </div>
          <p className="text-xs text-gray-500">
            Current:{' '}
            <a
              className="text-zuri-orange font-medium hover:underline"
              href={canonicalStorefrontUrl(businessId, business.publicSlug)}
              target="_blank"
              rel="noreferrer"
            >
              {canonicalStorefrontUrl(businessId, business.publicSlug)}
            </a>
          </p>
          {slugStatus ? <p className="text-sm text-emerald-700">{slugStatus}</p> : null}
          {slugError ? <p className="text-sm text-red-700">{slugError}</p> : null}
        </section>

        <div>
          <h2 className="text-sm font-semibold text-zuri-black">Guest email</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Brand order and ticket emails buyers receive after payment. In the subject, type {'{business}'} for your
            name or {'{ref}'} for the order reference.
          </p>
        </div>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Accent color
              </label>
              <input
                type="color"
                value={emailCfg.accentColor || '#ffbd59'}
                onChange={(e) => setEmailCfg((c) => ({ ...c, accentColor: e.target.value }))}
                className="h-10 w-full rounded-xl border border-gray-200 bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Subject template
              </label>
              <input
                type="text"
                value={emailCfg.subjectTemplate}
                onChange={(e) => setEmailCfg((c) => ({ ...c, subjectTemplate: e.target.value }))}
                placeholder="Your ticket — {business}"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/30"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Header title
              </label>
              <input
                type="text"
                value={emailCfg.headerTitle}
                onChange={(e) => setEmailCfg((c) => ({ ...c, headerTitle: e.target.value }))}
                placeholder="Your ticket"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/30"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Greeting
              </label>
              <input
                type="text"
                value={emailCfg.greeting}
                onChange={(e) => setEmailCfg((c) => ({ ...c, greeting: e.target.value }))}
                placeholder="Thanks for your order!"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/30"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                Footer text
              </label>
              <textarea
                value={emailCfg.footerText}
                onChange={(e) => setEmailCfg((c) => ({ ...c, footerText: e.target.value }))}
                rows={2}
                placeholder="See you soon!"
                className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/30"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={emailCfg.showLogo}
                onChange={(e) => setEmailCfg((c) => ({ ...c, showLogo: e.target.checked }))}
              />
              Show business logo
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={emailCfg.showZuriBadge}
                onChange={(e) => setEmailCfg((c) => ({ ...c, showZuriBadge: e.target.checked }))}
              />
              Show ZURI badge
            </label>
          </div>
          <div
            className="rounded-xl border p-4 text-sm"
            style={{ borderColor: `${emailCfg.accentColor}55`, background: '#fffaf2' }}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-2">Preview</p>
            <p className="font-semibold" style={{ color: emailCfg.accentColor }}>
              {emailCfg.headerTitle || 'Your ticket'}
            </p>
            <p className="text-gray-600 mt-1">{emailCfg.greeting || 'Hi there,'}</p>
            <p className="text-xs text-gray-500 mt-3">{emailCfg.footerText || `Thanks for choosing ${business.name}.`}</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <button
              type="button"
              disabled={emailSaving}
              onClick={() => void saveEmailConfig()}
              className={`dashboard-btn px-5 py-2.5 rounded-xl text-sm font-semibold bg-zuri-orange text-white hover:bg-zuri-orange-dark disabled:opacity-50 ${BTN_PRESS}`}
            >
              {emailSaving ? 'Saving…' : 'Save email branding'}
            </button>
            {emailError ? <p className="text-sm text-red-700">{emailError}</p> : null}
            {emailMessage && !emailError ? <p className="text-sm text-emerald-700">{emailMessage}</p> : null}
          </div>
        </section>

        <div>
          <h2 className="text-sm font-semibold text-zuri-black">Payments</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Automate bank SMS matching and Paystack Terminal POS charges with Zuri Assist.
          </p>
        </div>

        <section className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-zuri-black">Zuri Assist</h3>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                    agentEnabled
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-100'
                      : 'bg-gray-50 text-gray-500 border border-gray-100'
                  }`}
                >
                  {agentEnabled ? 'On' : 'Off'}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1 leading-relaxed max-w-xl">
                Forward Moniepoint or OPay payment SMS to Zuri. Clear matches mark the order paid; unclear ones appear
                in Orders for a quick confirm.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={agentEnabled}
              aria-label={agentEnabled ? 'Turn Assist off' : 'Turn Assist on'}
              disabled={agentSaving}
              onClick={() => {
                setAgentEnabled(!agentEnabled)
                void saveAgentSettings(!agentEnabled)
              }}
              className={`shrink-0 relative inline-flex h-7 w-12 items-center rounded-full transition disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-zuri-orange/40 ${
                agentEnabled ? 'bg-zuri-orange' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
                  agentEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="px-5 py-5 space-y-5">
            <div className="rounded-xl bg-[#f7f7f5] border border-gray-100 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1">
                Forward SMS to
              </p>
              {agentForwardingNumber ? (
                <p className="text-base font-bold text-zuri-black tracking-wide tabular-nums">
                  {agentForwardingNumber}
                </p>
              ) : (
                <p className="text-sm text-amber-800">
                  Forwarding number not ready yet. Contact Zuri support to finish setup.
                </p>
              )}
              {!agentEnabled && agentForwardingNumber ? (
                <p className="text-xs text-gray-500 mt-1">
                  Turn Assist on, then save your trusted phone numbers to start matching.
                </p>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                  Phones allowed to forward alerts
                </label>
                <input
                  type="text"
                  value={agentAllowedDraft}
                  onChange={(e) => setAgentAllowedDraft(e.target.value)}
                  placeholder="0803…, 0809…"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-zuri-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-zuri-orange/30 focus:border-zuri-orange"
                />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Only SMS from these numbers is trusted. Comma-separated.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                  Staff SMS number
                </label>
                <input
                  type="text"
                  value={agentStaffDraft}
                  onChange={(e) => setAgentStaffDraft(e.target.value)}
                  placeholder="Same as business phone is fine"
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-zuri-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-zuri-orange/30 focus:border-zuri-orange"
                />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  Gets payment confirmations and “needs review” alerts.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                  Match window (minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  max={180}
                  value={agentWindowDraft}
                  onChange={(e) => setAgentWindowDraft(e.target.value)}
                  className="w-full max-w-[8rem] rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-zuri-black focus:outline-none focus:ring-2 focus:ring-zuri-orange/30 focus:border-zuri-orange"
                />
                <p className="text-[11px] text-gray-500 mt-1.5">
                  How far back to look for a matching pending order.
                </p>
              </div>

              <div className="sm:col-span-2 rounded-xl border border-gray-100 bg-[#f7f7f5] px-4 py-4 space-y-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    Paystack Terminal (POS)
                  </p>
                  <p className="text-xs text-gray-600 mt-1 leading-relaxed">
                    Link your Paystack Terminal to send unpaid Zuri orders to the device. When the guest pays on the
                    terminal, the order is marked paid automatically.
                  </p>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                    Terminal ID
                  </label>
                  <input
                    type="text"
                    value={terminalIdDraft}
                    onChange={(e) => setTerminalIdDraft(e.target.value)}
                    placeholder="Terminal ID from your Paystack account"
                    className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-zuri-black placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-zuri-orange/30 focus:border-zuri-orange"
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
              <button
                type="button"
                disabled={agentSaving}
                onClick={() => void saveAgentSettings()}
                className={`dashboard-btn px-5 py-2.5 rounded-xl text-sm font-semibold bg-zuri-black text-white hover:bg-gray-800 disabled:opacity-50 transition ${BTN_PRESS}`}
              >
                {agentSaving ? 'Saving…' : 'Save Assist settings'}
              </button>
              {agentError ? (
                <p className="text-sm text-red-700">{agentError}</p>
              ) : null}
              {agentMessage && !agentError ? (
                <p className="text-sm text-emerald-700">{agentMessage}</p>
              ) : null}
            </div>
          </div>
        </section>

        <p className="text-xs text-gray-400 text-center sm:text-left pb-8">
          Password and account details stay in your dashboard profile menu.
        </p>
      </div>
    </div>
  )
}

export default BusinessSettingsPage
