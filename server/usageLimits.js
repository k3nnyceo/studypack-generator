// Usage limits for AI generation, enforced on the server so a student can't
// reset them by clearing their browser. See server/plans.js for how usage is
// counted.
//
// The meter keeps two running totals per account, in naira of real Claude
// cost: one for the current 3-hour window and one for the current month (the
// calendar month, Lagos time, on Free; the paid 30-day period on Pro and Max).
// Free accounts also share a site-wide daily cap on packs, as a budget
// backstop; paid accounts skip it.
//
// The expected cost is reserved before calling Claude, then settled to the
// real cost when the pack is done, or released if generation fails, so errors
// don't use anyone's allowance.
import { Redis } from '@upstash/redis'
import { estimateCostUsd, plansFromEnv, toNaira, WINDOW_MS } from './plans.js'

const DAY_SECONDS = 24 * 60 * 60
const LAGOS_OFFSET_MS = 60 * 60 * 1000 // WAT is UTC+1 all year

// Upstash (production) if configured; an in-memory store for local
// development; otherwise null, which means "don't generate" rather than
// "generate without limits".
export function storeFromEnv(env = process.env) {
  const redis = redisFromEnv(env)
  if (redis) return upstashStore(redis)
  return isDeployed(env) ? null : memoryStore()
}

// Shared with the job, library and subscription stores.
export function redisFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN
  return url && token ? new Redis({ url, token }) : null
}

export const isDeployed = (env = process.env) => Boolean(env.VERCEL || env.NODE_ENV === 'production')

// A small key-value interface over Upstash: counters plus JSON records.
export function upstashStore(redis) {
  return {
    async add(key, amount, ttlSeconds) {
      const total = await redis.incrby(key, amount)
      await redis.expire(key, ttlSeconds)
      return total
    },
    get: async (key) => Number((await redis.get(key)) ?? 0),
    getJson: (key) => redis.get(key),
    setJson: (key, value) => redis.set(key, value),
    // true the first time a key is claimed, false after that.
    claim: async (key, ttlSeconds) => (await redis.set(key, 1, { nx: true, ex: ttlSeconds })) === 'OK',
    addMember: (key, member) => redis.sadd(key, member),
    members: async (key) => (await redis.smembers(key)) ?? [],
    // Hashes of JSON records (the Pack library's index).
    hset: (key, field, value) => redis.hset(key, { [field]: value }),
    hget: (key, field) => redis.hget(key, field),
    hgetall: async (key) => (await redis.hgetall(key)) ?? {},
    hdel: (key, field) => redis.hdel(key, field),
    del: (key) => redis.del(key),
    unclaim: (key) => redis.del(key),
  }
}

export function memoryStore() {
  const values = new Map()
  return {
    async add(key, amount) {
      const total = (values.get(key) ?? 0) + amount
      values.set(key, total)
      return total
    },
    get: async (key) => values.get(key) ?? 0,
    getJson: async (key) => values.get(key) ?? null,
    setJson: async (key, value) => void values.set(key, value),
    async claim(key) {
      if (values.has(key)) return false
      values.set(key, 1)
      return true
    },
    async addMember(key, member) {
      if (!values.has(key)) values.set(key, new Set())
      values.get(key).add(member)
    },
    members: async (key) => [...(values.get(key) ?? [])],
    async hset(key, field, value) {
      if (!values.has(key)) values.set(key, new Map())
      values.get(key).set(field, value)
    },
    hget: async (key, field) => values.get(key)?.get(field) ?? null,
    hgetall: async (key) => Object.fromEntries(values.get(key) ?? []),
    hdel: async (key, field) => void values.get(key)?.delete(field),
    del: async (key) => void values.delete(key),
    unclaim: async (key) => void values.delete(key),
  }
}

// The month a Free account's allowance belongs to: { id, endsAt }.
function lagosMonth(t) {
  const local = new Date(t + LAGOS_OFFSET_MS)
  const y = local.getUTCFullYear()
  const m = local.getUTCMonth()
  return { id: `m${y}-${String(m + 1).padStart(2, '0')}`, endsAt: Date.UTC(y, m + 1, 1) - LAGOS_OFFSET_MS }
}

export function createMeter(store, { plans = plansFromEnv(), siteDailyCap = 20, env = process.env } = {}, now = () => Date.now()) {
  // `subscription` is an active paid subscription (server/subscriptions.js) or null.
  function scope(userId, subscription) {
    const t = now()
    const plan = plans[subscription?.plan] ?? plans.free
    const windowIndex = Math.floor(t / WINDOW_MS)
    const period = subscription ? { id: `p${subscription.periodStart}`, endsAt: subscription.periodEnd } : lagosMonth(t)
    return {
      t,
      plan,
      period,
      windowKey: `studypack:use:${userId}:w:${windowIndex}`,
      windowEndsAt: (windowIndex + 1) * WINDOW_MS,
      periodKey: `studypack:use:${userId}:${period.id}`,
      periodTtl: Math.max(DAY_SECONDS, Math.ceil((period.endsAt - t) / 1000) + DAY_SECONDS),
      siteKey: `studypack:guides:${new Date(t).toISOString().slice(0, 10)}:free`,
    }
  }

  return {
    // { plan, window: { used, limit, resetsAt }, period: { used, limit, resetsAt } },
    // amounts in naira of Claude cost.
    async status(userId, subscription) {
      const s = scope(userId, subscription)
      const [windowUsed, periodUsed] = await Promise.all([store.get(s.windowKey), store.get(s.periodKey)])
      return {
        plan: s.plan.id,
        window: { used: windowUsed, limit: s.plan.windowNaira, resetsAt: s.windowEndsAt },
        period: { used: periodUsed, limit: s.plan.periodNaira, resetsAt: s.period.endsAt },
      }
    },

    // Reserves a pack's expected cost. Resolves to { ok: true, settle, release }
    // or { ok: false, reason: 'too-long' | 'window' | 'period' | 'site', resetsAt? }.
    async reserve(userId, subscription, chars) {
      const s = scope(userId, subscription)
      const expected = toNaira(estimateCostUsd(chars, s.plan.theory), env)
      if (chars > s.plan.maxChars || expected > s.plan.windowNaira || expected > s.plan.periodNaira) {
        return { ok: false, reason: 'too-long' }
      }
      return reserveIn(s, expected, { countPack: true })
    },

    // Reserves a known expected cost in naira for other Claude work (reading
    // scanned pages). Same allowances; doesn't count as a pack.
    async reserveCost(userId, subscription, expected) {
      const s = scope(userId, subscription)
      if (expected > s.plan.windowNaira || expected > s.plan.periodNaira) return { ok: false, reason: 'too-long' }
      return reserveIn(s, expected, { countPack: false })
    },

    // Counts one use of something with its own limits per 3-hour window and
    // per period (e.g. YouTube imports), using the same windows and periods.
    // Resolves to { ok: true, release } or { ok: false, reason, resetsAt }.
    async reserveCount(userId, subscription, kind, { perWindow, perPeriod }) {
      const s = scope(userId, subscription)
      const windowKey = s.windowKey.replace(':use:', `:${kind}:`)
      const periodKey = s.periodKey.replace(':use:', `:${kind}:`)
      const windowTtl = WINDOW_MS / 1000 + 3600
      const inWindow = await store.add(windowKey, 1, windowTtl)
      const inPeriod = await store.add(periodKey, 1, s.periodTtl)
      const undo = () => Promise.all([store.add(windowKey, -1, windowTtl), store.add(periodKey, -1, s.periodTtl)])
      if (inPeriod > perPeriod) {
        await undo()
        return { ok: false, reason: 'period', resetsAt: s.period.endsAt }
      }
      if (inWindow > perWindow) {
        await undo()
        return { ok: false, reason: 'window', resetsAt: s.windowEndsAt }
      }
      let released = false
      return {
        ok: true,
        left: { window: perWindow - inWindow, period: perPeriod - inPeriod },
        async release() {
          if (released) return
          released = true
          await undo()
        },
      }
    },
  }

  // Adds `expected` to both allowances, backing out if either is exceeded.
  // (A function declaration, so it's available to the methods above.)
  async function reserveIn(s, expected, { countPack }) {
    const windowUsed = await store.add(s.windowKey, expected, WINDOW_MS / 1000 + 3600)
    const periodUsed = await store.add(s.periodKey, expected, s.periodTtl)
    const undo = () =>
      Promise.all([store.add(s.windowKey, -expected, WINDOW_MS / 1000 + 3600), store.add(s.periodKey, -expected, s.periodTtl)])
    if (windowUsed > s.plan.windowNaira || periodUsed > s.plan.periodNaira) {
      await undo()
      // The month running out matters more: the window refilling won't help.
      return periodUsed > s.plan.periodNaira
        ? { ok: false, reason: 'period', resetsAt: s.period.endsAt }
        : { ok: false, reason: 'window', resetsAt: s.windowEndsAt }
    }

    // Only packs on Free count toward the site-wide daily cap.
    const free = s.plan.id === 'free' && countPack
    if (free && (await store.add(s.siteKey, 1, 2 * DAY_SECONDS)) > siteDailyCap) {
      await Promise.all([undo(), store.add(s.siteKey, -1, 2 * DAY_SECONDS)])
      return { ok: false, reason: 'site' }
    }

    let finished = false
    return {
      ok: true,
      // The work is done: charge its real cost (USD, or null if unknown)
      // instead of the estimate.
      async settle(costUsd) {
        if (finished) return
        finished = true
        const diff = costUsd === null || costUsd === undefined ? 0 : toNaira(costUsd, env) - expected
        if (diff) {
          await Promise.all([store.add(s.windowKey, diff, WINDOW_MS / 1000 + 3600), store.add(s.periodKey, diff, s.periodTtl)])
        }
      },
      // It failed or was cancelled: nothing is charged.
      async release() {
        if (finished) return
        finished = true
        await Promise.all([undo(), free && store.add(s.siteKey, -1, 2 * DAY_SECONDS)])
      },
    }
  }
}
