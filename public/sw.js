// StarterPack service worker. Two jobs:
//
// 1. Offline use. The app's code, styles and fonts are kept in the Cache API,
//    so StarterPack opens without internet and saved packs can be studied
//    (they live in localStorage). Pages are network-first, falling back to
//    the cached copy; /assets/* files have content hashes in their names, so
//    they're cache-first. The API is never cached: generating, syncing and
//    payments need the internet.
//
// 2. The Android share target: when the installed app is picked from another
//    app's Share menu (e.g. a PDF in WhatsApp), Chrome POSTs the file to
//    /share-target. That request never reaches the server: it's caught here,
//    the file is parked in the Cache API, and the page is opened with ?share=1
//    to pick it up (src/lib/sharedFile.js). This avoids the file picker, which
//    some phones unload the page to open.
const APP_CACHE = 'studypack-app-v1'
const SHARE_CACHE = 'studypack-share-v1'
const SHARED_FILE_URL = '/shared-file'
const STATIC_FILES = ['/', '/manifest.webmanifest', '/favicon.svg', '/icon-192.png', '/icon-512.png']

self.addEventListener('install', (event) => {
  event.waitUntil(precache().finally(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== APP_CACHE && k !== SHARE_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// The home page plus every script and stylesheet it loads, read from the page
// itself, since their names change with each build.
async function precache() {
  try {
    const cache = await caches.open(APP_CACHE)
    const res = await fetch('/', { cache: 'no-store' })
    if (!res.ok) return
    const html = await res.clone().text()
    const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
    await cache.put('/', res)
    await cache.addAll([...new Set([...STATIC_FILES.slice(1), ...assets])])
  } catch {
    // Offline or a partial deploy: pages are cached as they're visited instead.
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  if (request.method === 'POST' && url.pathname === '/share-target') {
    return event.respondWith(receiveShare(request))
  }
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return

  if (request.mode === 'navigate') return event.respondWith(networkFirstPage(request))
  if (url.pathname.startsWith('/assets/')) return event.respondWith(cacheFirst(request))
  if (STATIC_FILES.includes(url.pathname)) return event.respondWith(cacheFirst(request))
  // Everything else goes to the network as usual.
})

// Fresh when online (so a new deploy shows up at once), the saved copy when not.
async function networkFirstPage(request) {
  const cache = await caches.open(APP_CACHE)
  try {
    const res = await fetch(request)
    if (res.ok) cache.put('/', res.clone())
    return res
  } catch {
    // Every screen is the same single page; the app reads its #/hash.
    return (await cache.match('/')) ?? Response.error()
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(APP_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const res = await fetch(request)
  if (res.ok) cache.put(request, res.clone())
  return res
}

async function receiveShare(request) {
  const back = (status) => Response.redirect(new URL(`/?share=${status}`, self.location.origin).href, 303)
  try {
    const form = await request.formData()
    const file = form.getAll('file').find((f) => typeof f === 'object' && f.size > 0)
    if (!file) return back('empty')

    const cache = await caches.open(SHARE_CACHE)
    await cache.put(
      SHARED_FILE_URL,
      new Response(file, {
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          'X-File-Name': encodeURIComponent(file.name || ''),
        },
      }),
    )
    return back('1')
  } catch {
    return back('error')
  }
}
