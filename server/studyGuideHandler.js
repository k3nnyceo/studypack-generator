// /api/study-guide, shared by the Vercel function (api/study-guide.js) and the
// local dev server (server/index.js).
//
//   POST   { text, fileName }  validate -> reserve a free-tier slot -> start a
//                              job -> 202 { jobId, remaining }
//   GET    ?job=<id>           the job: { status, guide?, error? }
//   DELETE ?job=<id>           cancel it
//
// The work runs after the POST has been answered (waitUntil on Vercel; the
// local server simply keeps running), so a phone locking its screen or
// switching apps no longer kills generation. See server/jobs.js.
import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { waitUntil } from '@vercel/functions'
import { jobStoreFromEnv } from './jobs.js'
import { generateStudyGuide, MAX_INPUT_CHARS, StudyGuideError } from './studyGuide.js'
import { clientIp, createLimiter, limitsFromEnv, storeFromEnv } from './usageLimits.js'

// How often a running job checks whether the visitor cancelled it.
const CANCEL_CHECK_MS = 5000
// A job still "running" after this was cut off by the function time limit
// (300s on Vercel Hobby) without a chance to record it.
const STALE_JOB_MS = 330_000
const JOB_ID = /^[0-9a-f-]{36}$/

let defaultLimiter
function getDefaultLimiter() {
  if (defaultLimiter === undefined) {
    const store = storeFromEnv()
    defaultLimiter = store ? createLimiter(store, limitsFromEnv()) : null
  }
  return defaultLimiter
}

let defaultJobs
function getDefaultJobs() {
  if (defaultJobs === undefined) defaultJobs = jobStoreFromEnv()
  return defaultJobs
}

export const aiGenerationEnabled = (env = process.env) => env.VITE_ENABLE_AI_GENERATION === 'true'

const unavailable = (res) =>
  sendJson(res, 503, { error: 'Study guide generation isn’t available right now. Please try again later.' })

export async function handleStudyGuideRequest(
  req,
  res,
  body,
  {
    limiter = getDefaultLimiter(),
    jobs = getDefaultJobs(),
    generate = generateStudyGuide,
    enabled = aiGenerationEnabled(),
    runInBackground = waitUntil,
  } = {},
) {
  if (!enabled) {
    return sendJson(res, 503, { error: 'AI generation is turned off on this server.' })
  }
  if (!limiter || !jobs) {
    console.error('[study-guide] No Upstash store configured (UPSTASH_REDIS_REST_URL / _TOKEN); refusing to generate.')
    return unavailable(res)
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const fileName = typeof body?.fileName === 'string' ? body.fileName.slice(0, 200) : ''
  if (!text) return sendJson(res, 400, { error: 'No text was provided.' })
  if (text.length > MAX_INPUT_CHARS) {
    return sendJson(res, 413, {
      error: `These notes are too long for a free study guide (about ${Math.round(MAX_INPUT_CHARS / 1000)}K characters max). Try splitting them into smaller files.`,
    })
  }

  let slot
  try {
    slot = await limiter.reserve(clientIp(req))
  } catch (err) {
    console.error('[study-guide] Usage-limit store failed:', err.message)
    return unavailable(res)
  }
  if (!slot.ok) return sendJson(res, 429, { error: slot.message })

  const jobId = randomUUID()
  const startedAt = Date.now()
  try {
    await jobs.set(jobId, { status: 'running', startedAt })
  } catch (err) {
    console.error('[study-guide] Job store failed:', err.message)
    await slot.release().catch(() => {})
    return unavailable(res)
  }

  runInBackground(runJob({ jobId, startedAt, text, fileName, slot, jobs, generate }))
  sendJson(res, 202, { jobId, remaining: slot.remaining })
}

async function runJob({ jobId, startedAt, text, fileName, slot, jobs, generate }) {
  // The visitor's Cancel arrives as a separate request, recorded in the store.
  const abort = new AbortController()
  const cancelCheck = setInterval(async () => {
    const job = await jobs.get(jobId).catch(() => null)
    if (job?.status === 'cancelled') abort.abort()
  }, CANCEL_CHECK_MS)

  try {
    const guide = await generate({ text, fileName, signal: abort.signal })
    await jobs.set(jobId, { status: 'done', startedAt, guide })
  } catch (err) {
    await slot.release().catch((e) => console.error('[study-guide] Could not release usage slot:', e.message))
    if (abort.signal.aborted) {
      console.log('[study-guide] Visitor cancelled; generation stopped.')
      return
    }
    const { status, message } = toClientError(err)
    console.error(`[study-guide] Generation failed (${status}):`, err.message)
    await jobs
      .set(jobId, { status: 'error', startedAt, error: message })
      .catch((e) => console.error('[study-guide] Could not save job error:', e.message))
  } finally {
    clearInterval(cancelCheck)
  }
}

// GET ?job=<id> (poll) and DELETE ?job=<id> (cancel).
export async function handleJobRequest(req, res, { jobs = getDefaultJobs(), now = Date.now } = {}) {
  const jobId = new URL(req.url, 'http://localhost').searchParams.get('job') ?? ''
  if (!JOB_ID.test(jobId)) return sendJson(res, 400, { error: 'Missing or invalid job id.' })
  if (!jobs) return unavailable(res)

  let job
  try {
    job = await jobs.get(jobId)
  } catch (err) {
    console.error('[study-guide] Job store failed:', err.message)
    return unavailable(res)
  }
  if (!job) return sendJson(res, 404, { error: 'This study pack request has expired. Please generate it again.' })

  if (req.method === 'DELETE') {
    if (job.status === 'running') await jobs.set(jobId, { ...job, status: 'cancelled' }).catch(() => {})
    return sendJson(res, 200, { status: 'cancelled' })
  }

  if (job.status === 'running' && now() - job.startedAt > STALE_JOB_MS) {
    return sendJson(res, 200, {
      status: 'error',
      error: 'This study pack took too long to write. Please try again, or try a shorter file.',
    })
  }
  sendJson(res, 200, job.status === 'cancelled' ? { status: 'cancelled' } : job)
}

// Maps SDK errors to messages that are safe and useful to show a student.
export function toClientError(err) {
  if (err instanceof StudyGuideError) {
    return { status: err.status, message: err.message }
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { status: 500, message: 'Study guide generation isn’t set up correctly on the server.' }
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, message: 'StudyPack is busy right now. Please try again in a minute.' }
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { status: 400, message: 'Claude couldn’t process this document.' }
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 502, message: 'Couldn’t reach Claude. Please try again.' }
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 502, message: 'Claude is temporarily unavailable. Please try again.' }
  }
  // Thrown by the SDK constructor when no credentials are configured.
  if (err instanceof Anthropic.AnthropicError) {
    return { status: 500, message: 'Study guide generation isn’t set up correctly on the server.' }
  }
  return { status: 500, message: 'Something went wrong generating the study guide.' }
}

export function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}
