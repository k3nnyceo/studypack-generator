// Free-tier limits for AI generation, enforced on the server so a visitor
// can't reset them by clearing their browser.
//
// Two daily counters per UTC day: one per visitor (keyed by a salted hash of
// their IP, never the IP itself) and one for the whole site, as a budget cap.
// A slot is reserved before calling Claude and released if generation fails,
// so errors don't use up anyone's allowance.
import { createHash } from 'node:crypto'
import { Redis } from '@upstash/redis'

const DAY_SECONDS = 24 * 60 * 60

const numberFromEnv = (value, fallback) => {
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function limitsFromEnv(env = process.env) {
  return {
    perVisitor: numberFromEnv(env.FREE_GUIDES_PER_VISITOR_PER_DAY, 3),
    perDay: numberFromEnv(env.GUIDES_PER_DAY_TOTAL, 50),
    salt: env.IP_HASH_SALT || 'studypack',
  }
}

// Upstash (production) if configured; an in-memory store for local
// development; otherwise null, which means "don't generate" rather than
// "generate without limits".
export function storeFromEnv(env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN
  if (url && token) return upstashStore(new Redis({ url, token }))
  const deployed = env.VERCEL || env.NODE_ENV === 'production'
  return deployed ? null : memoryStore()
}

export function upstashStore(redis) {
  return {
    async increment(key) {
      const count = await redis.incr(key)
      if (count === 1) await redis.expire(key, 2 * DAY_SECONDS)
      return count
    },
    decrement: (key) => redis.decr(key),
  }
}

export function memoryStore() {
  const counts = new Map()
  return {
    async increment(key) {
      const count = (counts.get(key) ?? 0) + 1
      counts.set(key, count)
      return count
    },
    async decrement(key) {
      counts.set(key, Math.max(0, (counts.get(key) ?? 1) - 1))
    },
  }
}

export function createLimiter(store, { perVisitor, perDay, salt }, now = () => new Date()) {
  return {
    // Resolves to { ok: true, remaining, release } or { ok: false, message }.
    async reserve(ip) {
      const day = now().toISOString().slice(0, 10)
      const visitor = createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32)
      const visitorKey = `studypack:guides:${day}:v:${visitor}`
      const siteKey = `studypack:guides:${day}:all`

      const used = await store.increment(visitorKey)
      if (used > perVisitor) {
        await store.decrement(visitorKey)
        return {
          ok: false,
          message: `You’ve used your ${perVisitor} free study guide${perVisitor === 1 ? '' : 's'} for today. Come back tomorrow, or paste a study guide JSON instead.`,
        }
      }
      const siteUsed = await store.increment(siteKey)
      if (siteUsed > perDay) {
        await Promise.all([store.decrement(siteKey), store.decrement(visitorKey)])
        return { ok: false, message: 'StudyPack has reached today’s limit for free study guides. Please try again tomorrow.' }
      }

      let released = false
      return {
        ok: true,
        remaining: perVisitor - used,
        async release() {
          if (released) return
          released = true
          await Promise.all([store.decrement(siteKey), store.decrement(visitorKey)])
        },
      }
    },
  }
}

// The visitor's IP as seen through Vercel's proxy (or directly in local dev).
export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  const first = (Array.isArray(forwarded) ? forwarded[0] : forwarded)?.split(',')[0]?.trim()
  return req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || first || req.socket?.remoteAddress || 'unknown'
}
