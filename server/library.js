// /api/library: a signed-in student's study pack library, so it's the same on
// every device. Shared by the Vercel function (api/library.js) and the local
// dev server (server/index.js).
//
//   GET               { entries: [summary] }  every pack, without its guide
//   GET    ?id=<id>   { entry }               one pack, with its guide
//   PUT    { entry }  { entry: summary }      save a pack (new or re-saved)
//   DELETE ?id=<id>   { ok: true }
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
  }
}

export function memoryLibraryStore() {
  const users = new Map()
  const packs = (user) => users.get(user) ?? users.set(user, new Map()).get(user)
  return {
    list: async (user) => [...packs(user).values()].map(({ guide: _guide, ...summary }) => summary),
    count: async (user) => packs(user).size,
    has: async (user, id) => packs(user).has(id),
    get: async (user, id) => packs(user).get(id) ?? null,
    put: async (user, entry) => void packs(user).set(entry.id, entry),
    remove: async (user, id) => void packs(user).delete(id),
  }
}

let defaultStore
function getDefaultStore() {
  if (defaultStore === undefined) defaultStore = libraryStoreFromEnv()
  return defaultStore
}

export async function handleLibraryRequest(req, res, body, { store = getDefaultStore(), getUser = getSessionUser } = {}) {
  const user = await getUser(req)
  if (!user) return sendJson(res, 401, { error: 'Sign in to sync your library.' })
  if (!store) {
    console.error('[library] No Upstash store configured; library sync is off.')
    return sendJson(res, 503, { error: 'Library sync isn’t available right now.' })
  }

  const id = new URL(req.url, 'http://localhost').searchParams.get('id')
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
