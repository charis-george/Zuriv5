import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import axios from 'axios'
import { Business, PLAN_PRICES, PLAN_PRICES_YEARLY, PLAN_LABELS, YEARLY_DISCOUNT_PCT, type BillingInterval } from '../types'
import { PaperPlaneLoader } from '../components/PaperPlaneLoader'

function BusinessPaymentPage(): JSX.Element {
  const { businessId } = useParams<{ businessId: string }>()
  const navigate = useNavigate()

  const getAuthHeaders = () => {
    const t = localStorage.getItem('zuri_business_token')
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
  const [upgradeLoading, setUpgradeLoading] = useState<string | null>(null)
  const [upgradeBillingInterval, setUpgradeBillingInterval] = useState<BillingInterval>('monthly')

  useEffect(() => {
    if (!businessId) return
    const token = localStorage.getItem('zuri_business_token')
    if (!token) {
      navigate('/business/login', { replace: true })
      return
    }
    axios.get<Business>(`/api/business/${businessId}`, { headers: getAuthHeaders() })
      .then(res => {
        setBusiness(res.data)
        setLoading(false)
      })
      .catch(err => {
        if (err.response?.status === 401) {
          localStorage.removeItem('zuri_business_token')
          navigate('/business/login', { replace: true })
        } else {
          console.error(err)
          setLoading(false)
        }
      })
    axios.get<{ code: string; name: string }[]>('/api/banks')
      .then(res => setBanks(Array.isArray(res.data) ? res.data : []))
      .catch(() => {})
  }, [businessId, navigate])

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
          <p className="text-gray-500 text-sm mb-6">
            Add your Nigerian bank account to receive payouts. We verify the account name so payments go to the right place.
          </p>
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
                if (!businessId || !bankForm.bankCode || !bankForm.bankName || !bankForm.accountNumber.trim() || !bankForm.accountName.trim()) {
                  alert('Select bank, enter account number, and verify to show account name before saving.')
                  return
                }
                if (!bankPassword.trim()) {
                  alert('Enter your Zuri business account password to save bank details.')
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
                  alert('Bank details saved.')
                } catch (err) {
                  if (axios.isAxiosError(err) && err.response?.status === 401) {
                    alert(err.response?.data?.error || 'Incorrect password. Enter your Zuri business account password.')
                  } else {
                    alert('Failed to save. Try again.')
                  }
                } finally {
                  setBankSaving(false)
                }
              }}
              className="space-y-4 mb-8"
            >
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Bank</label>
                <select
                  value={bankForm.bankCode}
                  onChange={(e) => {
                    const option = e.target.selectedOptions?.[0]
                    setBankForm(f => ({ ...f, bankCode: e.target.value, bankName: option?.text ?? '' }))
                  }}
                  required
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-zuri-orange/50 focus:border-zuri-orange"
                >
                  <option value="">Select bank</option>
                  {banks.map((b) => (
                    <option key={b.code} value={b.code}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">Account number</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={bankForm.accountNumber}
                  onChange={(e) => setBankForm(f => ({ ...f, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 16) }))}
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
                      const { data } = await axios.get<{ account_name: string }>('/api/banks/resolve', {
                        params: { bank_code: bankForm.bankCode, account_number: bankForm.accountNumber.trim() }
                      })
                      setBankForm(f => ({ ...f, accountName: data.account_name || '' }))
                    } catch (err: unknown) {
                      const ax = err as { response?: { data?: { error?: string } } }
                      const msg = ax.response?.data?.error || 'Could not verify account. Check bank and account number.'
                      setBankResolveError(msg)
                      alert(msg)
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
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <p className="text-sm text-amber-800">{bankResolveError}</p>
                  {(bankResolveError.includes('test') || bankResolveError.includes('limit') || bankResolveError.includes('001')) && (
                    <p className="text-xs text-amber-700 mt-1">Tip: In test mode, use <strong>Zenith Bank</strong> (code 057) with test account number <strong>0000000000</strong> to avoid the 3-per-day live resolve limit. Or switch to live keys for real accounts.</p>
                  )}
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
          <p className="text-gray-500 text-sm mb-4">You’ll be redirected to Paystack to pay securely.</p>
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
            {(['starter', 'growth', 'pro', 'zuri_plus'] as const).map((plan) => (
              <button
                key={plan}
                disabled={business.plan === plan || upgradeLoading !== null}
                onClick={async () => {
                  if (!businessId || !business?.email) return
                  setUpgradeLoading(plan)
                  try {
                    const { data } = await axios.post<{ authorizationUrl: string }>('/api/subscription/initialize', {
                      businessId,
                      plan,
                      email: business.email,
                      callbackUrl: `${window.location.origin}/upgrade-done`,
                      interval: upgradeBillingInterval
                    }, { headers: getAuthHeaders() })
                    if (data?.authorizationUrl) window.location.href = data.authorizationUrl
                    else alert('Failed to start payment')
                  } catch {
                    alert('Failed to start payment')
                  } finally {
                    setUpgradeLoading(null)
                  }
                }}
                className="bg-zuri-orange text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-zuri-orange-dark transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {upgradeLoading === plan ? 'Redirecting…' : `Upgrade to ${PLAN_LABELS[plan]} — ${upgradeBillingInterval === 'monthly' ? PLAN_PRICES[plan] + '/mo' : PLAN_PRICES_YEARLY[plan] + '/yr'}`}
              </button>
            ))}
          </div>
          <p className="text-gray-500 text-xs mt-4">A 1.5% transaction fee applies on every customer purchase.</p>
        </div>
      </div>
    </div>
  )
}

export default BusinessPaymentPage
