// /api/library: a signed-in student's study pack library, so it's the same on
// every device. Shared by the Vercel function (api/library.js) and the local
// dev server (server/index.js).
//
//   GET               { entries: [summary] }  every pack, without its guide
//   GET    ?id=<id>   { entry }               one pack, with its guide
//   PUT    { entry }  { entry: summary }      save a pack (new or re-saved)
//   DELETE ?id=<id>   { ok: true }
//   ?progress=1       study progress (XP, streak, exam plan, …): see below
//   ?push=1           daily reminders on this device: see below
//   ?cron=reminders   the daily reminder run (Vercel cron, server/reminders.js)
//
// A summary is a library entry (src/lib/library.js) without `guide`:
// { id, title, course, topic, sourceName, savedAt, fingerprint }. Listing
// summaries first lets a device download only the packs it doesn't have.
//
// In Upstash, per account: a hash of summaries (studypack:lib:<user>) and one
// key per guide (studypack:pack:<user>:<id>).
import { getSessionUser } from './auth.js'
import { sendJson } from './http.js'
import { isDeployed, redisFromEnv } from './usageLimits.js'
import { describe } from '../src/lib/library.js'
import { mergeProgress } from '../src/lib/progressMerge.js'
import { isSubscription, sendReminders, vapidFromEnv, withDevice } from './reminders.js'
import { validateStudyGuide } from '../src/lib/studyGuideFormat.js'

export const MAX_PACKS = 300
// A generated pack is ~30–60 KB; this leaves room for long hand-written ones.
export const MAX_PACK_BYTES = 800 * 1024
const ENTRY_ID = /^[\w-]{1,64}$/

export function libraryStoreFromEnv(env = process.env) {
  const redis = redisFromEnv(env)
  if (redis) return upstashLibraryStore(redis)
  return isDeployed(env) ? null : memoryLibraryStore()
}

export function upstashLibraryStore(redis) {
  const index = (user) => `studypack:lib:${user}`
  const pack = (user, id) => `studypack:pack:${user}:${id}`
  return {
    async list(user) {
      return Object.values((await redis.hgetall(index(user))) ?? {})
    },
    count: (user) => redis.hlen(index(user)),
    has: async (user, id) => Boolean(await redis.hexists(index(user), id)),
    async get(user, id) {
      const [summary, guide] = await Promise.all([redis.hget(index(user), id), redis.get(pack(user, id))])
      return summary && guide ? { ...summary, guide } : null
    },
    async put(user, { guide, ...summary }) {
      await redis.set(pack(user, summary.id), guide)
      await redis.hset(index(user), { [summary.id]: summary })
    },
    async remove(user, id) {
      await redis.hdel(index(user), id)
      await redis.del(pack(user, id))
    },
    getProgress: (user) => redis.get(`studypack:progress:${user}`),
    setProgress: (user, progress) => redis.set(`studypack:progress:${user}`, progress),
    // Reminder subscriptions: per account, plus the set of accounts with any.
    getPush: async (user) => (await redis.get(`studypack:push:${user}`)) ?? [],
    async setPush(user, devices) {
      if (devices.length) {
        await redis.set(`studypack:push:${user}`, devices)
        await redis.sadd('studypack:push:users', user)
      } else {
        await redis.del(`studypack:push:${user}`)
        await redis.srem('studypack:push:users', user)
      }
    },
    pushUsers: async () => (await redis.smembers('studypack:push:users')) ?? [],
    // True the first time for a day, so a retried cron doesn't send twice.
    markReminded: async (user, day) => (await redis.set(`studypack:push:sent:${user}:${day}`, 1, { nx: true, ex: 2 * 24 * 60 * 60 })) === 'OK',
  }
}

export function memoryLibraryStore() {
  const users = new Map()
  const progress = new Map()
  const push = new Map()
  const reminded = new Set()
  const packs = (user) => users.get(user) ?? users.set(user, new Map()).get(user)
  return {
    list: async (user) => [...packs(user).values()].map(({ guide: _guide, ...summary }) => summary),
    count: async (user) => packs(user).size,
    has: async (user, id) => packs(user).has(id),
    get: async (user, id) => packs(user).get(id) ?? null,
    put: async (user, entry) => void packs(user).set(entry.id, entry),
    remove: async (user, id) => void packs(user).delete(id),
    getProgress: async (user) => progress.get(user) ?? null,
    setProgress: async (user, value) => void progress.set(user, value),
    getPush: async (user) => push.get(user) ?? [],
    setPush: async (user, devices) => void (devices.length ? push.set(user, devices) : push.delete(user)),
    pushUsers: async () => [...push.keys()],
    markReminded: async (user, day) => !reminded.has(`${user}:${day}`) && Boolean(reminded.add(`${user}:${day}`)),
  }
}

let defaultStore
function getDefaultStore() {
  if (defaultStore === undefined) defaultStore = libraryStoreFromEnv()
  return defaultStore
}

export async function handleLibraryRequest(req, res, body, { store = getDefaultStore(), getUser = getSessionUser, env = process.env, send } = {}) {
  const params = new URL(req.url, 'http://localhost').searchParams
  if (params.get('cron') === 'reminders') return handleReminderRun(req, res, store, env, send)
  const user = await getUser(req)
  if (!user) return sendJson(res, 401, { error: 'Sign in to sync your library.' })
  if (!store) {
    console.error('[library] No Upstash store configured; library sync is off.')
    return sendJson(res, 503, { error: 'Library sync isn’t available right now.' })
  }

  if (params.has('progress')) return handleProgress(req, res, user, body, store)
  if (params.has('push')) return handlePush(req, res, user, body, store, env)
  const id = params.get('id')
  if (id !== null && !ENTRY_ID.test(id)) return sendJson(res, 400, { error: 'Invalid pack id.' })

  try {
    if (req.method === 'GET' && id === null) return sendJson(res, 200, { entries: await store.list(user.id) })
    if (req.method === 'GET') {
      const entry = await store.get(user.id, id)
      return entry ? sendJson(res, 200, { entry }) : sendJson(res, 404, { error: 'That pack isn’t in your library.' })
    }
    if (req.method === 'DELETE' && id !== null) {
      await store.remove(user.id, id)
      return sendJson(res, 200, { ok: true })
    }
    if (req.method === 'PUT') return await savePack(res, user, body?.entry, store)
  } catch (err) {
    console.error('[library] Store failed:', err.message)
    return sendJson(res, 503, { error: 'Library sync isn’t available right now.' })
  }
  sendJson(res, 405, { error: 'Method not allowed' })
}

// Study progress (XP, focus minutes, streak, exam plan, flashcard memory and
// quiz answers), so it's the same on every device: src/lib/progressSync.js.
//   GET ?progress=1               { progress } the account's, or null
//   PUT ?progress=1 { upload }    merges this device's upload into it
//                                 (src/lib/progressMerge.js) -> { progress }
// Merged here rather than on the device, so two devices syncing at once
// can't overwrite each other's progress.
export const MAX_PROGRESS_BYTES = 900 * 1024
const DEVICE_ID = /^[\w-]{8,64}$/

async function handleProgress(req, res, user, body, store) {
  try {
    if (req.method === 'GET') return sendJson(res, 200, { progress: (await store.getProgress(user.id)) ?? null })
    if (req.method !== 'PUT') return sendJson(res, 405, { error: 'Method not allowed' })
    const upload = body?.upload
    if (!upload || typeof upload !== 'object' || !DEVICE_ID.test(upload.device ?? '')) return sendJson(res, 400, { error: 'Invalid progress.' })
    const merged = mergeProgress((await store.getProgress(user.id)) ?? {}, upload)
    if (JSON.stringify(merged).length > MAX_PROGRESS_BYTES) {
      // Quiz answers are the bulk and the least needed elsewhere: drop them first.
      merged.results = {}
      if (JSON.stringify(merged).length > MAX_PROGRESS_BYTES) return sendJson(res, 413, { error: 'Your progress is too large to sync.' })
    }
    await store.setProgress(user.id, merged)
    return sendJson(res, 200, { progress: merged })
  } catch (err) {
    console.error('[library] Progress sync failed:', err.message)
    return sendJson(res, 503, { error: 'Progress sync isn’t available right now.' })
  }
}

// Daily reminders (server/reminders.js, src/lib/reminders.js):
//   GET ?push=1                     { key } the VAPID public key, or null when off
//   PUT ?push=1 { subscription }    this device gets reminders
//   PUT ?push=1 { remove: endpoint } it stops
async function handlePush(req, res, user, body, store, env) {
  const vapid = vapidFromEnv(env)
  if (req.method === 'GET') return sendJson(res, 200, { key: vapid?.publicKey ?? null })
  if (req.method !== 'PUT') return sendJson(res, 405, { error: 'Method not allowed' })
  if (!vapid) return sendJson(res, 503, { error: 'Reminders aren’t available right now.' })
  try {
    const devices = await store.getPush(user.id)
    if (typeof body?.remove === 'string') {
      await store.setPush(user.id, devices.filter((d) => d.endpoint !== body.remove))
      return sendJson(res, 200, { ok: true })
    }
    if (!isSubscription(body?.subscription)) return sendJson(res, 400, { error: 'Invalid subscription.' })
    await store.setPush(user.id, withDevice(devices, body.subscription))
    return sendJson(res, 200, { ok: true })
  } catch (err) {
    console.error('[library] Reminder settings failed:', err.message)
    return sendJson(res, 503, { error: 'Reminders aren’t available right now.' })
  }
}

// Vercel sends `Authorization: Bearer <CRON_SECRET>` with each cron request.
async function handleReminderRun(req, res, store, env, send) {
  if (!env.CRON_SECRET || req.headers?.authorization !== `Bearer ${env.CRON_SECRET}`) return sendJson(res, 401, { error: 'Not allowed.' })
  const vapid = vapidFromEnv(env)
  if (!vapid || !store) return sendJson(res, 503, { error: 'Reminders aren’t set up.' })
  try {
    const result = await sendReminders({ store, vapid, ...(send ? { send } : {}) })
    console.log(`[reminders] students=${result.students} sent=${result.sent} removed=${result.removed}`)
    return sendJson(res, 200, result)
  } catch (err) {
    console.error('[reminders] Run failed:', err.message)
    return sendJson(res, 503, { error: 'The reminder run failed.' })
  }
}

async function savePack(res, user, entry, store) {
  if (!ENTRY_ID.test(entry?.id ?? '')) return sendJson(res, 400, { error: 'Invalid pack id.' })
  if (JSON.stringify(entry.guide ?? null).length > MAX_PACK_BYTES) {
    return sendJson(res, 413, { error: 'This pack is too large to sync.' })
  }
  const result = validateStudyGuide(entry.guide)
  if (!result.ok) return sendJson(res, 400, { error: 'This pack isn’t a valid study guide.' })

  if (!(await store.has(user.id, entry.id)) && (await store.count(user.id)) >= MAX_PACKS) {
    return sendJson(res, 409, { error: `Your synced library is full (${MAX_PACKS} packs). Delete a few to make room.` })
  }
  // Rebuilt from the validated guide, so stored summaries always match it.
  const saved = describe(result.guide, { id: entry.id, sourceName: entry.sourceName?.slice?.(0, 200), savedAt: entry.savedAt })
  await store.put(user.id, saved)
  const { guide: _guide, ...summary } = saved
  sendJson(res, 200, { entry: summary })
}
