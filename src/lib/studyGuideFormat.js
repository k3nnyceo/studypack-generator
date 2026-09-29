// The study guide JSON format: an example, a validator, and a prompt for
// generating it with an external AI tool. Plain JS with no browser APIs, so the
// server can reuse the validator on Claude's output.

export const EXAMPLE_GUIDE = {
  title: 'Introduction to Cell Biology',
  overview: '2-4 sentences on what the material covers and how the modules fit together.',
  modules: [
    {
      title: 'Mitochondria & Cellular Respiration',
      sourceRange: 'Slides 7-12',
      summary: 'One or more paragraphs. Separate paragraphs with a blank line.\n\nLike this.',
      keyPoints: ["ATP is the cell's energy currency", 'Respiration needs oxygen and produces CO2 and water'],
      definitions: [
        {
          term: 'ATP',
          definition: 'Adenosine triphosphate: the molecule cells use to store and transfer energy.',
        },
      ],
      workedExamples: [
        {
          title: 'ATP yield',
          problem: 'If one glucose molecule yields about 30 ATP, how many do 4 yield?',
          steps: ['Each glucose gives ~30 ATP.', 'Multiply: 30 x 4.'],
          answer: 'About 120 ATP.',
        },
      ],
      quiz: [
        {
          question: 'Where does most ATP production happen?',
          options: ['Nucleus', 'Mitochondria', 'Ribosome', 'Golgi apparatus'],
          correctIndex: 1,
          explanation: 'The electron transport chain in the mitochondria produces most ATP.',
        },
      ],
    },
  ],
}

export const EXAMPLE_GUIDE_JSON = JSON.stringify(EXAMPLE_GUIDE, null, 2)

const MAX_ERRORS = 15

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isText = (v) => typeof v === 'string' && v.trim() !== ''

// Parses pasted text and validates it. Tolerates a surrounding ```json fence,
// since that's how most AI chat tools present JSON.
export function parseStudyGuide(text) {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\n?```\s*$/, '')
    .trim()
  if (!cleaned) return { ok: false, errors: ['Paste your study guide JSON first.'] }

  let data
  try {
    data = JSON.parse(cleaned)
  } catch (err) {
    return { ok: false, errors: [`This isn’t valid JSON: ${err.message}`] }
  }
  return validateStudyGuide(data)
}

// Checks the shape and returns a normalised copy containing only known fields.
// Returns { ok: true, guide } or { ok: false, errors: [...] } where each error
// names the exact path, e.g. "modules[2].definitions[0].term is missing".
export function validateStudyGuide(data) {
  const errors = []
  const fail = (path, problem) => errors.push(`${path} ${problem}`)
  const join = (path, key) => (path ? `${path}.${key}` : key)

  function text(obj, key, path, { optional = false } = {}) {
    const value = obj[key]
    if (value === undefined || value === null) {
      if (!optional) fail(join(path, key), 'is missing')
      return ''
    }
    if (typeof value !== 'string') {
      fail(join(path, key), `must be a string (got ${describe(value)})`)
      return ''
    }
    if (!optional && !value.trim()) fail(join(path, key), 'must not be empty')
    return value
  }

  function list(obj, key, path, readItem, { optional = false } = {}) {
    const value = obj[key]
    if (value === undefined || value === null) {
      if (!optional) fail(join(path, key), 'is missing (use [] if there are none)')
      return []
    }
    if (!Array.isArray(value)) {
      fail(join(path, key), `must be an array (got ${describe(value)})`)
      return []
    }
    return value.map((item, i) => readItem(item, `${join(path, key)}[${i}]`))
  }

  function object(value, path, read) {
    if (!isObject(value)) {
      fail(path, `must be an object (got ${describe(value)})`)
      return null
    }
    return read(value)
  }

  const guide = object(data, 'The pasted JSON', (g) => ({
    title: text(g, 'title', ''),
    overview: text(g, 'overview', ''),
    modules: list(g, 'modules', '', (m, path) =>
      object(m, path, (mod) => ({
        title: text(mod, 'title', path),
        sourceRange: text(mod, 'sourceRange', path, { optional: true }),
        summary: text(mod, 'summary', path),
        keyPoints: list(mod, 'keyPoints', path, (point, p) => {
          if (!isText(point)) fail(p, `must be a non-empty string (got ${describe(point)})`)
          return String(point ?? '')
        }),
        definitions: list(mod, 'definitions', path, (d, p) =>
          object(d, p, (def) => ({
            term: text(def, 'term', p),
            definition: text(def, 'definition', p),
          })),
        ),
        workedExamples: list(mod, 'workedExamples', path, (e, p) =>
          object(e, p, (ex) => ({
            title: text(ex, 'title', p),
            problem: text(ex, 'problem', p),
            steps: list(ex, 'steps', p, (step, sp) => {
              if (!isText(step)) fail(sp, `must be a non-empty string (got ${describe(step)})`)
              return String(step ?? '')
            }),
            answer: text(ex, 'answer', p),
          })),
        ),
        quiz: list(mod, 'quiz', path, (q, p) => object(q, p, (question) => readQuizQuestion(question, p)), {
          optional: true,
        }),
      })),
    ),
  }))

  function readQuizQuestion(q, path) {
    const options = list(q, 'options', path, (option, p) => {
      if (!isText(option)) fail(p, `must be a non-empty string (got ${describe(option)})`)
      return String(option ?? '')
    })
    if (Array.isArray(q.options) && q.options.length < 2) fail(`${path}.options`, 'needs at least 2 choices')

    const { correctIndex } = q
    if (correctIndex === undefined || correctIndex === null) {
      fail(`${path}.correctIndex`, 'is missing')
    } else if (!Number.isInteger(correctIndex)) {
      fail(`${path}.correctIndex`, `must be a whole number (got ${describe(correctIndex)})`)
    } else if (options.length >= 2 && (correctIndex < 0 || correctIndex >= options.length)) {
      fail(
        `${path}.correctIndex`,
        `is ${correctIndex}, but must be between 0 and ${options.length - 1} (it counts from 0)`,
      )
    }

    return {
      question: text(q, 'question', path),
      options,
      correctIndex,
      explanation: text(q, 'explanation', path, { optional: true }),
    }
  }

  if (guide && Array.isArray(data.modules) && data.modules.length === 0) {
    fail('modules', 'must contain at least one module')
  }

  if (errors.length > 0) {
    const shown = errors.slice(0, MAX_ERRORS)
    if (errors.length > MAX_ERRORS) shown.push(`…and ${errors.length - MAX_ERRORS} more problems`)
    return { ok: false, errors: shown }
  }
  return { ok: true, guide }
}

function describe(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  if (typeof value === 'string') return value.trim() ? 'a string' : 'an empty string'
  return typeof value === 'object' ? 'an object' : `${typeof value} ${JSON.stringify(value)}`
}

// A ready-to-paste prompt for generating the guide with any AI chat tool.
export function buildGenerationPrompt({ fileName, fullText }) {
  return `Create a study guide from the lecture notes below.

Respond with ONLY a JSON object (no commentary, no markdown) that matches this structure exactly:

${EXAMPLE_GUIDE_JSON}

Rules:
- Organise the material into modules that follow the lecture's own topic boundaries (usually 3-8 modules).
- summary: explain the ideas the way a good tutor would, 1-3 paragraphs separated by a blank line.
- keyPoints: the facts or ideas a student most needs to remember.
- definitions: every important term the module introduces, defined precisely in plain language.
- workedExamples: 3-5 per module, each with the problem, step-by-step reasoning in "steps", and the final answer. Use real calculations for quantitative topics; scenarios or "explain why" questions for conceptual ones.
- quiz: 3-5 multiple-choice questions per module with 4 options each. correctIndex is the position of the right option, counting from 0. Make wrong options plausible misconceptions, not obvious throwaways. Give a one-sentence explanation.
- sourceRange: which pages or slides the module draws from.
- The notes were extracted automatically from a PDF or slides, so ignore page numbers, headers and other boilerplate.
- Stay faithful to the notes. Don't invent course-specific facts such as dates, names or exam details.

<lecture_notes filename="${fileName}">
${fullText}
</lecture_notes>`
}
