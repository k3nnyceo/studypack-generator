// Page-view counting with Vercel Web Analytics (no cookies, nothing that
// identifies a student). App.jsx renders <Analytics> with each screen as its
// own page, so the dashboard shows /library, /plans, /flashcards… rather than
// one "/" for the whole app (screens live in the #/hash, which the script
// doesn't follow by itself).
//
// The view's numbers are in Vercel → studypack-generator → Analytics, once
// Web Analytics is enabled there.

// The page a screen is counted as.
export const analyticsPath = (view) => (view === 'home' ? '/' : `/${view}`)

// Query parameters worth seeing in the dashboard: which share link (?ref=)
// or campaign brought the visit. Everything else (Paystack references, share
// markers) is dropped.
const KEEP_PARAMS = /^(ref|utm_(source|medium|campaign|content|term))$/

// Rewrites each event's URL to its screen's page, without the hash or any
// other query parameters.
export function cleanAnalyticsEvent(event) {
  let url
  try {
    url = new URL(event.url)
  } catch {
    return event
  }
  const view = url.hash.replace(/^#\/?/, '')
  const path = view ? `/${view.replace(/[^\w-]/g, '')}` : url.pathname
  const params = new URLSearchParams([...url.searchParams].filter(([key]) => KEEP_PARAMS.test(key))).toString()
  const query = params ? `?${params}` : ''
  return { ...event, url: `${url.origin}${path}${query}` }
}
