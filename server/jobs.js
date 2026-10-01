// Study guide generation jobs. Generation takes a minute or two, longer than a
// phone will reliably hold a connection open (it drops it when the screen
// locks or the visitor switches apps). So a POST starts a job and returns its
// id at once, the work carries on in the background, and the browser polls
// for the result, picking it back up even after the page reloads.
//
// A job is { status, startedAt, guide?, error? }, where status is
// 'running' | 'done' | 'error' | 'cancelled'. Ids are random UUIDs, so only
// the visitor who started a job can read it.
import { isDeployed, redisFromEnv } from './usageLimits.js'

const JOB_TTL_SECONDS = 60 * 60

export function jobStoreFromEnv(env = process.env) {
  const redis = redisFromEnv(env)
  if (redis) return upstashJobStore(redis)
  return isDeployed(env) ? null : memoryJobStore()
}

export function upstashJobStore(redis) {
  const key = (id) => `studypack:job:${id}`
  return {
    get: (id) => redis.get(key(id)),
    set: (id, job) => redis.set(key(id), job, { ex: JOB_TTL_SECONDS }),
  }
}

export function memoryJobStore() {
  const jobs = new Map()
  return {
    async get(id) {
      return jobs.get(id) ?? null
    },
    async set(id, job) {
      jobs.set(id, job)
      setTimeout(() => jobs.delete(id), JOB_TTL_SECONDS * 1000).unref?.()
    },
  }
}
