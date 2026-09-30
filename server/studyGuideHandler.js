// POST /api/study-guide, shared by the Vercel function (api/study-guide.js)
// and the local dev server (server/index.js).
//
// Flow: validate -> reserve a free-tier slot -> stream the response while
// Claude works. Headers go out immediately with 200 and a space is written
// every few seconds, so proxies and slow mobile networks don't drop the idle
// connection; the finished JSON follows. (Leading whitespace is valid JSON.)
// Errors after that point are sent in the body as { error }.
import Anthropic from '@anthropic-ai/sdk'
import { generateStudyGuide, MAX_INPUT_CHARS, StudyGuideError } from './studyGuide.js'
import { clientIp, createLimiter, limitsFromEnv, storeFromEnv } from './usageLimits.js'

const HEARTBEAT_MS = 8000

let defaultLimiter
function getDefaultLimiter() {
  if (defaultLimiter === undefined) {
    const store = storeFromEnv()
    defaultLimiter = store ? createLimiter(store, limitsFromEnv()) : null
  }
  return defaultLimiter
}

export const aiGenerationEnabled = (env = process.env) => env.VITE_ENABLE_AI_GENERATION === 'true'

export async function handleStudyGuideRequest(req, res, body, { limiter = getDefaultLimiter(), generate = generateStudyGuide, enabled = aiGenerationEnabled() } = {}) {
  if (!enabled) {
    return sendJson(res, 503, { error: 'AI generation is turned off on this server.' })
  }
  if (!limiter) {
    console.error('[study-guide] No usage-limit store configured (UPSTASH_REDIS_REST_URL / _TOKEN); refusing to generate.')
    return sendJson(res, 503, { error: 'Study guide generation isn’t available right now. Please try again later.' })
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
    return sendJson(res, 503, { error: 'Study guide generation isn’t available right now. Please try again later.' })
  }
  if (!slot.ok) return sendJson(res, 429, { error: slot.message })

  res.writeHead(200, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Guides-Remaining': String(slot.remaining),
  })
  res.flushHeaders?.()
  const heartbeat = setInterval(() => res.write(' '), HEARTBEAT_MS)

  // If the visitor leaves, stop generating so we aren't billed for tokens nobody will see.
  const abort = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) abort.abort()
  })

  try {
    const guide = await generate({ text, fileName, signal: abort.signal })
    res.end(JSON.stringify(guide))
  } catch (err) {
    await slot.release().catch((e) => console.error('[study-guide] Could not release usage slot:', e.message))
    if (abort.signal.aborted) {
      console.log('[study-guide] Visitor left; generation cancelled.')
      return res.end()
    }
    const { status, message } = toClientError(err)
    console.error(`[study-guide] Generation failed (${status}):`, err.message)
    res.end(JSON.stringify({ error: message, status }))
  } finally {
    clearInterval(heartbeat)
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
