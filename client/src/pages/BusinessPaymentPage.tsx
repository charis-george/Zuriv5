import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Business, PLAN_PRICES, PLAN_PRICES_YEARLY, PLAN_LABELS, YEARLY_DISCOUNT_PCT, type BillingInterval } from '../types'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'
import { CustomDropdown } from '../components/CustomDropdown'
import { useDialog } from '../components/DialogProvider'
import { apiUrl } from '../lib/apiBase'
import { clearBusinessAuth, getBusinessToken } from '../lib/businessAuthStorage'
import { formatUserFacingError } from '../lib/formatApiError'
import { normalizeUuidParam } from '../lib/normalizeUuid'
import { preloadZuriPayment, startZuriPayment } from '../lib/zuriPayment'
import { formatModeTransactionFee } from '../lib/transactionFees'

const PLAN_BLURBS: Record<'starter' | 'growth' | 'scale', string> = {
  starter: 'Photos, logo, and higher AI credits',
  growth: 'Analytics, Tap, customizer & guest AI',
  scale: 'Unlimited AI + Assist ops insights'
}

function BusinessPaymentPage(): JSX.Element {
  const dialog = useDialog()
  const { businessId: rawBusinessId } = useParams<{ businessId: string }>()
  const businessId = normalizeUuidParam(rawBusinessId)
  const navigate = useNavigate()

  const getAuthHeaders = () => {
    const t = getBusinessToken()
    return t ? { Authorization: `Bearer ${t}` } : {}
  }

  const [business, setBusiness] = useState<Business | null>(null)
  const [loading, setLoading] = useState(true)
  const [banks, setBanks] = useState<{ code: string; name: string }[]>([])
  const [bankForm, setBankForm] = useState({ bankCode: '', bankName: '', accountNumber: '', accountName: '' })
  const [bankResolving, setBankResolving] = useState(false)
  const [bankResolveError, setBankResolveError] = useState<string | null>(null)
  const [bankPassword, setBankPassword] = useState('')
  const [bankSaving, setBankSaving] = useState(false)
  const [showBankForm, setShowBankForm] = useState(true)
  const [bankFormError, setBankFormError] = useState<string | null>(null)
  const [upgradeLoading, setUpgradeLoading] = useState<string | null>(null)
  const [upgradeBillingInterval, setUpgradeBillingInterval] = useState<BillingInterval>('monthly')
  const [cancelLoading, setCancelLoading] = useState(false)
  const [manageLinkLoading, setManageLinkLoading] = useState(false)

  useEffect(() => {
    preloadZuriPayment()
  }, [])

  useEffect(() => {
    if (!businessId) return
    const token = getBusinessToken()
    if (!token) {
      navigate('/business/login', { replace: true })
      return
    }
    axios.get<Business>(apiUrl(`/api/business/${businessId}`), { headers: getAuthHeaders() })
      .then(res => {
        setBusiness(res.data)
        setLoading(false)
      })
      .catch(err => {
        if (err.response?.status === 401) {
          clearBusinessAuth()
          navigate('/business/login', { replace: true })
        } else {
          console.error(err)
          setLoading(false)
        }
      })
  }, [businessId, navigate])

  useEffect(() => {
    axios
      .get<{ code: string; name: string }[]>(apiUrl('/api/banks'), { params: { provider: 'paystack' } })
      .then(res => setBanks(Array.isArray(res.data) ? res.data : []))
      .catch(() => setBanks([]))
  }, [])

  useEffect(() => {
    if (business?.bankAccount?.accountName) setShowBankForm(false)
  }, [business?.bankAccount?.accountName])

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <PaperPlaneLoader size="lg" />
      </div>
    )
  }

  if (!businessId || !business) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-gray-200 p-8 max-w-md w-full text-center">
          <h1 className="text-xl font-bold text-zuri-black mb-2">Invalid page</h1>
          <p className="text-gray-500 text-sm mb-6">Please log in again.</p>
          <button
            type="button"
            onClick={() => navigate('/business/login')}
            className="inline-block bg-zuri-orange text-white px-4 py-1.5 rounded-lg text-sm hover:bg-zuri-orange-dark transition"
          >
            Log in
          </button>
        </div>
      </div>
    )
  }

  const startUpgrade = async (plan: 'starter' | 'growth' | 'scale') => {
    if (!businessId) return
    setUpgradeLoading(plan)
    try {
      const { data } = await axios.post<{
        provider?: string
        authorizationUrl?: string
        accessCode?: string
        reference: string
      }>(apiUrl('/api/subscription/initialize'), {
        businessId,
        plan,
        ...(business?.email ? { email: business.email } : {}),
        callbackUrl: `${window.location.origin}/upgrade-done`,
        interval: upgradeBillingInterval
      }, { headers: getAuthHeaders() })
      const upgradeDoneUrl = `${window.location.origin}/upgrade-done?reference=${encodeURIComponent(data.reference)}`
      await startZuriPayment(
        {
          provider: 'paystack',
          authorizationUrl: data.authorizationUrl,
          accessCode: data.accessCode,
          reference: data.reference,
          orderId: data.reference
        },
        {
          successPath: upgradeDoneUrl,
          onError: (msg) => alert(msg || 'Failed to start payment')
        }
      )
    } catch {
      alert('Failed to start payment')
    } finally {
      setUpgradeLoading(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5]">
      <header className="bg-white/90 backdrop-blur border-b border-black/5">
        <div className="max-w-3xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate(`/business/dashboard/${businessId}`)}
              className="text-sm font-medium text-gray-600 hover:text-zuri-orange transition"
            >
              Back to dashboard
            </button>
            <h1 className="text-lg font-bold text-zuri-black tracking-tight">Payouts & billing</h1>
            <span className="w-24" />
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <div className="bg-white rounded-3xl border border-black/5 shadow-[0_20px_50px_rgba(0,0,0,0.04)] p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zuri-orange">Settlements</p>
              <h2 className="text-2xl font-semibold text-zuri-black tracking-tight mt-1">Get paid</h2>
              <p className="text-sm text-gray-600 mt-2 max-w-xl leading-relaxed">
                Checkout and plan billing run on Paystack. Add a verified payout account so customer payments settle to your bank.
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold text-emerald-800">
              Paystack
            </span>
          </div>

          <div className="rounded-2xl border border-zuri-orange/20 bg-zuri-orange/[0.04] p-4 mb-6">
            <p className="text-sm font-semibold text-zuri-black mb-1">Before you can save a bank account</p>
            <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside leading-relaxed">
              <li>Choose your bank and enter your full account number.</li>
              <li>Tap <span className="font-semibold text-zuri-black">Verify account</span> so the account name appears.</li>
              <li>Enter your Zuri <span className="font-semibold text-zuri-black">login password</span> and save.</li>
            </ul>
          </div>
          {banks.length === 0 ? (
            <div className="mb-6 p-4 rounded-2xl border border-amber-200 bg-amber-50">
              <p className="text-sm font-semibold text-amber-900 mb-1">Bank list unavailable</p>
              <p className="text-xs text-amber-800 leading-relaxed">
                We couldn&apos;t load banks right now. Refresh the page in a moment. If this keeps happening, check your connection or contact Zuri support.
              </p>
            </div>
          ) : null}

          {business.bankAccount?.accountName && !showBankForm ? (
            <div className="rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-4 mb-4">
              <p className="text-sm font-semibold text-zuri-black">{business.bankAccount.accountName}</p>
              <p className="text-xs text-gray-600 mt-1">
                {business.bankAccount.bankName} · {business.bankAccount.accountNumberMasked || business.bankAccount.accountNumber}
              </p>
              <button
                type="button"
                onClick={() => {
                  setShowBankForm(true)
                  setBankForm({ bankCode: '', bankName: '', accountNumber: '', accountName: '' })
                  setBankResolveError(null)
                  setBankFormError(null)
                  setBankPassword('')
                }}
                className="mt-3 text-xs font-semibold text-zuri-orange hover:underline"
              >
                Change payout account
              </button>
            </div>
          ) : null}

          {showBankForm ? (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                setBankFormError(null)
                if (
                  !businessId ||
                  !bankForm.bankCode ||
                  !bankForm.bankName ||
                  !bankForm.accountNumber.trim() ||
                  !bankForm.accountName.trim()
                ) {
                  setBankFormError(
                    'Select a bank, enter your account number, and verify so the account name appears before saving.'
                  )
                  return
                }
                if (!bankPassword.trim()) {
                  setBankFormError('Enter your Zuri business login password to confirm this change.')
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
                  const { data } = await axios.get<Business>(apiUrl(`/api/business/${businessId}`), {
                    headers: getAuthHeaders()
                  })
                  setBusiness(data)
                  setBankForm({ bankCode: '', bankName: '', accountNumber: '', accountName: '' })
                  setBankPassword('')
                  setShowBankForm(false)
                  setBankFormError(null)
                  dialog.alert('Bank details saved.', { variant: 'success', title: 'Saved' })
                } catch (err) {
                  if (axios.isAxiosError(err) && err.response?.status === 401) {
                    setBankFormError(
                      formatUserFacingError(
                        err.response?.data,
                        'That password doesn’t match your Zuri business account. Try again or reset your password from the login page.'
                      )
                    )
                  } else if (axios.isAxiosError(err)) {
                    const raw = formatUserFacingError(err.response?.data, '')
                    const lower = raw.toLowerCase()
                    if (lower.includes('could not verify account')) {
                      setBankFormError(
                        'We couldn’t complete a security check on our side. Wait a moment, try saving again, or log out and back in. If it keeps failing, contact Zuri support.'
                      )
                    } else {
                      setBankFormError(raw || 'Couldn’t save bank details. Check your connection and try again.')
                    }
                  } else {
                    setBankFormError('Couldn’t save bank details. Check your connection and try again.')
                  }
                } finally {
                  setBankSaving(false)
                }
              }}
            >
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Bank</label>
                <CustomDropdown
                  options={banks.map((b) => ({ value: b.code, label: b.name }))}
                  value={bankForm.bankCode}
                  onChange={(val, label) => {
                    setBankForm((f) => ({ ...f, bankCode: val, bankName: label, accountName: '' }))
                    setBankFormError(null)
                    setBankResolveError(null)
                  }}
                  placeholder="Select bank"
                  searchable
                  disabled={banks.length === 0}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1.5">Account number</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={bankForm.accountNumber}
                  onChange={(e) => {
                    setBankForm((f) => ({
                      ...f,
                      accountNumber: e.target.value.replace(/\D/g, '').slice(0, 16),
                      accountName: ''
                    }))
                    setBankFormError(null)
                    setBankResolveError(null)
                  }}
                  placeholder="8–16 digits (usually 10)"
                  maxLength={16}
                  className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/40"
                />
              </div>
              <div>
                <button
                  type="button"
                  disabled={
                    !bankForm.bankCode ||
                    !bankForm.accountNumber.trim() ||
                    bankForm.accountNumber.trim().length < 8 ||
                    bankForm.accountNumber.trim().length > 16 ||
                    bankResolving
                  }
                  onClick={async () => {
                    setBankResolveError(null)
                    setBankResolving(true)
                    try {
                      const { data } = await axios.get<{ account_name: string }>(apiUrl('/api/banks/resolve'), {
                        params: {
                          bank_code: bankForm.bankCode,
                          account_number: bankForm.accountNumber.trim(),
                          provider: 'paystack'
                        }
                      })
                      setBankForm((f) => ({ ...f, accountName: data.account_name || '' }))
                    } catch (err: unknown) {
                      const ax = err as { response?: { data?: unknown } }
                      const msg = formatUserFacingError(ax.response?.data, '')
                      setBankResolveError(
                        msg ||
                          'We could not match this account via Paystack. Double-check the bank and your account number (usually 10 digits), then try Verify again.'
                      )
                    } finally {
                      setBankResolving(false)
                    }
                  }}
                  className="rounded-xl bg-zuri-black text-white px-4 py-2 text-sm font-semibold disabled:opacity-50"
                >
                  {bankResolving ? 'Verifying…' : 'Verify account'}
                </button>
              </div>
              {bankResolveError ? (
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-sm font-semibold text-amber-900 mb-1">We couldn&apos;t verify this account yet</p>
                  <p className="text-sm text-amber-900/95 leading-relaxed">{bankResolveError}</p>
                </div>
              ) : null}
              {bankFormError ? (
                <div className="p-4 rounded-xl bg-red-50 border border-red-100">
                  <p className="text-sm font-semibold text-red-800 mb-1">Can&apos;t save payout account</p>
                  <p className="text-sm text-red-800/95 leading-relaxed">{bankFormError}</p>
                </div>
              ) : null}
              {bankForm.accountName ? (
                <div className="p-3 rounded-xl bg-green-50 border border-green-100">
                  <p className="text-sm font-semibold text-green-800">Account name: {bankForm.accountName}</p>
                </div>
              ) : null}
              {bankForm.accountName ? (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                    Confirm with your Zuri business account password
                  </label>
                  <input
                    type="password"
                    value={bankPassword}
                    onChange={(e) => setBankPassword(e.target.value)}
                    placeholder="Enter your account password"
                    className="w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/40"
                    autoComplete="current-password"
                  />
                  <p className="text-xs text-gray-500 mt-1">Required to save payout bank account.</p>
                </div>
              ) : null}
              <button
                type="submit"
                disabled={bankSaving || !bankForm.accountName || !bankPassword.trim()}
                className="rounded-xl bg-zuri-orange text-white px-5 py-2.5 text-sm font-semibold hover:bg-zuri-orange-dark transition disabled:opacity-50"
              >
                {bankSaving ? 'Saving…' : 'Save bank details'}
              </button>
            </form>
          ) : null}
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-black/5 bg-zuri-black text-white shadow-[0_24px_60px_rgba(0,0,0,0.18)]">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{
              background:
                'radial-gradient(ellipse 80% 60% at 10% 0%, rgba(255,189,89,0.35), transparent 55%), radial-gradient(ellipse 50% 40% at 100% 100%, rgba(255,255,255,0.08), transparent 50%)'
            }}
          />
          <div className="relative p-6 sm:p-8">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-zuri-yellow">Plans</p>
                <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight mt-1">Upgrade</h2>
                <p className="text-sm text-white/65 mt-2 max-w-md leading-relaxed">
                  Secure checkout with Paystack. Renews automatically each period until you cancel.
                </p>
              </div>
              <div className="inline-flex rounded-full bg-white/10 p-1 border border-white/10">
                <button
                  type="button"
                  onClick={() => setUpgradeBillingInterval('monthly')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                    upgradeBillingInterval === 'monthly' ? 'bg-white text-zuri-black' : 'text-white/70 hover:text-white'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setUpgradeBillingInterval('yearly')}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition ${
                    upgradeBillingInterval === 'yearly' ? 'bg-white text-zuri-black' : 'text-white/70 hover:text-white'
                  }`}
                >
                  Yearly · save {YEARLY_DISCOUNT_PCT}%
                </button>
              </div>
            </div>

            {business.plan && business.plan !== 'free' ? (
              <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm">
                <p>
                  <span className="text-white/55">Current · </span>
                  <span className="font-semibold">
                    {PLAN_LABELS[business.plan as keyof typeof PLAN_LABELS] || business.plan}
                  </span>
                  {business.subscriptionInterval ? (
                    <span className="text-white/55"> · {business.subscriptionInterval}</span>
                  ) : null}
                </p>
                {business.renewsAutomatically ? (
                  <p className="mt-1 text-xs text-white/55">
                    Recurring via Paystack
                    {business.subscriptionCurrentPeriodEnd
                      ? ` · next charge ${new Date(business.subscriptionCurrentPeriodEnd).toLocaleDateString(undefined, { dateStyle: 'medium' })}`
                      : ''}
                  </p>
                ) : business.subscriptionCurrentPeriodEnd ? (
                  <p className="mt-1 text-xs text-white/55">
                    Active until {new Date(business.subscriptionCurrentPeriodEnd).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  </p>
                ) : null}
                {business.subscriptionStatus === 'past_due' ? (
                  <p className="mt-2 text-xs font-semibold text-red-300">
                    Last renewal failed. Update your card in Paystack or re-subscribe.
                  </p>
                ) : null}
                {business.subscriptionStatus === 'cancelled' && business.subscriptionCurrentPeriodEnd ? (
                  <p className="mt-2 text-xs text-amber-200">
                    Cancelled — access continues until{' '}
                    {new Date(business.subscriptionCurrentPeriodEnd).toLocaleDateString(undefined, { dateStyle: 'medium' })}.
                  </p>
                ) : null}
                {business.renewsAutomatically ? (
                  <button
                    type="button"
                    disabled={manageLinkLoading}
                    onClick={async () => {
                      if (business.managePaymentUrl) {
                        window.open(business.managePaymentUrl, '_blank', 'noopener,noreferrer')
                        return
                      }
                      setManageLinkLoading(true)
                      try {
                        const { data } = await axios.get<{ link: string }>(
                          apiUrl('/api/subscription/manage-payment-link'),
                          { headers: getAuthHeaders() }
                        )
                        if (data?.link) {
                          window.open(data.link, '_blank', 'noopener,noreferrer')
                        } else {
                          dialog.alert('Could not open the payment update page. Try again shortly.')
                        }
                      } catch (err) {
                        dialog.alert(
                          axios.isAxiosError(err)
                            ? formatUserFacingError(err.response?.data, 'Could not open payment update page.')
                            : 'Could not open payment update page.'
                        )
                      } finally {
                        setManageLinkLoading(false)
                      }
                    }}
                    className="mt-3 text-xs font-semibold text-zuri-yellow hover:underline disabled:opacity-60"
                  >
                    {manageLinkLoading ? 'Opening…' : 'Update payment method'}
                  </button>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-3 sm:grid-cols-3">
              {(['starter', 'growth', 'scale'] as const).map((plan) => {
                const price =
                  upgradeBillingInterval === 'monthly' ? `${PLAN_PRICES[plan]}/mo` : `${PLAN_PRICES_YEARLY[plan]}/yr`
                const isCurrent = business.plan === plan
                const featured = plan === 'growth'
                return (
                  <div
                    key={plan}
                    className={`relative flex flex-col rounded-2xl border p-4 ${
                      featured
                        ? 'border-zuri-yellow/50 bg-gradient-to-b from-zuri-yellow/15 to-white/5'
                        : 'border-white/10 bg-white/[0.04]'
                    }`}
                  >
                    {featured ? (
                      <span className="absolute -top-2.5 left-4 rounded-full bg-zuri-yellow px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-zuri-black">
                        Recommended
                      </span>
                    ) : null}
                    <p className="text-sm font-semibold mt-1">{PLAN_LABELS[plan]}</p>
                    <p className="text-2xl font-semibold tracking-tight mt-2 tabular-nums">{price}</p>
                    <p className="text-[11px] text-white/55 mt-2 leading-relaxed flex-1">{PLAN_BLURBS[plan]}</p>
                    <button
                      type="button"
                      disabled={isCurrent || upgradeLoading !== null}
                      onClick={() => void startUpgrade(plan)}
                      className={`mt-4 w-full rounded-xl px-3 py-2.5 text-xs font-semibold transition disabled:opacity-45 disabled:cursor-not-allowed ${
                        featured
                          ? 'bg-zuri-yellow text-zuri-black hover:brightness-105'
                          : 'bg-white text-zuri-black hover:bg-white/90'
                      }`}
                    >
                      {upgradeLoading === plan
                        ? 'Opening checkout…'
                        : isCurrent
                          ? 'Current plan'
                          : `Upgrade to ${PLAN_LABELS[plan]}`}
                    </button>
                  </div>
                )
              })}
            </div>

            {business.plan && business.plan !== 'free' ? (
              <div className="mt-6 rounded-2xl border border-red-400/20 bg-red-500/10 p-4">
                <p className="text-sm font-semibold text-red-100 mb-1">Cancel subscription</p>
                <p className="text-xs text-red-100/80 mb-3 leading-relaxed">
                  {business.renewsAutomatically
                    ? 'Auto-renewal stops immediately. You keep access until the end of your current billing period.'
                    : 'Your plan stays active until the current period ends, then moves to Free.'}
                </p>
                <button
                  type="button"
                  disabled={cancelLoading}
                  onClick={async () => {
                    if (!businessId) return
                    const ok = await dialog.confirm({
                      title: 'Cancel subscription?',
                      message: business.renewsAutomatically
                        ? 'Auto-renewal will stop. You keep access until your current billing period ends.'
                        : 'Your plan will end after the current billing period.',
                      confirmLabel: 'Cancel subscription',
                      danger: true
                    })
                    if (!ok) return
                    setCancelLoading(true)
                    try {
                      const cancelRes = await axios.post<{ message?: string }>(
                        apiUrl('/api/subscription/cancel'),
                        { businessId },
                        { headers: getAuthHeaders() }
                      )
                      const { data } = await axios.get<Business>(apiUrl(`/api/business/${businessId}`), {
                        headers: getAuthHeaders()
                      })
                      setBusiness(data)
                      dialog.alert(cancelRes.data?.message || 'Subscription cancelled.', {
                        variant: 'success',
                        title: 'Done'
                      })
                    } catch (err) {
                      dialog.alert(
                        axios.isAxiosError(err)
                          ? formatUserFacingError(err.response?.data, 'Could not cancel subscription right now.')
                          : 'Could not cancel subscription right now.'
                      )
                    } finally {
                      setCancelLoading(false)
                    }
                  }}
                  className="rounded-lg bg-red-600 text-white px-3 py-1.5 text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60"
                >
                  {cancelLoading ? 'Cancelling…' : 'Cancel subscription'}
                </button>
              </div>
            ) : null}

            <p className="text-white/40 text-xs mt-5">
              Transaction fee: {formatModeTransactionFee(business.businessMode || 'menu')}.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BusinessPaymentPage
