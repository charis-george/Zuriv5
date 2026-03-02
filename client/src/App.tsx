import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'

// Lazy load pages for code splitting
const Home = lazy(() => import('./pages/Home'))
const OrderPage = lazy(() => import('./pages/OrderPage'))
const PaymentDone = lazy(() => import('./pages/PaymentDone'))
const UpgradeDone = lazy(() => import('./pages/UpgradeDone'))
const BusinessLogin = lazy(() => import('./pages/BusinessLogin'))
const BusinessDashboard = lazy(() => import('./pages/BusinessDashboard'))
const QRScanner = lazy(() => import('./pages/QRScanner'))

// Loading component
const LoadingFallback = (): JSX.Element => (
  <div className="flex items-center justify-center min-h-screen">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
      <p className="mt-4 text-gray-600">Loading...</p>
    </div>
  </div>
)

function AppRoutes(): JSX.Element {
  const location = useLocation()
  return (
    <Suspense fallback={<LoadingFallback />}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/order/:businessId" element={<OrderPage />} />
        <Route path="/payment-done" element={<PaymentDone />} />
        <Route path="/upgrade-done" element={<UpgradeDone />} />
        <Route path="/scan" element={<QRScanner key={location.key} />} />
        <Route path="/business/login" element={<BusinessLogin />} />
        <Route path="/business/dashboard/:businessId" element={<BusinessDashboard />} />
      </Routes>
    </Suspense>
  )
}

function App(): JSX.Element {
  return (
    <Router>
      <ErrorBoundary>
        <AppRoutes />
      </ErrorBoundary>
    </Router>
  )
}

export default App

