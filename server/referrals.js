// Where students come from: share links like /?ref=tiktok or /?ref=ada (an
// ambassador), and see visits, sign-ups and payments per link.
//
//   POST /api/referrals { ref }   a visit through a link (once per browser)
//   GET  /api/referrals           the stats; only for ADMIN_EMAILS
//
// Attribution is first-touch: the link a student first arrived through is
// remembered in their browser, sent with their first sign-in, and kept on the
// account, so their later payments count for that link. Students without one
// count as "direct".
import { getSessionUser } from './auth.js'
import { sendJson } from './http.js'

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
  await store.add(counter(ref, name), amount, NO_EXPIRY)
  if (ref !== DIRECT) await store.addMember(REFS_KEY, ref)
}

// A student's first sign-in: remembers which link brought them, once.
export async function recordSignup(store, userId, ref) {
  if (!(await store.claim(`studypack:account:${userId}:new`, NO_EXPIRY))) return
  const source = cleanRef(ref) ?? DIRECT
  await store.setJson(`studypack:account:${userId}:ref`, source)
  await bump(store, source, 'signups')
}

// A payment that was just applied (server/billing.js).
export async function recordPayment(store, userId, amountNaira) {
  const source = (await store.getJson(`studypack:account:${userId}:ref`)) ?? DIRECT
  await bump(store, source, 'payments')
  await bump(store, source, 'revenue', Math.round(amountNaira))
  if (await store.claim(`studypack:account:${userId}:paid`, NO_EXPIRY)) await bump(store, source, 'payers')
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
    if (req.method === 'POST') {
      const ref = cleanRef(body?.ref)
      if (ref) await bump(store, ref, 'visits')
      return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'GET') {
      const user = await getUser(req)
      if (!isAdmin(user, env)) return sendJson(res, 403, { error: 'Only StudyPack’s admins can see this.' })
      return sendJson(res, 200, { rows: await referralStats(store) })
    }
  } catch (err) {
    console.error('[referrals]', err.message)
    return sendJson(res, 503, { error: 'Not available right now.' })
  }
  sendJson(res, 405, { error: 'Method not allowed' })
}
