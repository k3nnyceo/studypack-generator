import { useState } from 'react'
import { buildGenerationPrompt, EXAMPLE_GUIDE_JSON, parseStudyGuide } from '../lib/studyGuideFormat.js'
import CopyButton from './CopyButton.jsx'

const FIELDS = [
  ['title', 'string', 'Required'],
  ['overview', 'string', 'Required'],
  ['modules', 'array', 'Required, at least one module'],
  ['modules[].title', 'string', 'Required'],
  ['modules[].sourceRange', 'string', 'Optional, e.g. "Slides 7-12"'],
  ['modules[].summary', 'string', 'Required. Blank line (\\n\\n) between paragraphs'],
  ['modules[].keyPoints', 'string[]', 'Required, may be []'],
  ['modules[].definitions', '{ term, definition }[]', 'Required, may be []'],
  ['modules[].workedExamples', '{ title, problem, steps[], answer }[]', 'Required, may be []. Aim for 3-5'],
  ['modules[].quiz', '{ question, options[], correctIndex, explanation }[]', 'Optional. If missing or [], quiz questions are generated from definitions'],
  ['quiz[].options', 'string[]', 'At least 2 choices. Shown in random order, unless one says e.g. "All of the above"'],
  ['quiz[].correctIndex', 'integer', 'Position of the right option, counting from 0'],
  ['quiz[].explanation', 'string', 'Optional'],
]

export default function GuideImport({ draft, onDraftChange, onLoad, source, hasGuide }) {
  const [errors, setErrors] = useState([])
  const [showFormat, setShowFormat] = useState(false)

  function load() {
    const result = parseStudyGuide(draft)
    if (result.ok) {
      setErrors([])
      onLoad(result.guide)
    } else {
      setErrors(result.errors)
    }
  }

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Load your study guide</h3>
          <p className="mt-1 text-sm text-slate-500">
            Paste study guide JSON below and click Load to build the study guide, flashcards and quiz.
          </p>
        </div>
        <CopyButton
          text={() => buildGenerationPrompt(source)}
          label="Copy AI prompt + notes"
          copiedLabel="Prompt copied"
        />
      </div>

      <textarea
        value={draft}
        onChange={(e) => {
          onDraftChange(e.target.value)
          if (errors.length) setErrors([])
        }}
        spellCheck={false}
        placeholder={'{\n  "title": "…",\n  "overview": "…",\n  "modules": [ … ]\n}'}
        aria-label="Study guide JSON"
        className="mt-4 h-64 w-full resize-y rounded-xl bg-slate-50 p-4 font-mono text-sm leading-relaxed text-slate-800 ring-1 ring-slate-200 transition placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
      />

      {errors.length > 0 && (
        <div className="mt-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200" role="alert">
          <p className="font-semibold">Couldn’t load this study guide:</p>
          <ul className="mt-2 space-y-1 font-mono text-xs">
            {errors.map((error, i) => (
              <li key={i}>• {error}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowFormat(!showFormat)}
          aria-expanded={showFormat}
          className="text-sm font-medium text-indigo-600 transition hover:text-indigo-800"
        >
          {showFormat ? 'Hide expected format' : 'Show expected format'}
        </button>
        <button
          type="button"
          onClick={load}
          disabled={!draft.trim()}
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {hasGuide ? 'Load (replaces current guide)' : 'Load'}
        </button>
      </div>

      {showFormat && (
        <div className="mt-5 space-y-4 border-t border-slate-200 pt-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="pb-2 pr-4 font-semibold">Field</th>
                  <th className="pb-2 pr-4 font-semibold">Type</th>
                  <th className="pb-2 font-semibold">Rules</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {FIELDS.map(([field, type, rule]) => (
                  <tr key={field}>
                    <td className="py-2 pr-4 font-mono text-xs text-slate-800">{field}</td>
                    <td className="py-2 pr-4 font-mono text-xs text-indigo-700">{type}</td>
                    <td className="py-2 text-slate-600">{rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-slate-500">
            Extra fields are ignored. A surrounding <code className="text-xs">```json</code> code fence is fine.
          </p>
          <div className="relative">
            <CopyButton text={EXAMPLE_GUIDE_JSON} label="Copy example" className="absolute top-3 right-3" />
            <pre className="max-h-96 overflow-auto rounded-xl bg-slate-900 p-4 pr-32 text-xs leading-relaxed text-slate-100">
              {EXAMPLE_GUIDE_JSON}
            </pre>
          </div>
        </div>
      )}
    </section>
  )
}
