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

// Structured outputs guarantee the response matches this schema. Every object
// needs `additionalProperties: false` and an exhaustive `required` list.
const STUDY_GUIDE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'course', 'topic', 'overview', 'modules'],
  properties: {
    title: { type: 'string', description: 'A concise title for the study guide.' },
    course: { type: 'string', description: 'The course this lecture belongs to, e.g. "MECH 2201 Strength of Materials".' },
    topic: { type: 'string', description: "A short name for this lecture's topic." },
    overview: {
      type: 'string',
      description: '2-4 sentences on what the material covers and how the modules fit together.',
    },
    modules: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'sourceRange', 'summary', 'keyPoints', 'definitions', 'workedExamples', 'quiz'],
        properties: {
          title: { type: 'string' },
          sourceRange: {
            type: 'string',
            description: 'Which pages or slides this module draws from, e.g. "Slides 4-11".',
          },
          summary: { type: 'string', description: 'A clear explanatory summary of the module, 1-3 paragraphs.' },
          keyPoints: { type: 'array', items: { type: 'string' } },
          definitions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['term', 'definition'],
              properties: {
                term: { type: 'string' },
                definition: { type: 'string' },
              },
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
      },
    },
  },
}

const SYSTEM_PROMPT = `You turn a student's lecture notes into a study guide they can revise from.

The notes were extracted automatically from a PDF or PowerPoint, so expect broken line wraps, stray headers and footers, and slide fragments. Reconstruct the intended meaning; ignore boilerplate such as page numbers and course codes.

Organise the material into modules that follow the lecture's own topic boundaries, usually 3-8 modules. For each module:
- summary: explain the ideas the way a good tutor would, not a list of slide titles.
- keyPoints: the facts or ideas a student most needs to remember.
- definitions: every important term the module introduces, defined precisely in plain language.
- workedExamples: 3-5 examples that apply the module's ideas, each with the problem, numbered reasoning steps, and the final answer. For quantitative topics use real calculations; for conceptual topics use scenarios, case analyses or "explain why" questions worked through step by step.
- quiz: 3-5 multiple-choice questions with 4 plausible options each, testing understanding rather than wording. correctIndex counts from 0. Give a one-sentence explanation of the right answer.

Stay faithful to the notes. You may add standard background knowledge to make an explanation or example clearer, but don't contradict the source or invent course-specific facts such as dates, names or exam details.`

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
      max_tokens: 64000,
      thinking: { type: 'adaptive' },
      output_config: {
        effort: EFFORT,
        format: { type: 'json_schema', schema: STUDY_GUIDE_SCHEMA },
      },
      ...fallback,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `<lecture_notes filename="${escapeAttr(fileName)}">\n${text}\n</lecture_notes>\n\nCreate the study guide for these notes.`,
        },
      ],
    },
    { signal },
  )

  const message = await stream.finalMessage()
  logUsage(message, text.length, Date.now() - started)

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

  let data
  try {
    data = JSON.parse(json)
  } catch {
    throw new StudyGuideError('Claude returned a response that could not be read. Please try again.', 502)
  }
  // The schema guarantees the shape; this also checks what JSON Schema can't
  // express here, such as correctIndex being within the options.
  const result = validateStudyGuide(data)
  if (!result.ok) {
    console.error('Claude returned an invalid study guide:', result.errors)
    throw new StudyGuideError('Claude returned an incomplete study guide. Please try again.', 502)
  }
  return result.guide
}

// One line per generation with tokens and estimated cost, which is how the
// real cost per study guide is measured (Vercel → Logs, or the local console).
function logUsage(message, inputChars, ms) {
  const u = message.usage ?? {}
  const price = PRICING[priceKey(message.model)] ?? PRICING[priceKey(MODEL)]
  const inputTokens = (u.input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0)
  const cost = price ? (inputTokens * price.input + (u.output_tokens ?? 0) * price.output) / 1e6 : null
  const fellBack = (u.iterations ?? []).some((i) => i.type === 'fallback_message')
  console.log(
    `[study-guide] via=${PROVIDER} model=${message.model} effort=${EFFORT} chars=${inputChars} in=${inputTokens} out=${u.output_tokens ?? 0}` +
      ` cost≈${cost === null ? 'unknown' : `$${cost.toFixed(3)}`} time=${(ms / 1000).toFixed(1)}s` +
      ` stop=${message.stop_reason}${fellBack ? ' (fallback ran)' : ''}`,
  )
}

function escapeAttr(value) {
  return String(value ?? '').replace(/[<>&"]/g, '')
}
