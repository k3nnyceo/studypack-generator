// StudyPack service worker. Two jobs:
//
// 1. Offline use. The app's code, styles and fonts are kept in the Cache API,
//    so StudyPack opens without internet and saved packs can be studied
//    (they live in localStorage). Pages are network-first, falling back to
//    the cached copy; /assets/* files have content hashes in their names, so
//    they're cache-first. The API is never cached: generating, syncing and
//    payments need the internet.
//
//    Each time the page loads, every file that version can load is cached,
//    including the parts loaded only when needed (the source viewer, pdf.js,
//    the PowerPoint reader). Each deploy renames them and the server drops the
//    old names, so without this a page left open across a deploy went blank
//    when it first opened the viewer. The last KEEP_VERSIONS versions are kept.
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
const VERSIONS_KEY = '/__studypack-versions'
const KEEP_VERSIONS = 3
// A file a script or stylesheet refers to: "./SourceSheet-x1.js",
// "assets/pdf-y2.js", url(/assets/font-z3.woff2).
const ASSET_REF = /["'`(](?:\.\/|\/?assets\/)([\w.-]+\.(?:m?js|css|woff2?|wasm|svg|png|webp|jpe?g))/g

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

// The home page and every file it can load (see cacheVersion).
async function precache() {
  try {
    const cache = await caches.open(APP_CACHE)
    const res = await fetch('/', { cache: 'no-store' })
    if (!res.ok) return
    const html = await res.clone().text()
    await cache.put('/', res)
    await cache.addAll(STATIC_FILES.slice(1))
    await cacheVersion(html)
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

  if (request.mode === 'navigate') return event.respondWith(networkFirstPage(request, event))
  if (url.pathname.startsWith('/assets/')) return event.respondWith(cacheFirst(request))
  if (STATIC_FILES.includes(url.pathname)) return event.respondWith(cacheFirst(request))
  // Everything else goes to the network as usual.
})

// Fresh when online (so a new deploy shows up at once), the saved copy when not.
async function networkFirstPage(request, event) {
  const cache = await caches.open(APP_CACHE)
  try {
    const res = await fetch(request)
    if (res.ok) {
      cache.put('/', res.clone())
      // In the background: this version's on-demand files, before a deploy removes them.
      event.waitUntil(res.clone().text().then(cacheVersion).catch(() => {}))
    }
    return res
  } catch {
    // Every screen is the same single page; the app reads its #/hash.
    return (await cache.match('/')) ?? Response.error()
  }
}

// Caches every file a version of the page can load, following each script's
// and stylesheet's references, then forgets versions older than the last
// KEEP_VERSIONS (and their files, unless a kept version shares them).
async function cacheVersion(html) {
  const entry = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1])
  const id = entry.find((url) => /\/index-[^/]+\.js$/.test(url))
  if (!id) return
  const cache = await caches.open(APP_CACHE)
  const versions = await readVersions(cache)
  if (versions.some((v) => v.id === id)) return

  const files = new Set(entry)
  const queue = [...entry]
  while (queue.length) {
    const url = queue.shift()
    let res = await cache.match(url, { ignoreVary: true })
    if (!res) {
      res = await fetch(url).catch(() => null)
      // Not every match is a real file (some are just strings inside pdf.js).
      if (!isAsset(res)) {
        files.delete(url)
        continue
      }
      await cache.put(url, res.clone())
    }
    if (/\.(m?js|css)$/.test(url)) {
      for (const [, name] of (await res.text()).matchAll(ASSET_REF)) {
        const ref = `/assets/${name}`
        if (!files.has(ref)) {
          files.add(ref)
          queue.push(ref)
        }
      }
    }
  }

  const all = [{ id, files: [...files] }, ...versions]
  const keep = all.slice(0, KEEP_VERSIONS)
  const kept = new Set(keep.flatMap((v) => v.files))
  for (const old of all.slice(KEEP_VERSIONS)) {
    for (const file of old.files) if (!kept.has(file)) await cache.delete(file)
  }
  await cache.put(VERSIONS_KEY, new Response(JSON.stringify(keep), { headers: { 'Content-Type': 'application/json' } }))
}

async function readVersions(cache) {
  try {
    const res = await cache.match(VERSIONS_KEY)
    return res ? await res.json() : []
  } catch {
    return []
  }
}

// Files under /assets/ are named by their content, so any cached copy is the
// right one: Vary (module scripts are requested with other headers) is ignored.
async function cacheFirst(request) {
  const cache = await caches.open(APP_CACHE)
  const cached = await cache.match(request, { ignoreVary: true })
  if (cached) return cached
  const res = await fetch(request)
  if (isAsset(res) || (res.ok && !new URL(request.url).pathname.startsWith('/assets/'))) cache.put(request, res.clone())
  return res
}

// A real file, not an error or the app's page sent back for a missing one.
const isAsset = (res) => Boolean(res?.ok) && !(res.headers.get('content-type') ?? '').includes('text/html')

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
