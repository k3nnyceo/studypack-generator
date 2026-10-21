// /api/ask: "Ask about this pack". A student asks a question about a lecture
// and Claude answers from that lecture's notes (sent by the device with their
// [[Page N]] markers, see src/lib/askContext.js), citing the pages, so the
// app can open them in the source viewer. Packs without notes on the device
// send the study pack itself instead.
//
//   POST { question, history?, context, kind: 'notes' | 'pack', title? }
//     -> a stream of JSON lines: { text } pieces of the answer as they're
//        written, then { done: true }, or { error } if it fails partway.
//     Refused before streaming with a JSON error (401, 400, 429 for a plan limit).
//
// Each answer is charged to the same allowance as study packs: an estimate is
// reserved first, then the real cost replaces it (nothing if it fails). Free
// plans are answered by the fast model, like their packs.
import { getSessionUser } from './auth.js'
import { getDefaults } from './billing.js'
import { sendJson } from './http.js'
import { nairaPerUsd, plansFromEnv } from './plans.js'
import { FAST_MODEL, getClient, MODEL, priceKey, PRICING, PROVIDER } from './studyGuide.js'
import { activeSubscription, getSubscription } from './subscriptions.js'

export const MAX_QUESTION_CHARS = 1000
export const MAX_CONTEXT_CHARS = 60_000
const MAX_HISTORY_MESSAGES = 12
const MAX_HISTORY_CHARS = 3000
const MAX_ANSWER_TOKENS = 1500
// For the estimate: a typical answer's length in tokens.
const EXPECTED_ANSWER_TOKENS = 600

const SYSTEM = `You are StudyPack's tutor. A student is revising one lecture and asks you about it. The lecture notes (or, when those aren't on their device, the study pack made from them) come first in the conversation.

How to answer:
- Answer from the notes. Explain the way a patient tutor at a Nigerian university would: plain words, short paragraphs, "- " bullets for lists, numbered steps for calculations. Keep it under about 150 words unless the student asks for more.
- After each point that comes from the notes, cite where it is with its marker exactly as it appears in the notes, e.g. [[Page 4]] or [[Slide 12]]. Only cite markers that exist in the notes. If the notes have no markers (a study pack), name the module instead, in plain words.
- If the notes don't cover the question, say so in one short sentence, then give a brief general answer that starts with "Beyond your notes:".
- Write formulas and equations in LaTeX between dollar signs, e.g. $\\sigma = F/A$.
- When asked to quiz the student, ask one question at a time and wait for their answer.
- Don't invent course-specific facts such as lecturer names, exam dates or marks.`

export async function handleAskRequest(req, res, body, deps = {}) {
  const { store = getDefaults().store, meter = getDefaults().meter, getUser = getSessionUser, env = process.env, answer = streamAnswer } = deps
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
  const user = await getUser(req)
  if (!user) return sendJson(res, 401, { error: 'Sign in to ask questions about your pack.' })
  if (!store || !meter) return sendJson(res, 503, { error: 'Asking questions isn’t available right now.' })

  const input = readInput(body)
  if (input.error) return sendJson(res, 400, { error: input.error })

  let slot, plan
  try {
    const subscription = activeSubscription(await getSubscription(store, user.id))
    plan = plansFromEnv(env)[subscription?.plan ?? 'free']
    const chars = input.context.length + input.question.length + input.history.reduce((n, m) => n + m.text.length, 0)
    const expected = Math.max(1, Math.ceil(estimateUsd(chars, plan.fastModel) * nairaPerUsd(env)))
    slot = await meter.reserveCost(user.id, subscription, expected)
  } catch (err) {
    console.error('[ask] Usage store failed:', err.message)
    return sendJson(res, 503, { error: 'Asking questions isn’t available right now.' })
  }
  if (!slot.ok) {
    const error =
      slot.reason === 'period'
        ? `You’ve used this month’s ${plan.name} allowance.`
        : slot.reason === 'window'
          ? `You’ve used this session’s ${plan.name} allowance.`
          : 'This question is more than your plan allows at once.'
    return sendJson(res, 429, { error, reason: slot.reason, resetsAt: slot.resetsAt ?? null, plan: plan.id })
  }

  res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' })
  const send = (line) => res.write(`${JSON.stringify(line)}\n`)
  // The student closed the chat or the page: stop writing (and paying).
  const abort = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) abort.abort()
  })
  try {
    const { costUsd } = await answer({ ...input, fast: plan.fastModel, signal: abort.signal, onText: (text) => send({ text }) })
    await slot.settle(costUsd).catch((e) => console.error('[ask] Could not record usage:', e.message))
    send({ done: true })
  } catch (err) {
    await slot.release().catch(() => {})
    if (!abort.signal.aborted) {
      console.error('[ask] Failed:', err.message)
      send({ error: 'Couldn’t answer that just now. Please try again.' })
    }
  } finally {
    res.end()
  }
}

// The request, checked: { question, history: [{ role, text }], context, kind, title } or { error }.
export function readInput(body) {
  const question = typeof body?.question === 'string' ? body.question.trim() : ''
  if (!question) return { error: 'Type a question first.' }
  if (question.length > MAX_QUESTION_CHARS) return { error: `Questions can be up to ${MAX_QUESTION_CHARS} characters.` }
  const context = typeof body?.context === 'string' ? body.context.trim() : ''
  if (!context) return { error: 'There’s no lecture to ask about.' }
  if (context.length > MAX_CONTEXT_CHARS) return { error: 'This lecture is too long to ask about in one go.' }
  const kind = body?.kind === 'pack' ? 'pack' : 'notes'
  const title = typeof body?.title === 'string' ? body.title.slice(0, 200) : ''
  const raw = Array.isArray(body?.history) ? body.history.slice(-MAX_HISTORY_MESSAGES) : []
  const history = []
  for (const m of raw) {
    if ((m?.role !== 'user' && m?.role !== 'assistant') || typeof m.text !== 'string' || !m.text.trim()) continue
    history.push({ role: m.role, text: m.text.trim().slice(0, MAX_HISTORY_CHARS) })
  }
  // The conversation has to start with the student and alternate.
  while (history.length && history[0].role !== 'user') history.shift()
  const turns = history.filter((m, i) => i === 0 || m.role !== history[i - 1].role)
  if (turns.at(-1)?.role === 'user') turns.pop()
  return { question, history: turns, context, kind, title }
}

const modelFor = (fast) => (fast ? FAST_MODEL : MODEL)

// Expected cost: the notes written to the prompt cache (1.25x) plus a typical answer.
function estimateUsd(chars, fast) {
  const price = PRICING[priceKey(modelFor(fast))] ?? PRICING['claude-sonnet-4-6']
  return ((chars / 4) * 1.25 * price.input + EXPECTED_ANSWER_TOKENS * price.output) / 1e6
}

// Streams Claude's answer through onText. Resolves to { text, costUsd }.
// The notes are the start of the first message and are cached, so follow-up
// questions in the same chat read them at a tenth of the price.
export async function streamAnswer({ question, history, context, kind, title, fast, onText, signal, client = getClient() }) {
  const started = Date.now()
  const model = modelFor(fast)
  const label = kind === 'pack' ? 'study_pack' : 'lecture_notes'
  const notes = {
    type: 'text',
    text: `<${label} title="${title.replace(/[<>&"]/g, '')}">\n${context}\n</${label}>`,
    cache_control: { type: 'ephemeral' },
  }
  const turns = [...history, { role: 'user', text: question }]
  const messages = turns.map((m, i) => ({
    role: m.role,
    content: i === 0 ? [notes, { type: 'text', text: m.text }] : m.text,
  }))
  const stream = client.messages.stream({ model, max_tokens: MAX_ANSWER_TOKENS, system: SYSTEM, messages }, { signal })
  let text = ''
  stream.on('text', (piece) => {
    text += piece
    onText(piece)
  })
  const message = await stream.finalMessage()
  const u = message.usage ?? {}
  const price = PRICING[priceKey(message.model)] ?? PRICING[priceKey(model)]
  const costUsd = price
    ? (((u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) * 1.25 + (u.cache_read_input_tokens ?? 0) * 0.1) * price.input +
        (u.output_tokens ?? 0) * price.output) /
      1e6
    : null
  console.log(
    `[ask] via=${PROVIDER} model=${model} kind=${kind} turns=${turns.length} chars=${context.length} in=${u.input_tokens} cache_write=${u.cache_creation_input_tokens ?? 0}` +
      ` cache_read=${u.cache_read_input_tokens ?? 0} out=${u.output_tokens} cost≈${costUsd === null ? 'unknown' : `$${costUsd.toFixed(4)}`} time=${((Date.now() - started) / 1000).toFixed(1)}s`,
  )
  return { text, costUsd }
}
