// Share links like /?ref=tiktok or /?ref=ada (server/referrals.js). The first
// link a browser arrives through is remembered for 30 days and sent with the
// student's first sign-in, so their sign-up and payments count for that link.
// utm_source works too, for ad platforms that add it.

const KEY = 'studypack.ref.v1'
const COUNTED_KEY = 'studypack.refVisits.v1'
const KEEP_MS = 30 * 24 * 60 * 60 * 1000
const REF = /^[a-z0-9_-]{1,32}$/

// Reads ?ref= from the address bar (once per page load), remembers it,
// counts the visit, and removes it from the address bar.
export function captureReferral() {
  const url = new URL(window.location.href)
  const raw = url.searchParams.get('ref') ?? url.searchParams.get('utm_source')
  if (raw === null) return
  const ref = raw.trim().toLowerCase()
  if (url.searchParams.has('ref')) {
    url.searchParams.delete('ref')
    window.history.replaceState(null, '', url.pathname + url.search + url.hash)
  }
  if (!REF.test(ref)) return

  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!stored || Date.now() - stored.at > KEEP_MS) localStorage.setItem(KEY, JSON.stringify({ ref, at: Date.now() }))
    const counted = JSON.parse(localStorage.getItem(COUNTED_KEY) ?? '[]')
    if (counted.includes(ref)) return
    localStorage.setItem(COUNTED_KEY, JSON.stringify([...counted, ref]))
  } catch {
    // storage blocked: still count the visit, just don't remember it
  }
  fetch('/api/referrals', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ref }), keepalive: true }).catch(() => {})
}

// The remembered link, if it's recent enough.
export function storedReferral() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return stored && Date.now() - stored.at <= KEEP_MS ? stored.ref : undefined
  } catch {
    return undefined
  }
}
