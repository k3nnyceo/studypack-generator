// /api/transcribe: reads scanned or photographed pages of notes (a Max
// feature), so they can go through the normal Notes → Generate flow.
//
//   POST { pages: [{ page, mediaType, data }] }   up to 5 JPEG/PNG/WEBP pages,
//        base64, as rendered or compressed in the browser
//   ->   { pages: [{ page, text }] }
//
// A fast, cheap model (Claude Haiku 4.5 by default, OCR_MODEL to change it)
// transcribes the pages, handwriting included. Its real cost is charged to
// the student's usage allowance like generation: reserved up front from the
// page count, settled to the token bill.
import { getSessionUser } from './auth.js'
import { getDefaults } from './billing.js'
import { sendJson } from './http.js'
import { nairaPerUsd, plansFromEnv } from './plans.js'
import { getClient, priceKey, PRICING, PROVIDER } from './studyGuide.js'
import { activeSubscription, getSubscription } from './subscriptions.js'

export const MAX_PAGES_PER_REQUEST = 5
const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024
const MEDIA_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const OCR_MODEL = () =>
  process.env.OCR_MODEL || (PROVIDER === 'bedrock' ? 'global.anthropic.claude-haiku-4-5-20251001-v1:0' : 'claude-haiku-4-5')
// Measured on Haiku 4.5: about $0.006 a page (~2K tokens in, ~700 out).
const ESTIMATE_USD_PER_PAGE = 0.006

const SYSTEM = `You transcribe scanned or photographed pages of a student's lecture notes, so they can be turned into a study guide.`

const INSTRUCTION = `Transcribe every page above, in order. Start each page with a line "=== Page N ===" using the page numbers given.

- Copy all text faithfully, including handwriting, headings, bullet points and numbered lists. Keep the original wording; don't summarise or correct it.
- Write tables as plain-text rows, one row per line, with cells separated by " | ".
- Write equations and formulas in plain text, e.g. σ = F / A, or E = σ / ε.
- For a diagram, graph or figure, write a short description in square brackets, e.g. [Diagram: simply supported beam with a point load at mid-span].
- Leave out page numbers, running headers and watermarks.
- If a page is blank or can't be read, write [Unreadable] for it.

Output only the transcription.`

export async function handleTranscribeRequest(req, res, body, deps = {}) {
  const { store = getDefaults().store, meter = getDefaults().meter, getUser = getSessionUser, env = process.env, read = readPages } = deps
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
  const user = await getUser(req)
  if (!user) return sendJson(res, 401, { error: 'Sign in to read scanned notes.' })
  if (!store || !meter) return sendJson(res, 503, { error: 'Reading scanned notes isn’t available right now.' })

  const pages = Array.isArray(body?.pages) ? body.pages : []
  if (pages.length === 0 || pages.length > MAX_PAGES_PER_REQUEST) {
    return sendJson(res, 400, { error: `Send between 1 and ${MAX_PAGES_PER_REQUEST} pages at a time.` })
  }
  for (const p of pages) {
    if (!Number.isInteger(p?.page) || p.page < 1 || !MEDIA_TYPES.includes(p.mediaType) || typeof p.data !== 'string') {
      return sendJson(res, 400, { error: 'One of the pages isn’t a JPEG, PNG or WEBP image.' })
    }
    if ((p.data.length * 3) / 4 > MAX_IMAGE_BYTES) return sendJson(res, 413, { error: `Page ${p.page} is too large.` })
  }

  let slot, plan
  try {
    const subscription = activeSubscription(await getSubscription(store, user.id))
    plan = plansFromEnv(env)[subscription?.plan ?? 'free']
    if (!plan.scans) {
      return sendJson(res, 403, { error: 'Reading scanned and photographed notes is part of the Max plan.', reason: 'plan' })
    }
    const expected = Math.ceil(pages.length * ESTIMATE_USD_PER_PAGE * nairaPerUsd(env))
    slot = await meter.reserveCost(user.id, subscription, expected)
  } catch (err) {
    console.error('[transcribe] Usage store failed:', err.message)
    return sendJson(res, 503, { error: 'Reading scanned notes isn’t available right now.' })
  }
  if (!slot.ok) {
    const error =
      slot.reason === 'period'
        ? `You’ve used this month’s ${plan.name} allowance.`
        : slot.reason === 'window'
          ? `You’ve used this session’s ${plan.name} allowance.`
          : 'This is more than your plan allows at once.'
    return sendJson(res, 429, { error, reason: slot.reason, resetsAt: slot.resetsAt ?? null, plan: plan.id })
  }

  try {
    const { pages: text, costUsd } = await read(pages)
    await slot.settle(costUsd).catch((e) => console.error('[transcribe] Could not record usage:', e.message))
    sendJson(res, 200, { pages: text })
  } catch (err) {
    await slot.release().catch(() => {})
    console.error('[transcribe] Failed:', err.message)
    sendJson(res, 502, { error: 'Couldn’t read these pages. Please try again.' })
  }
}

// Claude reads the pages. Resolves to { pages: [{ page, text }], costUsd }.
export async function readPages(pages) {
  const started = Date.now()
  const content = pages.flatMap((p) => [
    { type: 'text', text: `Page ${p.page}:` },
    { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } },
  ])
  const message = await getClient().messages.create({
    model: OCR_MODEL(),
    max_tokens: Math.min(16000, 2500 * pages.length),
    system: SYSTEM,
    messages: [{ role: 'user', content: [...content, { type: 'text', text: INSTRUCTION }] }],
  })
  const output = message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('')
  const price = PRICING[priceKey(message.model)] ?? PRICING['claude-haiku-4-5']
  const costUsd = ((message.usage.input_tokens ?? 0) * price.input + (message.usage.output_tokens ?? 0) * price.output) / 1e6
  console.log(
    `[transcribe] model=${message.model} pages=${pages.length} in=${message.usage.input_tokens} out=${message.usage.output_tokens}` +
      ` cost≈$${costUsd.toFixed(4)} time=${((Date.now() - started) / 1000).toFixed(1)}s`,
  )
  return { pages: splitPages(output, pages.map((p) => p.page)), costUsd }
}

// "=== Page 3 ===" markers back into pages. A page the model skipped comes
// back empty rather than shifting the others.
export function splitPages(output, numbers) {
  const found = new Map()
  const parts = output.split(/^=== Page (\d+) ===\s*$/m)
  for (let i = 1; i < parts.length; i += 2) found.set(Number(parts[i]), parts[i + 1].trim())
  // No markers at all (a single page answered plainly): it's all that page.
  if (found.size === 0 && numbers.length === 1) found.set(numbers[0], output.trim())
  return numbers.map((page) => ({ page, text: found.get(page) ?? '' }))
}
