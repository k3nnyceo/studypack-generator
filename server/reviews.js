// Ratings and reviews from signed-in students, asked for on the quiz results
// screen (src/components/RateCard.jsx). One review per account (rating again
// replaces it). Served through /api/referrals, since the Hobby plan has no
// room for another function:
//
//   GET  /api/referrals?review=mine           { review } this student's, or null
//   POST /api/referrals { action: 'review', rating, comment, public }
//   GET  /api/referrals?reviews=1             { reviews, average, count } (admins)
//
// In Upstash: one hash, studypack:reviews, of { rating, comment, public, name,
// email, plan, at } by account id. `public` is the student's consent to show
// their first name and comment on StudyPack's website.
const KEY = 'studypack:reviews'
const MAX_COMMENT = 600
const COOLDOWN_SECONDS = 20

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0].slice(0, 30)

export const myReview = (store, userId) => store.hget(KEY, userId)

// Resolves to { review } or { status, error }.
export async function saveReview(store, user, body, { now = Date.now(), plan = 'free' } = {}) {
  const rating = Number(body?.rating)
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { status: 400, error: 'Choose 1 to 5 stars.' }
  const comment = typeof body?.comment === 'string' ? body.comment.trim().slice(0, MAX_COMMENT) : ''
  if (!(await store.claim(`studypack:review:cool:${user.id}`, COOLDOWN_SECONDS))) {
    return { status: 429, error: 'You just sent a review. Give it a moment.' }
  }
  const review = {
    rating,
    comment,
    public: body?.public === true && comment.length > 0,
    name: firstName(user.name),
    email: user.email ?? '',
    plan,
    at: now,
  }
  await store.hset(KEY, user.id, review)
  return { review }
}

// Every review, newest first, with the average rating.
export async function listReviews(store) {
  const reviews = Object.values((await store.hgetall(KEY)) ?? {}).sort((a, b) => b.at - a.at)
  const average = reviews.length ? Math.round((reviews.reduce((n, r) => n + r.rating, 0) / reviews.length) * 10) / 10 : null
  return { reviews, average, count: reviews.length }
}
