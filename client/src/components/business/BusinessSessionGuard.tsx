import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  clearBusinessAuth,
  isBusinessLoggedIn,
  isBusinessWorkspacePath
} from '../../lib/businessAuthStorage'

/**
 * Clears the business session when the user leaves the dashboard workspace
 * (or closes the tab — handled by sessionStorage). Requires login again next time.
 */
export function BusinessSessionGuard(): null {
  const location = useLocation()
  const navigate = useNavigate()
  const prevPath = useRef(location.pathname)

  useEffect(() => {
    const prev = prevPath.current
    const next = location.pathname
    prevPath.current = next

    const leftWorkspace = isBusinessWorkspacePath(prev) && !isBusinessWorkspacePath(next)
    if (leftWorkspace && isBusinessLoggedIn()) {
      clearBusinessAuth()
      if (next.startsWith('/business/') && !next.startsWith('/business/login')) {
        navigate('/business/login', { replace: true })
      }
    }
  }, [location.pathname, navigate])

  useEffect(() => {
    const onPageHide = () => {
      // Ensure no long-lived copies remain if the browser keeps the process warm.
      if (!isBusinessWorkspacePath(window.location.pathname)) {
        clearBusinessAuth()
      }
    }
    window.addEventListener('pagehide', onPageHide)
    return () => window.removeEventListener('pagehide', onPageHide)
  }, [])

  return null
}
