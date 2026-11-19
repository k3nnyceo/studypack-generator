// Ratings and reviews (server/reviews.js, through /api/referrals). The rating
// card asks once per account; closing it puts it off for a while on this device.

const DISMISSED_KEY = 'studypack.review.dismissedAt'
const ASK_AGAIN_MS = 14 * 24 * 60 * 60 * 1000

async function call(url, init) {
  let res
  try {
    res = await fetch(url, { cache: 'no-store', ...init })
  } catch {
    throw new Error('Couldn’t reach StudyPack. Check your connection and try again.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) throw new Error(data?.error || `Something went wrong (${res.status}).`)
  return data
}

// This student's review, or null.
export const fetchMyReview = () => call('/api/referrals?review=mine').then((d) => d.review ?? null)

export const submitReview = ({ rating, comment, public: isPublic }) =>
  call('/api/referrals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'review', rating, comment, public: isPublic }),
  }).then((d) => d.review)

// { reviews, average, count }: admins only.
export const fetchReviews = () => call('/api/referrals?reviews=1')

export function recentlyDismissed(now = Date.now()) {
  try {
    return now - Number(localStorage.getItem(DISMISSED_KEY) ?? 0) < ASK_AGAIN_MS
  } catch {
    return false
  }
}

export function rememberDismissed(now = Date.now()) {
  try {
    localStorage.setItem(DISMISSED_KEY, String(now))
  } catch {
    // Private mode: it asks again next time.
  }
}
