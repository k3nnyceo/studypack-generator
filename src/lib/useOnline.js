import { useEffect, useState } from 'react'

// Whether the browser thinks it's online. Offline, saved packs still work
// (public/sw.js keeps the app itself available); generating, syncing and
// payments don't.
export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}
