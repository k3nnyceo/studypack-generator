// /api/shared: the Pack library, ready-made study packs any student can add
// to their own library. StarterPack's admins publish "verified" packs; students
// can choose to share packs from their own library (anonymously).
//
//   GET                       every pack's summary (public), plus the signed-in
//                             student's daily allowance
//   GET  ?id=<id>             one pack with its guide; adding it uses one of the
//                             day's allowance (Free 5, Pro 15, Max 40), and
//                             adding the same pack again that day doesn't
//   POST { action: 'share', entry: { guide, sourceName } }
//   POST { action: 'remove', id }   by whoever shared it, or an admin
//
// Opening a pack that's already written costs no Claude usage, so this is a
// separate allowance from generation. In Upstash: one hash of summaries
// (studypack:shared) and one key per guide (studypack:shared:pack:<id>).
import { randomUUID } from 'node:crypto'
import { getSessionUser } from './auth.js'
import { sendJson } from './http.js'
import { plansFromEnv } from './plans.js'
import { isAdmin } from './referrals.js'
import { activeSubscription, getSubscription } from './subscriptions.js'
import { describe } from '../src/lib/library.js'
import { validateStudyGuide } from '../src/lib/studyGuideFormat.js'

const INDEX = 'studypack:shared'
const packKey = (id) => `studypack:shared:pack:${id}`
const MAX_PACK_BYTES = 800 * 1024
const SHARES_PER_DAY = 20
const DAY_SECONDS = 24 * 60 * 60
const LAGOS_OFFSET_MS = 60 * 60 * 1000
const ID = /^[0-9a-f-]{36}$/

// The day (Lagos time) an allowance belongs to, and when it ends.
function lagosDay(t) {
  const local = new Date(t + LAGOS_OFFSET_MS)
  const start = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - LAGOS_OFFSET_MS
  return { id: local.toISOString().slice(0, 10), endsAt: start + DAY_SECONDS * 1000 }
}

// What students see: no record of who shared it, just whether it's theirs.
const forClient = (summary, user) => {
  const { sharedBy, ...rest } = summary
  return { ...rest, mine: Boolean(user && sharedBy === user.id) }
}

export async function handleSharedRequest(req, res, body, deps = {}) {
  const { store, getUser = getSessionUser, env = process.env, now = Date.now } = deps
  if (!store) return sendJson(res, 503, { error: 'The Pack library isn’t available right now.' })
  const user = await getUser(req)
  const id = new URL(req.url, 'http://localhost').searchParams.get('id')

  try {
    if (req.method === 'GET' && id === null) {
      const packs = Object.values((await store.hgetall(INDEX)) ?? {})
        .map((s) => forClient(s, user))
        .sort((a, b) => Number(b.verified) - Number(a.verified) || b.sharedAt - a.sharedAt)
      return sendJson(res, 200, {
        packs,
        allowance: user ? await allowance(store, user, env, now()) : null,
        canModerate: isAdmin(user, env),
      })
    }

    if (!user) return sendJson(res, 401, { error: 'Sign in to add packs from the library.' })

    if (req.method === 'GET') {
      if (!ID.test(id)) return sendJson(res, 400, { error: 'Invalid pack id.' })
      const [summary, guide] = await Promise.all([store.hget(INDEX, id), store.getJson(packKey(id))])
      if (!summary || !guide) return sendJson(res, 404, { error: 'That pack has been removed from the library.' })

      const limits = await allowance(store, user, env, now())
      const day = lagosDay(now())
      // The same pack again today is free.
      if (await store.claim(`studypack:libadd:${user.id}:${day.id}:${id}`, 2 * DAY_SECONDS)) {
        const used = await store.add(`studypack:libadds:${user.id}:${day.id}`, 1, 2 * DAY_SECONDS)
        if (used > limits.limit) {
          await store.add(`studypack:libadds:${user.id}:${day.id}`, -1, 2 * DAY_SECONDS)
          await store.unclaim(`studypack:libadd:${user.id}:${day.id}:${id}`)
          return sendJson(res, 429, {
            error: `You’ve added today’s ${limits.limit} pack${limits.limit === 1 ? '' : 's'} from the library.`,
            reason: 'library',
            resetsAt: day.endsAt,
            plan: limits.plan,
          })
        }
        limits.used = used
      }
      return sendJson(res, 200, { entry: { ...forClient(summary, user), guide }, allowance: limits })
    }

    if (req.method === 'POST' && body?.action === 'share') return await share(res, store, user, body.entry, env, now())

    if (req.method === 'POST' && body?.action === 'remove') {
      const summary = ID.test(body.id ?? '') ? await store.hget(INDEX, body.id) : null
      if (!summary) return sendJson(res, 404, { error: 'That pack isn’t in the library.' })
      if (summary.sharedBy !== user.id && !isAdmin(user, env)) return sendJson(res, 403, { error: 'Only whoever shared a pack can remove it.' })
      await store.hdel(INDEX, body.id)
      await store.del(packKey(body.id))
      return sendJson(res, 200, { ok: true })
    }
  } catch (err) {
    console.error('[shared]', err.message)
    return sendJson(res, 503, { error: 'The Pack library isn’t available right now.' })
  }
  sendJson(res, 405, { error: 'Method not allowed' })
}

async function allowance(store, user, env, t) {
  const subscription = activeSubscription(await getSubscription(store, user.id), t)
  const plan = plansFromEnv(env)[subscription?.plan ?? 'free']
  const day = lagosDay(t)
  return {
    plan: plan.id,
    used: await store.get(`studypack:libadds:${user.id}:${day.id}`),
    limit: plan.libraryPerDay,
    resetsAt: day.endsAt,
  }
}

async function share(res, store, user, entry, env, t) {
  if (JSON.stringify(entry?.guide ?? null).length > MAX_PACK_BYTES) return sendJson(res, 413, { error: 'This pack is too large to share.' })
  const result = validateStudyGuide(entry?.guide)
  if (!result.ok) return sendJson(res, 400, { error: 'This pack isn’t a valid study guide.' })

  const pack = describe(result.guide, { sourceName: '' })
  const existing = Object.values((await store.hgetall(INDEX)) ?? {}).find((s) => s.fingerprint === pack.fingerprint)
  if (existing) return sendJson(res, 200, { pack: forClient(existing, user), alreadyShared: true })

  const day = lagosDay(t)
  if ((await store.add(`studypack:shares:${user.id}:${day.id}`, 1, 2 * DAY_SECONDS)) > SHARES_PER_DAY) {
    return sendJson(res, 429, { error: `You can share up to ${SHARES_PER_DAY} packs a day.` })
  }

  const id = randomUUID()
  const summary = {
    id,
    title: pack.title,
    course: pack.course,
    topic: pack.topic,
    fingerprint: pack.fingerprint,
    modules: result.guide.modules.length,
    verified: isAdmin(user, env),
    sharedBy: user.id,
    sharedAt: t,
  }
  await store.setJson(packKey(id), result.guide)
  await store.hset(INDEX, id, summary)
  return sendJson(res, 200, { pack: forClient(summary, user) })
}
