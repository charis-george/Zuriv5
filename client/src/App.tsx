import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { lazy, Suspense, useEffect } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { DialogProvider } from './components/DialogProvider'
import { PaperPlaneLoader } from './components/PaperPlaneLoader'

// Lazy load pages for code splitting
const Home = lazy(() => import('./pages/Home'))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const OrderPage = lazy(() => import('./pages/OrderPage'))
const PaymentDone = lazy(() => import('./pages/PaymentDone'))
const UpgradeDone = lazy(() => import('./pages/UpgradeDone'))
const SubscriptionSummary = lazy(() => import('./pages/SubscriptionSummary'))
const BusinessLogin = lazy(() => import('./pages/BusinessLogin'))
const BusinessForgotPassword = lazy(() => import('./pages/BusinessForgotPassword'))
const BusinessResetPassword = lazy(() => import('./pages/BusinessResetPassword'))
const BusinessDashboard = lazy(() => import('./pages/BusinessDashboard'))
const BusinessStorefrontCustomizer = lazy(() => import('./pages/BusinessStorefrontCustomizer'))
const BusinessPaymentPage = lazy(() => import('./pages/BusinessPaymentPage'))
const BusinessSettingsPage = lazy(() => import('./pages/BusinessSettingsPage'))
const BusinessOnboarding = lazy(() => import('./pages/BusinessOnboarding'))
const QRScanner = lazy(() => import('./pages/QRScanner'))
const ScannerConnectPage = lazy(() => import('./pages/ScannerConnectPage'))
const DemoPage = lazy(() => import('./pages/DemoPage'))
const WaitlistPage = lazy(() => import('./pages/WaitlistPage'))
const ZuriTapPage = lazy(() => import('./pages/ZuriTapPage'))
const TapPayPage = lazy(() => import('./pages/TapPayPage'))
const TapLoginPage = lazy(() => import('./pages/TapLoginPage'))
const TapForgotPassword = lazy(() => import('./pages/TapForgotPassword'))
const TapResetPassword = lazy(() => import('./pages/TapResetPassword'))
const TapRegisterPage = lazy(() => import('./pages/TapRegisterPage'))
const TapWaitPage = lazy(() => import('./pages/TapWaitPage'))
const PrivacyTermsPage = lazy(() => import('./pages/PrivacyTermsPage'))
const ReservationPage = lazy(() => import('./pages/ReservationPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))

// Loading component
const LoadingFallback = (): JSX.Element => (
  <div className="flex items-center justify-center min-h-screen bg-black">
    <PaperPlaneLoader size="md" />
  </div>
)

function AppRoutes(): JSX.Element {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/privacy" element={<PrivacyTermsPage />} />
        <Route path="/order/:businessId" element={<OrderPage />} />
        <Route path="/order/:businessId/:storefrontSlug" element={<OrderPage />} />
        <Route path="/event/:businessId/:eventSlug" element={<OrderPage />} />
        <Route path="/payment-done" element={<PaymentDone />} />
        <Route path="/upgrade-done" element={<UpgradeDone />} />
        <Route path="/subscribe/:plan" element={<SubscriptionSummary />} />
        <Route path="/scan" element={<QRScanner />} />
        <Route path="/scan/connect" element={<ScannerConnectPage />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/waitlist" element={<WaitlistPage />} />
        <Route path="/reserve/:businessId" element={<ReservationPage />} />
        <Route path="/zuri-tap" element={<ZuriTapPage />} />
        <Route path="/tap/pay/:token" element={<TapPayPage />} />
        <Route path="/tap/login" element={<TapLoginPage />} />
        <Route path="/tap/forgot-password" element={<TapForgotPassword />} />
        <Route path="/tap/reset-password" element={<TapResetPassword />} />
        <Route path="/tap/register" element={<TapRegisterPage />} />
        <Route path="/tap" element={<TapWaitPage />} />
        <Route path="/business/login" element={<BusinessLogin />} />
        <Route path="/business/forgot-password" element={<BusinessForgotPassword />} />
        <Route path="/business/reset-password" element={<BusinessResetPassword />} />
        <Route path="/business/onboarding/:businessId" element={<BusinessOnboarding />} />
        <Route path="/business/dashboard/:businessId" element={<BusinessDashboard />} />
        <Route path="/business/dashboard/:businessId/customize" element={<BusinessStorefrontCustomizer />} />
        <Route path="/business/dashboard/:businessId/payment" element={<BusinessPaymentPage />} />
        <Route path="/business/dashboard/:businessId/settings" element={<BusinessSettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

function App(): JSX.Element {
  useEffect(() => {
    const theme = localStorage.getItem('zuri_theme') || 'light'
    document.documentElement.dataset.theme = theme
  }, [])
  return (
    <Router>
      <DialogProvider>
        <ErrorBoundary>
          <div className="z-theme-scope min-h-screen z-page-orbit font-light antialiased">
            <AppRoutes />
          </div>
        </ErrorBoundary>
      </DialogProvider>
    </Router>
  )
}

export default App

