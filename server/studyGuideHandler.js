// /api/study-guide, shared by the Vercel function (api/study-guide.js) and the
// local dev server (server/index.js).
//
//   POST   { text, fileName }  signed in? -> validate -> reserve the pack's
//                              expected cost on the account's plan -> start a
//                              job -> 202 { jobId }
//   GET    ?job=<id>           the job: { status, guide?, error? }
//   DELETE ?job=<id>           cancel it
//
// The work runs after the POST has been answered (waitUntil on Vercel; the
// local server simply keeps running), so a phone locking its screen or
// switching apps no longer kills generation. See server/jobs.js.
//
// Generating needs a Google sign-in (server/auth.js): usage is metered per
// account against its plan (server/usageLimits.js, server/plans.js), and a job
// can only be read or cancelled by the account that started it. When a pack
// is done, its real cost replaces the estimate; if it fails, nothing is charged.
import { randomUUID } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import { waitUntil } from '@vercel/functions'
import { getSessionUser } from './auth.js'
import { getDefaults } from './billing.js'
import { sendJson } from './http.js'
import { jobStoreFromEnv } from './jobs.js'
import { plansFromEnv } from './plans.js'
import { generateStudyGuide, StudyGuideError } from './studyGuide.js'
import { activeSubscription, getSubscription } from './subscriptions.js'

export { sendJson }

// How often a running job checks whether the visitor cancelled it.
const CANCEL_CHECK_MS = 5000
// A job still "running" after this was cut off by the function time limit
// (300s on Vercel Hobby) without a chance to record it.
const STALE_JOB_MS = 330_000
const JOB_ID = /^[0-9a-f-]{36}$/

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
    store = getDefaults().store,
    meter = getDefaults().meter,
    jobs = getDefaultJobs(),
    generate = generateStudyGuide,
    enabled = aiGenerationEnabled(),
    runInBackground = waitUntil,
    getUser = getSessionUser,
  } = {},
) {
  if (!enabled) {
    return sendJson(res, 503, { error: 'AI generation is turned off on this server.' })
  }
  if (!store || !meter || !jobs) {
    console.error('[study-guide] No Upstash store configured (UPSTASH_REDIS_REST_URL / _TOKEN); refusing to generate.')
    return unavailable(res)
  }

  const user = await getUser(req)
  if (!user) return sendJson(res, 401, { error: 'Sign in with Google to generate a study pack.' })

  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  const fileName = typeof body?.fileName === 'string' ? body.fileName.slice(0, 200) : ''
  if (!text) return sendJson(res, 400, { error: 'No text was provided.' })

  let slot, plan
  try {
    const subscription = activeSubscription(await getSubscription(store, user.id))
    plan = plansFromEnv()[subscription?.plan ?? 'free']
    slot = await meter.reserve(user.id, subscription, text.length)
  } catch (err) {
    console.error('[study-guide] Usage store failed:', err.message)
    return unavailable(res)
  }
  if (!slot.ok) {
    const { status, error } = limitMessage(slot.reason, plan)
    return sendJson(res, status, { error, reason: slot.reason, resetsAt: slot.resetsAt ?? null, plan: plan.id })
  }

  const jobId = randomUUID()
  const startedAt = Date.now()
  try {
    await jobs.set(jobId, { status: 'running', startedAt, owner: user.id })
  } catch (err) {
    console.error('[study-guide] Job store failed:', err.message)
    await slot.release().catch(() => {})
    return unavailable(res)
  }

  runInBackground(runJob({ jobId, startedAt, owner: user.id, text, fileName, slot, jobs, generate, theory: plan.theory }))
  sendJson(res, 202, { jobId })
}

async function runJob({ jobId, startedAt, owner, text, fileName, slot, jobs, generate, theory }) {
  // The visitor's Cancel arrives as a separate request, recorded in the store.
  const abort = new AbortController()
  const cancelCheck = setInterval(async () => {
    const job = await jobs.get(jobId).catch(() => null)
    if (job?.status === 'cancelled') abort.abort()
  }, CANCEL_CHECK_MS)

  try {
    let cost = null
    const guide = await generate({ text, fileName, theory, signal: abort.signal, onCost: (usd) => (cost = usd) })
    await slot.settle(cost).catch((e) => console.error('[study-guide] Could not record usage:', e.message))
    await jobs.set(jobId, { status: 'done', startedAt, owner, guide })
  } catch (err) {
    await slot.release().catch((e) => console.error('[study-guide] Could not release usage slot:', e.message))
    if (abort.signal.aborted) {
      console.log('[study-guide] Visitor cancelled; generation stopped.')
      return
    }
    const { status, message } = toClientError(err)
    console.error(`[study-guide] Generation failed (${status}):`, err.message)
    await jobs
      .set(jobId, { status: 'error', startedAt, owner, error: message })
      .catch((e) => console.error('[study-guide] Could not save job error:', e.message))
  } finally {
    clearInterval(cancelCheck)
  }
}

// GET ?job=<id> (poll) and DELETE ?job=<id> (cancel).
export async function handleJobRequest(req, res, { jobs = getDefaultJobs(), now = Date.now, getUser = getSessionUser } = {}) {
  const jobId = new URL(req.url, 'http://localhost').searchParams.get('job') ?? ''
  if (!JOB_ID.test(jobId)) return sendJson(res, 400, { error: 'Missing or invalid job id.' })
  if (!jobs) return unavailable(res)
  const user = await getUser(req)
  if (!user) return sendJson(res, 401, { error: 'Sign in with Google to see this study pack.' })

  let job
  try {
    job = await jobs.get(jobId)
  } catch (err) {
    console.error('[study-guide] Job store failed:', err.message)
    return unavailable(res)
  }
  // Someone else's job is reported as missing, not forbidden.
  if (!job || job.owner !== user.id) return sendJson(res, 404, { error: 'This study pack request has expired. Please generate it again.' })

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
  const { owner: _owner, ...visible } = job
  sendJson(res, 200, job.status === 'cancelled' ? { status: 'cancelled' } : visible)
}

// What a student sees when a pack doesn't fit their plan. The client adds when
// it refills (resetsAt) and an upgrade button.
function limitMessage(reason, plan) {
  const pages = Math.round(plan.maxChars / 500)
  const free = plan.id === 'free'
  switch (reason) {
    case 'too-long':
      return {
        status: 413,
        error: free
          ? `These notes are too long for the Free plan (about ${pages} pages). Upgrade to Pro for longer lectures, or split the file.`
          : `These notes are too long for one study pack (about ${pages} pages). Try splitting the file.`,
      }
    case 'window':
      return { status: 429, error: `You’ve used this session’s ${plan.name} allowance.` }
    case 'period':
      return { status: 429, error: `You’ve used this month’s ${plan.name} allowance.` }
    default:
      return { status: 429, error: 'StarterPack has reached today’s limit for free study packs. Try again tomorrow, or upgrade to Pro.' }
  }
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
    return { status: 429, message: 'StarterPack is busy right now. Please try again in a minute.' }
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
