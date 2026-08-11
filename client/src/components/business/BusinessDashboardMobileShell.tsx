import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Business } from '../../types'
import { PLAN_LABELS } from '../../types'
import { clearBusinessAuth } from '../../lib/businessAuthStorage'
import { isAiInsightsTier } from '../../lib/planAccess'
import { useMobileShellViewport } from '../../hooks/useMobileShellViewport'
import { catalogLabelForMode } from '../../lib/businessMode'
import { MobileBottomSheet } from './MobileBottomSheet'

type TabType = 'orders' | 'analytics' | 'menu' | 'qr' | 'payment' | 'ai'

type MobileNavKey = 'orders' | 'menu' | 'qr' | 'scan' | 'more'

type BusinessDashboardMobileShellProps = {
  business: Business | null
  businessId: string
  activeTab: TabType
  setActiveTab: (tab: TabType) => void
  notificationsCount: number
  onNotificationsClick: () => void
  onProfileClick: () => void
  children: ReactNode
  onChangePassword: () => void
  onFetchOrders?: () => void
  onFetchAnalytics?: () => void
}

const BTN_PRESS = 'dashboard-btn'

function NavIcon({ name }: { name: MobileNavKey }) {
  const common = {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const
  }

  if (name === 'orders') {
    return (
      <svg {...common}>
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    )
  }
  if (name === 'menu') {
    return (
      <svg {...common}>
        <path d="M4 6h16" />
        <path d="M4 12h16" />
        <path d="M4 18h16" />
      </svg>
    )
  }
  if (name === 'qr') {
    return (
      <svg {...common}>
        <rect x="3" y="3" width="7" height="7" rx="1" />
        <rect x="14" y="3" width="7" height="7" rx="1" />
        <rect x="3" y="14" width="7" height="7" rx="1" />
        <path d="M14 14h2v2h-2z" />
        <path d="M20 14h1v1h-1z" />
        <path d="M14 20h1v1h-1z" />
        <path d="M17 17h1v1h-1z" />
        <path d="M20 17h1v4h-1z" />
        <path d="M17 20h3v1h-3z" />
      </svg>
    )
  }
  if (name === 'scan') {
    return (
      <svg {...common}>
        <path d="M3 7V5a2 2 0 0 1 2-2h2" />
        <path d="M17 3h2a2 2 0 0 1 2 2v2" />
        <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
        <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
        <path d="M7 12h10" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
      <circle cx="5" cy="12" r="1" />
    </svg>
  )
}

export function BusinessDashboardMobileShell({
  business,
  businessId,
  activeTab,
  setActiveTab,
  notificationsCount,
  onNotificationsClick,
  onProfileClick,
  children,
  onChangePassword,
  onFetchOrders,
  onFetchAnalytics
}: BusinessDashboardMobileShellProps): JSX.Element {
  const navigate = useNavigate()
  const mainRef = useRef<HTMLElement>(null)
  const [moreOpen, setMoreOpen] = useState(false)

  useMobileShellViewport(mainRef)

  const showAnalytics = business?.plan && business.plan !== 'free' && business.plan !== 'starter'
  const showAi = isAiInsightsTier(business?.plan)

  const navActive = (key: MobileNavKey): boolean => {
    if (key === 'more') return moreOpen || activeTab === 'analytics' || activeTab === 'ai' || activeTab === 'payment'
    if (key === 'orders') return activeTab === 'orders' && !moreOpen
    if (key === 'menu') return activeTab === 'menu' && !moreOpen
    if (key === 'qr') return activeTab === 'qr' && !moreOpen
    return false
  }

  const pickTab = (tab: TabType) => {
    setMoreOpen(false)
    setActiveTab(tab)
    if (tab === 'orders') onFetchOrders?.()
    if (tab === 'analytics') onFetchAnalytics?.()
  }

  useEffect(() => {
    if (!moreOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [moreOpen])

  const tabTitle =
    activeTab === 'orders'
      ? 'Orders'
      : activeTab === 'analytics'
        ? 'Analytics'
        : activeTab === 'menu'
          ? catalogLabelForMode(business?.businessMode)
          : activeTab === 'qr'
            ? 'QR Code'
            : activeTab === 'ai'
              ? 'Zuri Assist'
              : 'Dashboard'

  return (
    <div className="mobile-dashboard-shell font-normal">
      <header className="mobile-dashboard-header sticky top-0 z-30 bg-white border-b border-gray-100">
        <div className="h-full px-4 flex items-center gap-3 box-border">
          <button
            type="button"
            onClick={onProfileClick}
            className={`flex-shrink-0 h-11 w-11 rounded-xl border border-gray-100 overflow-hidden bg-gray-50 ${BTN_PRESS}`}
            aria-label="Account menu"
          >
            {business?.logoUrl ? (
              <img src={business.logoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-base font-bold text-gray-500">
                {business?.name ? business.name.charAt(0).toUpperCase() : 'Z'}
              </span>
            )}
          </button>

          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zuri-orange/80">Business</p>
            <h1 className="text-base font-bold text-zuri-black truncate">{business?.name || 'Dashboard'}</h1>
            <p className="text-[11px] text-gray-500 truncate">{tabTitle}</p>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {business?.plan ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zuri-orange/10 text-zuri-orange border border-zuri-orange/20 max-w-[4.5rem] truncate">
                {PLAN_LABELS[business.plan]}
              </span>
            ) : null}
            <button
              type="button"
              onClick={onNotificationsClick}
              className={`relative flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white ${BTN_PRESS}`}
              aria-label="Notifications"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zuri-black">
                <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
              {notificationsCount > 0 ? (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-zuri-orange text-white text-[10px] font-semibold flex items-center justify-center">
                  {Math.min(99, notificationsCount)}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      <main ref={mainRef} className="mobile-dashboard-main">
        <div className="mobile-dashboard-content px-3 py-3 box-border">
          {children}
        </div>
      </main>

      <nav
        className="mobile-dashboard-nav box-border"
        aria-label="Dashboard navigation"
      >
        <div className="grid h-full grid-cols-5 items-center">
          {(
            [
              { key: 'orders' as const, label: 'Orders', onClick: () => pickTab('orders') },
              { key: 'menu' as const, label: catalogLabelForMode(business?.businessMode), onClick: () => pickTab('menu') },
              { key: 'qr' as const, label: 'QR', onClick: () => pickTab('qr') },
              { key: 'scan' as const, label: 'Scan', onClick: () => navigate('/scan') },
              { key: 'more' as const, label: 'More', onClick: () => setMoreOpen(true) }
            ] as const
          ).map(({ key, label, onClick }) => {
            const active = navActive(key)
            return (
              <button
                key={key}
                type="button"
                onClick={onClick}
                className={`flex h-full flex-col items-center justify-center gap-1 py-1 text-[10px] font-semibold ${BTN_PRESS} ${
                  active ? 'text-zuri-orange' : 'text-gray-500'
                }`}
              >
                <NavIcon name={key} />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      <MobileBottomSheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title="More"
        subtitle={business?.email}
      >
        <div className="space-y-1 px-1">
          {showAnalytics ? (
            <button type="button" onClick={() => pickTab('analytics')} className={`dashboard-btn w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zuri-black hover:bg-gray-50 ${BTN_PRESS}`}>
              Analytics
            </button>
          ) : null}
          {showAi ? (
            <button type="button" onClick={() => pickTab('ai')} className={`dashboard-btn w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zuri-black hover:bg-gray-50 ${BTN_PRESS}`}>
              Zuri Assist
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => { setMoreOpen(false); navigate(`/business/dashboard/${businessId}/settings`) }}
            className={`dashboard-btn w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zuri-black hover:bg-gray-50 ${BTN_PRESS}`}
          >
            Settings
          </button>
          <button
            type="button"
            onClick={() => { setMoreOpen(false); navigate(`/business/dashboard/${businessId}/payment`) }}
            className={`dashboard-btn w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zuri-black hover:bg-gray-50 ${BTN_PRESS}`}
          >
            Payouts & billing
          </button>
          <button
            type="button"
            onClick={() => { setMoreOpen(false); navigate(`/business/dashboard/${businessId}/customize`) }}
            className={`dashboard-btn w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zuri-black hover:bg-gray-50 ${BTN_PRESS}`}
          >
            Customize storefront
          </button>
          <button
            type="button"
            onClick={() => { setMoreOpen(false); navigate('/scan') }}
            className={`dashboard-btn w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zuri-black hover:bg-gray-50 ${BTN_PRESS}`}
          >
            Ticket scanner
          </button>
          <button
            type="button"
            onClick={() => { setMoreOpen(false); navigate('/') }}
            className={`dashboard-btn w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zuri-black hover:bg-gray-50 ${BTN_PRESS}`}
          >
            Home
          </button>
          <div className="border-t border-gray-100 my-2" />
          <button
            type="button"
            onClick={() => { setMoreOpen(false); onChangePassword() }}
            className={`dashboard-btn w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-zuri-black hover:bg-gray-50 ${BTN_PRESS}`}
          >
            Change password
          </button>
          <button
            type="button"
            onClick={() => { clearBusinessAuth(); navigate('/business/login', { replace: true }) }}
            className={`dashboard-btn w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50 ${BTN_PRESS}`}
          >
            Log out
          </button>
        </div>
      </MobileBottomSheet>
    </div>
  )
}
