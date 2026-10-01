// StudyPack service worker. Its only job is the Android share target: when the
// installed app is picked from another app's Share menu (e.g. a PDF in
// WhatsApp), Chrome POSTs the file to /share-target. That request never
// reaches the server: it's caught here, the file is parked in the Cache API,
// and the page is opened with ?share=1 to pick it up (src/lib/sharedFile.js).
// This avoids the file picker, which some phones unload the page to open.
const SHARE_CACHE = 'studypack-share-v1'
const SHARED_FILE_URL = '/shared-file'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)
  if (event.request.method === 'POST' && url.pathname === '/share-target') {
    event.respondWith(receiveShare(event.request))
  }
  // Everything else goes to the network as usual.
})

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
