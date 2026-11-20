import { useCallback, useEffect, useState } from 'react'

// Daily study reminders on this device (server/reminders.js sends them).
// Turning them on asks the browser's permission for notifications and
// subscribes this device through the service worker (public/sw.js) with the
// server's public key; the subscription is saved to the account through
// /api/library?push=1.
//
// state: 'unsupported' (no push here: e.g. iPhone Safari outside the
// installed app, or the dev server without a service worker), 'off' (the
// server has no keys), 'blocked' (notifications denied in the browser),
// 'disabled', 'enabled' or 'working'.

const api = (method, body) =>
  fetch('/api/library?push=1', {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  }).then(async (res) => {
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(data?.error || 'Couldn’t change reminders. Please try again.')
    return data
  })

// The key as the bytes pushManager.subscribe wants.
function keyBytes(base64url) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

// { state, error, enable(), disable() } for a signed-in `user`.
export function useReminders(user) {
  const userId = user?.id ?? null
  const [state, setState] = useState(supported() ? 'working' : 'unsupported')
  const [key, setKey] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!userId || !supported()) return
    let stopped = false
    ;(async () => {
      try {
        const registration = await navigator.serviceWorker.getRegistration()
        if (!registration) return !stopped && setState('unsupported')
        const { key: publicKey } = await api('GET')
        if (stopped) return
        if (!publicKey) return setState('off')
        setKey(publicKey)
        if (Notification.permission === 'denied') return setState('blocked')
        const subscription = await registration.pushManager.getSubscription()
        if (!stopped) setState(subscription && Notification.permission === 'granted' ? 'enabled' : 'disabled')
      } catch {
        if (!stopped) setState('off')
      }
    })()
    return () => {
      stopped = true
    }
  }, [userId])

  const enable = useCallback(async () => {
    setError('')
    setState('working')
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') return setState(permission === 'denied' ? 'blocked' : 'disabled')
      const registration = await navigator.serviceWorker.ready
      const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) }))
      await api('PUT', { subscription: subscription.toJSON() })
      setState('enabled')
    } catch (err) {
      setError(err.message || 'Couldn’t turn reminders on.')
      setState('disabled')
    }
  }, [key])

  const disable = useCallback(async () => {
    setError('')
    setState('working')
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await api('PUT', { remove: subscription.endpoint })
        await subscription.unsubscribe()
      }
      setState('disabled')
    } catch (err) {
      setError(err.message || 'Couldn’t turn reminders off.')
      setState('enabled')
    }
  }, [])

  return { state, error, enable, disable }
}
