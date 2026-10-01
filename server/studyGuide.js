import AnthropicBedrock from '@anthropic-ai/bedrock-sdk'
import Anthropic from '@anthropic-ai/sdk'
import { validateStudyGuide } from '../src/lib/studyGuideFormat.js'

// Claude is reached through Amazon Bedrock when BEDROCK_API_KEY is set, and
// through the Claude API (ANTHROPIC_API_KEY) otherwise. Keys are read only from
// the server's environment and never reach the browser.
export const PROVIDER = process.env.BEDROCK_API_KEY ? 'bedrock' : 'anthropic'
const BEDROCK_REGION = process.env.BEDROCK_REGION || 'us-east-1'

// Model and effort can be changed per deployment without a code change.
// The Bedrock default is the most capable Claude model this account can use
// (Opus 4.6 on Bedrock's InvokeModel endpoint; newer models aren't enabled).
const MODEL = process.env.STUDY_GUIDE_MODEL || (PROVIDER === 'bedrock' ? 'global.anthropic.claude-opus-4-6-v1' : 'claude-opus-5')
const EFFORT = process.env.STUDY_GUIDE_EFFORT || 'high'
// The planning call only writes a short outline, so it doesn't need deep thinking.
const PLAN_EFFORT = process.env.STUDY_GUIDE_PLAN_EFFORT || 'low'

// USD per million tokens at Anthropic's list prices, for the cost line in the
// server log. Bedrock bills through AWS; its global endpoints match these rates.
const PRICING = {
  'claude-opus-5': { input: 5, output: 25 },
  'claude-opus-4-8': { input: 5, output: 25 },
  'claude-opus-4-6': { input: 5, output: 25 },
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-sonnet-4-6': { input: 3, output: 15 },
  'claude-haiku-4-5': { input: 1, output: 5 },
}
// "global.anthropic.claude-opus-4-6-v1" / "claude-haiku-4-5-20251001" -> "claude-opus-4-6" / "claude-haiku-4-5"
const priceKey = (model = '') =>
  model.replace(/^(global|us|eu|apac|jp)\./, '').replace(/^anthropic\./, '').replace(/(-v\d+(:\d+)?|-\d{8}(-v\d+:\d+)?)$/, '')

// Longer input is rejected rather than silently truncated, so a student never
// gets a guide that quietly skips half their lectures. The default (~37K
// tokens) keeps the free tier's cost per guide bounded.
export const MAX_INPUT_CHARS = Number(process.env.MAX_INPUT_CHARS) || 150_000

// Generation runs in two stages so long lectures finish well inside a serverless
// time limit: one call plans the guide (title, course, topic, overview, and the
// module outline), then one call per module writes that module, all in
// parallel. Every call starts with the same system prompt and notes, marked for
// prompt caching: the planning call writes the cache and the module calls,
// started after it, read it, so the notes are only paid for once at full price.
//
// Structured outputs constrain each response to its schema. Every object needs
// `additionalProperties: false` and an exhaustive `required` list.
const MODULE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'sourceRange', 'summary', 'keyPoints', 'definitions', 'workedExamples', 'quiz'],
  properties: {
    title: { type: 'string' },
    sourceRange: { type: 'string', description: 'Which pages or slides this module draws from, e.g. "Slides 4-11".' },
    summary: { type: 'string', description: 'A clear explanatory summary of the module, 1-3 paragraphs.' },
    keyPoints: { type: 'array', items: { type: 'string' } },
    definitions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['term', 'definition'],
        properties: { term: { type: 'string' }, definition: { type: 'string' } },
      },
    },
    workedExamples: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'problem', 'steps', 'answer'],
        properties: {
          title: { type: 'string' },
          problem: { type: 'string' },
          steps: { type: 'array', items: { type: 'string' } },
          answer: { type: 'string' },
        },
      },
    },
    quiz: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['question', 'options', 'correctIndex', 'explanation'],
        properties: {
          question: { type: 'string' },
          options: { type: 'array', items: { type: 'string' } },
          correctIndex: { type: 'integer', description: 'Position of the correct option, counting from 0.' },
          explanation: { type: 'string' },
        },
      },
    },
  },
}

const PLAN_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'course', 'topic', 'overview', 'modules'],
  properties: {
    title: { type: 'string', description: 'A concise title for the study guide.' },
    course: { type: 'string', description: 'The course this lecture belongs to, e.g. "MECH 2201 Strength of Materials".' },
    topic: { type: 'string', description: "A short name for this lecture's topic." },
    overview: { type: 'string', description: '2-4 sentences on what the material covers and how the modules fit together.' },
    modules: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'sourceRange', 'focus'],
        properties: {
          title: { type: 'string' },
          sourceRange: { type: 'string', description: 'Which pages or slides the module draws from.' },
          focus: {
            type: 'string',
            description: 'Exactly which concepts, terms, formulas and examples from the notes belong in this module.',
          },
        },
      },
    },
  },
}

const MAX_MODULES = 10

// Identical for every call so the cached prefix is shared; the stage-specific
// instruction comes after the notes.
const SYSTEM_PROMPT = `You turn a student's lecture notes into a study guide they can revise from.

The notes were extracted automatically from a PDF or PowerPoint, so expect broken line wraps, stray headers and footers, and slide fragments. Reconstruct the intended meaning; ignore boilerplate such as page numbers and course codes.

The guide is organised into modules that follow the lecture's own topic boundaries. Each module has:
- summary: the ideas explained the way a good tutor would, not a list of slide titles.
- keyPoints: the facts or ideas a student most needs to remember.
- definitions: every important term the module introduces, defined precisely in plain language.
- workedExamples: 3 examples (up to 5 for a long, dense module) that apply the module's ideas, each with the problem, numbered reasoning steps, and the final answer. For quantitative topics use real calculations; for conceptual topics use scenarios, case analyses or "explain why" questions worked through step by step.
- quiz: 3-4 multiple-choice questions with 4 plausible options each, testing understanding rather than wording. correctIndex counts from 0. Give a one-sentence explanation of the right answer.

Stay faithful to the notes. You may add standard background knowledge to make an explanation or example clearer, but don't contradict the source or invent course-specific facts such as dates, names or exam details.`

const PLAN_INSTRUCTION = `Stage 1 of 2: plan the study guide. Give its title, course, topic and overview, and divide the notes into modules that follow the lecture's own topic boundaries: usually 3-8, fewer for short notes, never more than ${MAX_MODULES}. Every substantive part of the notes must belong to exactly one module. For each module give its title, sourceRange, and focus: 2-4 sentences naming exactly which concepts, terms, formulas and examples from the notes it covers. Each module will be written by a separate writer who sees only this outline, so the focus must make the boundaries between modules unambiguous.`

function moduleInstruction(plan, index) {
  const outline = plan.modules.map((m, i) => `${i + 1}. ${m.title} (${m.sourceRange})`).join('\n')
  const m = plan.modules[index]
  return `Stage 2 of 2: write module ${index + 1} of ${plan.modules.length} in full.

Guide: ${plan.title}
Outline:
${outline}

Module to write: ${m.title}
Source: ${m.sourceRange}
Focus: ${m.focus}

Write only this module. The other modules are written separately, so don't cover their material. Use exactly this title and sourceRange.`
}

export class StudyGuideError extends Error {
  constructor(message, status = 500) {
    super(message)
    this.status = status
  }
}

let client
function getClient() {
  client ??=
    PROVIDER === 'bedrock'
      ? new AnthropicBedrock({ apiKey: process.env.BEDROCK_API_KEY, awsRegion: BEDROCK_REGION })
      : new Anthropic()
  return client
}

// `signal` cancels the request, e.g. when the visitor closes the page.
export async function generateStudyGuide({ text, fileName, signal }) {
  const started = Date.now()
  // One controller for every call: the visitor leaving, or any one call
  // failing, stops the rest so we aren't billed for work that will be discarded.
  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  const messages = []
  const notesText = `<lecture_notes filename="${escapeAttr(fileName)}">\n${text}\n</lecture_notes>`
  const ask = async ({ instruction, schema, maxTokens, effort, cache = false, onStart }) => {
    const notes = { type: 'text', text: notesText, ...(cache && { cache_control: { type: 'ephemeral' } }) }
    const { data, message } = await callClaude({ notes, instruction, schema, maxTokens, effort, onStart, signal: controller.signal })
    messages.push(message)
    return data
  }

  try {
    // The plan is a short outline, so it runs at low effort. It isn't cached:
    // its schema differs from the module calls', so they couldn't reuse it.
    const plan = await ask({ instruction: PLAN_INSTRUCTION, schema: PLAN_SCHEMA, maxTokens: 8000, effort: PLAN_EFFORT })
    if (!Array.isArray(plan.modules) || plan.modules.length === 0) {
      throw new StudyGuideError('Claude couldn’t find any topics in these notes.', 422)
    }
    plan.modules = plan.modules.slice(0, MAX_MODULES)
    const planMs = Date.now() - started

    // A cache entry is readable only once its writer's response starts, so
    // module 1 goes first and writes it; the others start the moment module 1
    // begins replying, and read the notes from the cache.
    let firstStarted
    const cacheReady = new Promise((resolve) => (firstStarted = resolve))
    const writeModule = (i, onStart) =>
      ask({ instruction: moduleInstruction(plan, i), schema: MODULE_SCHEMA, maxTokens: 16000, effort: EFFORT, cache: true, onStart }).then(
        (m) => ({ ...m, title: plan.modules[i].title, sourceRange: plan.modules[i].sourceRange }),
      )
    const modules = await Promise.all(
      plan.modules.map((_, i) =>
        i === 0
          ? writeModule(0, firstStarted)
          : cacheReady.then(() => {
              if (controller.signal.aborted) throw new StudyGuideError('Generation was cancelled.', 499)
              return writeModule(i)
            }),
      ),
    ).catch((err) => {
      controller.abort()
      throw err
    })

    logUsage(messages, text.length, Date.now() - started, planMs)
    const { title, course, topic, overview } = plan
    // The schemas guarantee each part's shape; this also checks what JSON Schema
    // can't express here, such as correctIndex being within the options.
    const result = validateStudyGuide({ title, course, topic, overview, modules })
    if (!result.ok) {
      console.error('Claude returned an invalid study guide:', result.errors)
      throw new StudyGuideError('Claude returned an incomplete study guide. Please try again.', 502)
    }
    return result.guide
  } catch (err) {
    if (messages.length) logUsage(messages, text.length, Date.now() - started, null, 'failed')
    throw err
  } finally {
    signal?.removeEventListener('abort', onAbort)
  }
}

async function callClaude({ notes, instruction, schema, maxTokens, effort, onStart, signal }) {
  // Server-side refusal fallbacks exist only on the Claude API (Opus/Fable tier):
  // if a safety classifier declines, it retries on the recommended model. Bedrock
  // doesn't offer them, so a refusal there is reported to the student instead.
  const fallback =
    PROVIDER === 'anthropic' && /^claude-(opus|fable)/.test(MODEL)
      ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }
      : null
  const messagesApi = fallback ? getClient().beta.messages : getClient().messages
  const stream = messagesApi.stream(
    {
      model: MODEL,
      max_tokens: maxTokens,
      // Calls that share a cache must use the same thinking and effort settings.
      thinking: { type: 'adaptive' },
      output_config: { effort, format: { type: 'json_schema', schema } },
      ...fallback,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: [notes, { type: 'text', text: instruction }] }],
    },
    { signal },
  )
  if (onStart) stream.once('streamEvent', onStart)
  const message = await stream.finalMessage()

  if (message.stop_reason === 'refusal') {
    throw new StudyGuideError('Claude declined to generate a study guide for this document.', 422)
  }
  if (message.stop_reason === 'max_tokens') {
    throw new StudyGuideError('The study guide was too long to finish. Try splitting the notes into smaller files.', 422)
  }

  // After a mid-stream fallback, content before the last `fallback` block came
  // from the model that declined and is discarded.
  const lastFallback = message.content.findLastIndex((block) => block.type === 'fallback')
  const json = message.content
    .slice(lastFallback + 1)
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('')
  try {
    return { data: JSON.parse(json), message }
  } catch {
    throw new StudyGuideError('Claude returned a response that could not be read. Please try again.', 502)
  }
}

// One line per generation with tokens and estimated cost across all calls,
// which is how the real cost per study guide is measured (Vercel → Logs, or
// the local console). Cache writes cost 1.25x input, cache reads 0.1x.
function logUsage(messages, inputChars, ms, planMs, outcome = 'ok') {
  const sum = (k) => messages.reduce((n, m) => n + (m.usage?.[k] ?? 0), 0)
  const input = sum('input_tokens')
  const cacheWrite = sum('cache_creation_input_tokens')
  const cacheRead = sum('cache_read_input_tokens')
  const output = sum('output_tokens')
  const price = PRICING[priceKey(messages[0].model)] ?? PRICING[priceKey(MODEL)]
  const cost = price
    ? ((input + cacheWrite * 1.25 + cacheRead * 0.1) * price.input + output * price.output) / 1e6
    : null
  const fellBack = messages.some((m) => (m.usage?.iterations ?? []).some((i) => i.type === 'fallback_message'))
  console.log(
    `[study-guide] ${outcome} via=${PROVIDER} model=${messages[0].model} effort=${EFFORT} calls=${messages.length} chars=${inputChars}` +
      ` in=${input} cache_write=${cacheWrite} cache_read=${cacheRead} out=${output}` +
      ` cost≈${cost === null ? 'unknown' : `$${cost.toFixed(3)}`} time=${(ms / 1000).toFixed(1)}s` +
      `${planMs ? ` (plan ${(planMs / 1000).toFixed(1)}s)` : ''}${fellBack ? ' (fallback ran)' : ''}`,
  )
}

function escapeAttr(value) {
  return String(value ?? '').replace(/[<>&"]/g, '')
}
