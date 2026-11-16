import { useSyncExternalStore } from 'react'

// Installing StudyPack as an app (it's a PWA: public/manifest.webmanifest and
// public/sw.js). Chrome, Edge and Samsung Internet offer a one-tap install
// through the `beforeinstallprompt` event, which fires once, early, so this
// module is imported by main.jsx before the app renders and keeps the event
// until the student taps Install. Safari on iPhone has no such event: the
// student adds it from the Share menu, so we show them how. In-app browsers
// (X, Instagram, Facebook, TikTok…) can't install at all; the student has to
// open the page in their real browser first.

// What installing looks like here:
//   'installed'  already running as the app: nothing to offer
//   'prompt'     one tap: the browser's own install dialog
//   'ios'        Share → Add to Home Screen
//   'android'    browser menu → Install app / Add to Home screen
//   'in-app'     open in Chrome or Safari first
//   'none'       a desktop browser that can't install (e.g. Firefox): hide it
export function installMode({ userAgent = '', maxTouchPoints = 0, standalone = false, hasPrompt = false } = {}) {
  if (standalone) return 'installed'
  if (hasPrompt) return 'prompt'
  if (/FBAN|FBAV|Instagram|Twitter|TwitterAndroid|musical_ly|TikTok|Snapchat|Line\/|; wv\)/.test(userAgent)) return 'in-app'
  // iPadOS reports itself as a Mac; a touch screen gives it away.
  if (/iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1)) return 'ios'
  if (/Android/.test(userAgent)) return 'android'
  return 'none'
}

let deferredPrompt = null
let installed = false
const listeners = new Set()
const notify = () => listeners.forEach((listener) => listener())

function standalone() {
  return installed || window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    // Keep the browser's own mini-bar from appearing; we offer it in our own button.
    event.preventDefault()
    deferredPrompt = event
    notify()
  })
  window.addEventListener('appinstalled', () => {
    installed = true
    deferredPrompt = null
    notify()
  })
}

function currentMode() {
  return installMode({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: standalone(),
    hasPrompt: Boolean(deferredPrompt),
  })
}

// The current install mode; re-renders when the browser offers or completes an install.
export function useInstallMode() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    currentMode,
    () => 'none',
  )
}

// Opens the browser's install dialog. Resolves to 'accepted', 'dismissed', or
// 'unavailable' when there's no one-tap install here.
export async function promptInstall() {
  const event = deferredPrompt
  if (!event) return 'unavailable'
  // The event can only be used once.
  deferredPrompt = null
  notify()
  await event.prompt()
  const { outcome } = await event.userChoice
  if (outcome === 'accepted') installed = true
  notify()
  return outcome
}
