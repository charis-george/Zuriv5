import axios from 'axios'
import { getBusinessToken } from './businessAuthStorage'

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i)
  return arr
}

export function isPushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window
}

export async function showLocalOrderNotification(title: string, body: string): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return
  try {
    const reg = await navigator.serviceWorker?.ready
    if (reg?.showNotification) {
      await reg.showNotification(title, {
        body,
        icon: '/favicon.ico',
        tag: 'zuri-new-order',
        data: { url: '/business/dashboard' }
      })
    } else {
      new Notification(title, { body })
    }
  } catch {
    try {
      new Notification(title, { body })
    } catch {
      /* ignore */
    }
  }
}

export async function subscribeBusinessPush(businessId: string): Promise<'granted' | 'denied' | 'unsupported' | 'error'> {
  if (!isPushSupported() || !businessId) return 'unsupported'

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return 'denied'

  const token = getBusinessToken()
  if (!token) return 'error'

  try {
    const { data } = await axios.get<{ publicKey?: string | null }>('/api/business/push/vapid-public-key', {
      headers: { Authorization: `Bearer ${token}` }
    })
    const publicKey = data?.publicKey
    if (!publicKey) return 'unsupported'

    const reg = await navigator.serviceWorker.register('/sw.js')
    await navigator.serviceWorker.ready

    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey)
      })
    }

    const json = sub.toJSON()
    await axios.post(
      `/api/business/${businessId}/push-subscription`,
      {
        endpoint: json.endpoint,
        keys: json.keys
      },
      { headers: { Authorization: `Bearer ${token}` } }
    )
    return 'granted'
  } catch {
    return 'error'
  }
}

export async function unsubscribeBusinessPush(businessId: string): Promise<void> {
  if (!isPushSupported() || !businessId) return
  const token = getBusinessToken()
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      const endpoint = sub.endpoint
      await sub.unsubscribe()
      if (token) {
        await axios.delete(`/api/business/${businessId}/push-subscription`, {
          headers: { Authorization: `Bearer ${token}` },
          data: { endpoint }
        })
      }
    }
  } catch {
    /* ignore */
  }
}
