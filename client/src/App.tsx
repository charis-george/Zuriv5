import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import Home from './pages/Home'
import OrderPage from './pages/OrderPage'
import BusinessLogin from './pages/BusinessLogin'
import BusinessDashboard from './pages/BusinessDashboard'
import QRScanner from './pages/QRScanner'

function App(): JSX.Element {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/order/:businessId" element={<OrderPage />} />
        <Route path="/scan" element={<QRScanner />} />
        <Route path="/business/login" element={<BusinessLogin />} />
        <Route path="/business/dashboard/:businessId" element={<BusinessDashboard />} />
      </Routes>
    </Router>
  )
}

export default App

