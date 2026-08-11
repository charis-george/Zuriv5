import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Business, PLAN_PRICES, PLAN_PRICES_YEARLY, PLAN_LABELS, YEARLY_DISCOUNT_PCT, type BillingInterval, type PaymentProvider } from '../types'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'
import { CustomDropdown } from '../components/CustomDropdown'
import { useDialog } from '../components/DialogProvider'
import { apiUrl } from '../lib/apiBase'
import { clearBusinessAuth, getBusinessToken } from '../lib/businessAuthStorage'
import { formatUserFacingError } from '../lib/formatApiError'
import { normalizeUuidParam } from '../lib/normalizeUuid'
import { preloadZuriPayment, startZuriPayment } from '../lib/zuriPayment'
import { formatModeTransactionFee } from '../lib/transactionFees'

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
  const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>('paystack')
  const [providerSaving, setProviderSaving] = useState(false)
  const [providerError, setProviderError] = useState<string | null>(null)

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
        setPaymentProvider(res.data.paymentProvider === 'monnify' ? 'monnify' : 'paystack')
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
      .get<{ code: string; name: string }[]>(apiUrl('/api/banks'), { params: { provider: paymentProvider } })
      .then(res => setBanks(Array.isArray(res.data) ? res.data : []))
      .catch(() => setBanks([]))
  }, [paymentProvider])

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

  return (
    <div className="min-h-screen bg-white">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate(`/business/dashboard/${businessId}`)}
              className="text-sm font-medium text-gray-600 hover:text-zuri-orange transition"
            >
              Back to dashboard
            </button>
            <h1 className="text-lg font-bold text-zuri-black">Payment & pricing</h1>
            <span className="w-24" />
          </div>
        </div>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-zuri-black mb-6">Get paid</h2>

          <h3 className="text-sm font-bold text-zuri-black mb-2">Payment terminal</h3>
          <p className="text-gray-600 text-sm mb-3 leading-relaxed">
            Choose whether customer checkout and plan upgrades run through Paystack or Monnify. Payouts to your bank use the same provider.
          </p>
          <div className="flex flex-wrap gap-2 mb-3">
            {(['paystack', 'monnify'] as const).map((provider) => (
              <button
                key={provider}
                type="button"
                disabled={providerSaving}
                onClick={async () => {
                  if (!businessId || paymentProvider === provider) return
                  setProviderError(null)
                  setProviderSaving(true)
                  try {
                    await axios.patch(`/api/business/${businessId}`, { paymentProvider: provider }, { headers: getAuthHeaders() })
                    setPaymentProvider(provider)
                    preloadZuriPayment(provider)
                    setBankForm({ bankCode: '', bankName: '', accountNumber: '', accountName: '' })
                    setBankResolveError(null)
                    const { data } = await axios.get<Business>(`/api/business/${businessId}`, { headers: getAuthHeaders() })
                    setBusiness(data)
                  } catch (err) {
                    setProviderError(
                      axios.isAxiosError(err)
                        ? formatUserFacingError(err.response?.data, 'Could not update payment terminal.')
                        : 'Could not update payment terminal.'
                    )
                  } finally {
                    setProviderSaving(false)
                  }
                }}
                className={`px-4 py-2 rounded-xl text-sm font-semibold transition disabled:opacity-50 ${
                  paymentProvider === provider
                    ? 'bg-zuri-orange text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {provider === 'paystack' ? 'Paystack' : 'Monnify'}
              </button>
            ))}
          </div>
          {providerError ? (
            <p className="text-sm text-red-700 mb-4">{providerError}</p>
          ) : (
            <p className="text-xs text-gray-500 mb-6">
              Active terminal: <span className="font-semibold text-zuri-black">{paymentProvider === 'monnify' ? 'Monnify' : 'Paystack'}</span>
              {providerSaving ? ' — saving…' : ''}
            </p>
          )}

          <p className="text-gray-600 text-sm mb-3 leading-relaxed">
            Add a Nigerian payout account so customer payments can settle to you. Account names are verified through{' '}
            <span className="font-semibold text-zuri-black">{paymentProvider === 'monnify' ? 'Monnify' : 'Paystack'}</span>
            , then you confirm with your Zuri business password—only you can change where money goes.
          </p>
          <div className="rounded-xl border border-zuri-orange/25 bg-zuri-orange/5 p-4 mb-6">
            <p className="text-sm font-semibold text-zuri-black mb-1">Before you can save a bank account</p>
            <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside leading-relaxed">
              <li>Choose your bank and enter your full account number (NUBAN).</li>
              <li>Tap <span className="font-semibold text-zuri-black">Verify account</span> so the account name appears.</li>
              <li>Enter your Zuri <span className="font-semibold text-zuri-black">login password</span> and save—this stops anyone who gets into your session from changing your payout details.</li>
            </ul>
          </div>
          {banks.length === 0 ? (
            <div className="mb-6 p-4 rounded-xl border border-amber-200 bg-amber-50">
              <p className="text-sm font-semibold text-amber-900 mb-1">Bank list unavailable</p>
              <p className="text-xs text-amber-800 leading-relaxed">
                We couldn&apos;t load Nigerian banks right now. Refresh the page in a moment. If this keeps happening, check your connection or contact Zuri support—without the list you can&apos;t pick a bank yet.
              </p>
            </div>
          ) : null}
          {business.bankAccount?.accountName ? (
            <div className="mb-8 p-5 rounded-xl bg-zuri-orange/10 border border-zuri-orange/30">
              <p className="font-semibold text-zuri-black text-sm">Payout account</p>
              <p className="text-gray-600 text-sm mt-1">{business.bankAccount.bankName} — {business.bankAccount.accountNumberMasked}</p>
              <p className="text-gray-600 text-sm">{business.bankAccount.accountName}</p>
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
                  setBankFormError('Enter your Zuri business login password to confirm this change.')
                  return
                }
                setBankSaving(true)
                try {
                  await axios.patch(`/api/business/${businessId}`, {
                    bank_code: bankForm.bankCode,
                    bank_name: bankForm.bankName,
                    account_number: bankForm.accountNumber.trim(),
                    account_name: bankForm.accountName.trim(),
                    password: bankPassword.trim()
                  }, { headers: getAuthHeaders() })
                  const { data } = await axios.get<Business>(`/api/business/${businessId}`, { headers: getAuthHeaders() })
                  setBusiness(data)
                  setBankForm({ bankCode: '', bankName: '', accountNumber: '', accountName: '' })
                  setBankPassword('')
                  setShowBankForm(false)
                  setBankFormError(null)
                  alert('Bank details saved.')
                } catch (err) {
                  if (axios.isAxiosError(err) && err.response?.status === 401) {
                    setBankFormError(
                      formatUserFacingError(err.response?.data, 'That password doesn’t match your Zuri business account. Try again or reset your password from the login page.')
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
              className="space-y-4 mb-8"
            >
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Bank</label>
                <CustomDropdown
                  options={banks.map(b => ({ value: b.code, label: b.name }))}
                  value={bankForm.bankCode}
                  onChange={(val, label) => {
                    setBankForm(f => ({ ...f, bankCode: val, bankName: label }))
                    setBankFormError(null)
                    setBankResolveError(null)
                  }}
                  placeholder="Select bank"
                  searchable
                  disabled={banks.length === 0}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Account number</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={bankForm.accountNumber}
                  onChange={(e) => {
                    setBankForm(f => ({ ...f, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 16) }))
                    setBankFormError(null)
                    setBankResolveError(null)
                  }}
                  placeholder="8–16 digits (e.g. 10 for Nigerian NUBAN)"
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
                      const { data } = await axios.get<{ account_name: string }>(apiUrl('/api/banks/resolve'), {
                        params: {
                          bank_code: bankForm.bankCode,
                          account_number: bankForm.accountNumber.trim(),
                          provider: paymentProvider,
                        },
                      })
                      setBankForm(f => ({ ...f, accountName: data.account_name || '' }))
                    } catch (err: unknown) {
                      const ax = err as {
                        response?: { data?: { error?: string; sandboxHint?: string; retryable?: boolean } }
                      }
                      const data = ax.response?.data
                      const msg = formatUserFacingError(data, '')
                      setBankResolveError(
                        msg ||
                          `We could not match this account via ${paymentProvider === 'monnify' ? 'Monnify' : 'Paystack'}. Double-check the bank and your NUBAN (usually 10 digits), then try Verify again. If your details are correct, try again later or ask your bank.`
                      )
                    } finally {
                      setBankResolving(false)
                    }
                  }}
                  className="bg-zuri-black text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-gray-800 transition disabled:opacity-50"
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
                  <label className="block text-sm font-medium text-gray-600 mb-1">Confirm with your Zuri business account password</label>
                  <input
                    type="password"
                    value={bankPassword}
                    onChange={(e) => setBankPassword(e.target.value)}
                    placeholder="Enter your account password"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                    autoComplete="current-password"
                  />
                  <p className="text-xs text-gray-500 mt-1">Required to save payout bank account.</p>
                </div>
              ) : null}
              <button
                type="submit"
                disabled={bankSaving || !bankForm.accountName || !bankPassword.trim()}
                className="bg-zuri-orange text-white px-4 py-1.5 rounded-lg text-sm hover:bg-zuri-orange-dark transition disabled:opacity-50"
              >
                {bankSaving ? 'Saving…' : 'Save bank details'}
              </button>
            </form>
          ) : null}

          <hr className="border-gray-100 my-8" />

          <h3 className="text-lg font-bold text-zuri-black mb-4">Upgrade plan</h3>
          {business.plan && business.plan !== 'free' ? (
            <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-sm text-gray-700">
              <p>
                <span className="font-semibold text-zuri-black">Current plan:</span>{' '}
                {PLAN_LABELS[business.plan as keyof typeof PLAN_LABELS] || business.plan}
                {business.subscriptionInterval ? ` · ${business.subscriptionInterval}` : ''}
              </p>
              {business.renewsAutomatically ? (
                <p className="mt-1 text-xs text-gray-600">
                  Recurring billing via Paystack
                  {business.subscriptionCurrentPeriodEnd
                    ? ` · next charge ${new Date(business.subscriptionCurrentPeriodEnd).toLocaleDateString(undefined, { dateStyle: 'medium' })}`
                    : ''}
                </p>
              ) : business.subscriptionCurrentPeriodEnd ? (
                <p className="mt-1 text-xs text-gray-600">
                  Active until {new Date(business.subscriptionCurrentPeriodEnd).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                  {paymentProvider === 'monnify' ? ' — renew manually before this date' : ''}
                </p>
              ) : null}
              {business.subscriptionStatus === 'past_due' ? (
                <p className="mt-2 text-xs font-semibold text-red-700">
                  Payment failed on your last renewal. Update your card in Paystack or re-subscribe to avoid losing access.
                </p>
              ) : null}
              {business.subscriptionStatus === 'cancelled' && business.subscriptionCurrentPeriodEnd ? (
                <p className="mt-2 text-xs text-amber-800">
                  Cancelled — access continues until {new Date(business.subscriptionCurrentPeriodEnd).toLocaleDateString(undefined, { dateStyle: 'medium' })}.
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
                  className="mt-3 text-xs font-semibold text-zuri-orange hover:underline disabled:opacity-60"
                >
                  {manageLinkLoading ? 'Opening…' : 'Update payment method'}
                </button>
              ) : null}
            </div>
          ) : null}
          <p className="text-gray-600 text-sm mb-4 leading-relaxed">
            {paymentProvider === 'paystack'
              ? 'Plans renew automatically each billing period via Paystack. Your card is charged on the renewal date until you cancel.'
              : 'Checkout opens in Monnify for a one-time plan period. Renew manually before your period ends.'}
          </p>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-sm font-semibold text-zuri-black">Billing:</span>
            <button
              type="button"
              onClick={() => setUpgradeBillingInterval('monthly')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${upgradeBillingInterval === 'monthly' ? 'bg-zuri-orange text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setUpgradeBillingInterval('yearly')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${upgradeBillingInterval === 'yearly' ? 'bg-zuri-orange text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >
              Yearly (Save {YEARLY_DISCOUNT_PCT}%)
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(['starter', 'growth', 'scale'] as const).map((plan) => (
              <button
                key={plan}
                disabled={business.plan === plan || upgradeLoading !== null}
                onClick={async () => {
                  if (!businessId) return
                  setUpgradeLoading(plan)
                  try {
                    const { data } = await axios.post<{
                      provider?: 'paystack' | 'monnify'
                      authorizationUrl?: string
                      accessCode?: string
                      reference: string
                      checkoutUrl?: string
                      apiKey?: string
                      contractCode?: string
                      amount?: number
                      customerEmail?: string
                      customerName?: string
                      isTestMode?: boolean
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
                        provider: data.provider,
                        authorizationUrl: data.authorizationUrl,
                        accessCode: data.accessCode,
                        reference: data.reference,
                        orderId: data.reference,
                        checkoutUrl: data.checkoutUrl,
                        apiKey: data.apiKey,
                        contractCode: data.contractCode,
                        amount: data.amount,
                        customerEmail: data.customerEmail || business?.email,
                        customerName: data.customerName || business?.name,
                        isTestMode: data.isTestMode,
                      },
                      {
                        successPath: upgradeDoneUrl,
                        onError: (msg) => alert(msg || 'Failed to start payment'),
                      },
                    )
                  } catch {
                    alert('Failed to start payment')
                  } finally {
                    setUpgradeLoading(null)
                  }
                }}
                className="bg-zuri-orange text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {upgradeLoading === plan ? 'Opening checkout…' : `Upgrade to ${PLAN_LABELS[plan]} — ${upgradeBillingInterval === 'monthly' ? PLAN_PRICES[plan] + '/mo' : PLAN_PRICES_YEARLY[plan] + '/yr'}`}
              </button>
            ))}
          </div>
          {business.plan && business.plan !== 'free' ? (
            <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4">
              <p className="text-sm font-semibold text-red-700 mb-1">Cancel subscription</p>
              <p className="text-xs text-red-700/90 mb-3">
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
                    const { data } = await axios.get<Business>(apiUrl(`/api/business/${businessId}`), { headers: getAuthHeaders() })
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
                className="bg-red-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold hover:bg-red-700 transition disabled:opacity-60"
              >
                {cancelLoading ? 'Cancelling…' : 'Cancel subscription'}
              </button>
            </div>
          ) : null}
          <p className="text-gray-500 text-xs mt-4">
            Transaction fee:{' '}
            {formatModeTransactionFee(business.businessMode || 'menu')}.
          </p>
        </div>
      </div>
    </div>
  )
}

export default BusinessPaymentPage
