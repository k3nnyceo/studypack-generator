// Where students come from: share links like /?ref=tiktok or /?ref=ada (an
// ambassador), and see visits, sign-ups and payments per link. Students'
// own invite links (/?ref=i-<code>, server/invites.js) count together as
// "invites" here.
//
//   POST /api/referrals { ref }   a visit through a link (once per browser)
//   GET  /api/referrals           the stats; only for ADMIN_EMAILS
//   GET  /api/referrals?mine=1    the signed-in student's invite link and rewards
//   …and the ratings and reviews in server/reviews.js (?review=mine,
//   POST { action: 'review' }, ?reviews=1 for admins), here to save a function.
//
// Attribution is first-touch: the link a student first arrived through is
// remembered in their browser, sent with their first sign-in, and kept on the
// account, so their later payments count for that link. Students without one
// count as "direct".
import { getSessionUser } from './auth.js'
import { sendJson } from './http.js'
import { inviteSummary, isInviteRef, recordInvitedSignup } from './invites.js'
import { listReviews, myReview, saveReview } from './reviews.js'
import { activeSubscription, getSubscription } from './subscriptions.js'

const REF = /^[a-z0-9_-]{1,32}$/
const DIRECT = 'direct'
const NO_EXPIRY = 10 * 365 * 24 * 60 * 60
const REFS_KEY = 'studypack:refs'
const counter = (ref, name) => `studypack:ref:${ref}:${name}`

// A clean link code, or null.
export function cleanRef(value) {
  const ref = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return REF.test(ref) ? ref : null
}

export const isAdmin = (user, env = process.env) =>
  Boolean(user?.email) &&
  (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .includes(user.email.toLowerCase())

async function bump(store, ref, name, amount = 1) {
  const row = isInviteRef(ref) ? 'invites' : ref
  await store.add(counter(row, name), amount, NO_EXPIRY)
  if (row !== DIRECT) await store.addMember(REFS_KEY, row)
}

// A student's first sign-in: remembers which link brought them, once.
export async function recordSignup(store, userId, ref) {
  if (!(await store.claim(`studypack:account:${userId}:new`, NO_EXPIRY))) return
  const source = cleanRef(ref) ?? DIRECT
  await store.setJson(`studypack:account:${userId}:ref`, source)
  await bump(store, source, 'signups')
  await recordInvitedSignup(store, userId, source)
}

// A payment that was just applied (server/billing.js). Resolves to true if
// it's the student's first.
export async function recordPayment(store, userId, amountNaira) {
  const source = (await store.getJson(`studypack:account:${userId}:ref`)) ?? DIRECT
  await bump(store, source, 'payments')
  await bump(store, source, 'revenue', Math.round(amountNaira))
  const first = await store.claim(`studypack:account:${userId}:paid`, NO_EXPIRY)
  if (first) await bump(store, source, 'payers')
  return first
}

export async function referralStats(store) {
  const refs = [...new Set([...(await store.members(REFS_KEY)), DIRECT])]
  const rows = await Promise.all(
    refs.map(async (ref) => {
      const [visits, signups, payers, payments, revenue] = await Promise.all(
        ['visits', 'signups', 'payers', 'payments', 'revenue'].map((name) => store.get(counter(ref, name))),
      )
      return { ref, visits: ref === DIRECT ? null : visits, signups, payers, payments, revenue }
    }),
  )
  return rows.sort((a, b) => b.revenue - a.revenue || b.signups - a.signups || a.ref.localeCompare(b.ref))
}

export async function handleReferralRequest(req, res, body, { store, getUser = getSessionUser, env = process.env } = {}) {
  if (!store) return sendJson(res, 503, { error: 'Not available right now.' })
  try {
    if (req.method === 'POST' && body?.action === 'review') {
      const user = await getUser(req)
      if (!user) return sendJson(res, 401, { error: 'Sign in to leave a review.' })
      const plan = activeSubscription(await getSubscription(store, user.id), Date.now())?.plan ?? 'free'
      const result = await saveReview(store, user, body, { plan })
      return result.error ? sendJson(res, result.status, { error: result.error }) : sendJson(res, 200, result)
    }
    if (req.method === 'POST') {
      const ref = cleanRef(body?.ref)
      if (ref) await bump(store, ref, 'visits')
      return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'GET') {
      const user = await getUser(req)
      const params = new URL(req.url ?? '/', 'http://x').searchParams
      if (params.has('mine')) {
        if (!user) return sendJson(res, 401, { error: 'Sign in to get your invite link.' })
        return sendJson(res, 200, await inviteSummary(store, user.id))
      }
      if (params.get('review') === 'mine') {
        if (!user) return sendJson(res, 401, { error: 'Sign in first.' })
        return sendJson(res, 200, { review: await myReview(store, user.id) })
      }
      if (!isAdmin(user, env)) return sendJson(res, 403, { error: 'Only StudyPack’s admins can see this.' })
      if (params.has('reviews')) return sendJson(res, 200, await listReviews(store))
      return sendJson(res, 200, { rows: await referralStats(store) })
    }
  } catch (err) {
    console.error('[referrals]', err.message)
    return sendJson(res, 503, { error: 'Not available right now.' })
  }
  sendJson(res, 405, { error: 'Method not allowed' })
}
