import Anthropic from '@anthropic-ai/sdk'
import { validateStudyGuide } from '../src/lib/studyGuideFormat.js'

const MODEL = 'claude-opus-5'

// Roughly 200K tokens. Longer input is rejected rather than silently truncated,
// so a student never gets a guide that quietly skips half their lectures.
export const MAX_INPUT_CHARS = 800_000

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

// The client reads ANTHROPIC_API_KEY from the environment; the key never
// appears in source and never reaches the browser.
let client
function getClient() {
  client ??= new Anthropic()
  return client
}

export async function generateStudyGuide({ text, fileName }) {
  const stream = getClient().beta.messages.stream({
    model: MODEL,
    max_tokens: 64000,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'high',
      format: { type: 'json_schema', schema: STUDY_GUIDE_SCHEMA },
    },
    // If a safety classifier declines the request, retry server-side on the
    // model Anthropic recommends for that refusal category.
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: `<lecture_notes filename="${escapeAttr(fileName)}">\n${text}\n</lecture_notes>\n\nCreate the study guide for these notes.`,
      },
    ],
  })

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

function escapeAttr(value) {
  return String(value ?? '').replace(/[<>&"]/g, '')
}
