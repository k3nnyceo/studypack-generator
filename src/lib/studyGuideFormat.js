// The study guide format's validator. Plain JS with no browser APIs, so the
// server can reuse it on Claude's output and on packs in the Pack library.

const MAX_ERRORS = 15

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
const isText = (v) => typeof v === 'string' && v.trim() !== ''

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
    course: text(g, 'course', '', { optional: true }).trim(),
    topic: text(g, 'topic', '', { optional: true }).trim(),
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
            ...sourcePages(def),
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
            ...sourcePages(ex),
          })),
        ),
        quiz: list(mod, 'quiz', path, (q, p) => object(q, p, (question) => readQuizQuestion(question, p)), {
          optional: true,
        }),
        // Exam-style written questions. Optional: older packs don't have them.
        theory: list(
          mod,
          'theory',
          path,
          (t, p) =>
            object(t, p, (tq) => ({
              question: text(tq, 'question', p),
              marks: Number.isInteger(tq.marks) && tq.marks > 0 ? tq.marks : null,
              modelAnswer: text(tq, 'modelAnswer', p),
              markingPoints: list(tq, 'markingPoints', p, (point, pp) => {
                if (!isText(point)) fail(pp, `must be a non-empty string (got ${describe(point)})`)
                return String(point ?? '')
              }),
              ...sourcePages(tq),
            })),
          { optional: true },
        ),
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
      ...sourcePages(q),
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

// The slide or page numbers an item is based on. Optional and forgiving
// (stray values are dropped, not reported), and left out entirely when empty
// so packs made before it existed keep the same fingerprint.
function sourcePages(item) {
  if (!Array.isArray(item.sourcePages)) return {}
  const pages = [...new Set(item.sourcePages.filter((n) => Number.isInteger(n) && n > 0 && n < 10000))]
  return pages.length ? { sourcePages: pages.sort((a, b) => a - b).slice(0, 12) } : {}
}

function describe(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return 'an array'
  if (typeof value === 'string') return value.trim() ? 'a string' : 'an empty string'
  return typeof value === 'object' ? 'an object' : `${typeof value} ${JSON.stringify(value)}`
}
