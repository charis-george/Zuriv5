import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'

// Lazy load pages for code splitting
const Home = lazy(() => import('./pages/Home'))
const OrderPage = lazy(() => import('./pages/OrderPage'))
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

function App(): JSX.Element {
  return (
    <Router>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/order/:businessId" element={<OrderPage />} />
          <Route path="/scan" element={<QRScanner />} />
          <Route path="/business/login" element={<BusinessLogin />} />
          <Route path="/business/dashboard/:businessId" element={<BusinessDashboard />} />
        </Routes>
      </Suspense>
    </Router>
  )
}

export default App

