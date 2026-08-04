import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Business } from '../types'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'
import { apiUrl } from '../lib/apiBase'
import { clearBusinessAuth, getBusinessToken } from '../lib/businessAuthStorage'
import { formatUserFacingError } from '../lib/formatApiError'
import { normalizeUuidParam } from '../lib/normalizeUuid'

const BTN_PRESS = 'dashboard-btn'

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
                Forward Moniepoint or OPay SMS to Zuri. Strong matches mark the order paid;
                unclear ones land in a one-tap queue on Orders.
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
                  Turn Assist on, then save your allowlist to start matching.
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
                  Gets confirmations and ambiguous-match alerts.
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
                    Link your Paystack Terminal to push unpaid Zuri orders to the device. When the guest pays on the
                    terminal, Paystack notifies Zuri and the order is marked paid — no SMS parsing needed.
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
                    placeholder="From Paystack Dashboard → Terminals"
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
