import { ChevronDown, FileJson, TriangleAlert, Upload } from 'lucide-react'
import { useState } from 'react'
import { buildGenerationPrompt, EXAMPLE_GUIDE_JSON, parseStudyGuide } from '../lib/studyGuideFormat.js'
import CopyButton from './CopyButton.jsx'
import { buttonClasses } from './buttonStyles.js'
import { Button, Eyebrow } from './ui.jsx'

const FIELDS = [
  ['title', 'string', 'Required'],
  ['course', 'string', 'Optional. Groups packs in your library, e.g. "MECH 2201 Strength of Materials"'],
  ['topic', 'string', 'Optional. Library label for this pack; defaults to the title'],
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

export default function GuideImport({ draft, onDraftChange, onLoad, source }) {
  const [errors, setErrors] = useState([])
  const [showFormat, setShowFormat] = useState(false)

  function load(text = draft) {
    const result = parseStudyGuide(text)
    if (result.ok) {
      setErrors([])
      onLoad(result.guide)
    } else {
      setErrors(result.errors)
    }
  }

  // Reads a .json file into the box and loads it straight away.
  async function loadFile(file) {
    if (!file) return
    const text = await file.text()
    onDraftChange(text)
    load(text)
  }

  return (
    <section className="card p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <FileJson className="size-5" strokeWidth={2} aria-hidden />
          </span>
          <div>
            <Eyebrow>Next step</Eyebrow>
            <h2 className="mt-0.5 text-lg font-bold tracking-tight text-stone-900">Load your study guide</h2>
            <p className="mt-1 max-w-xl text-sm leading-relaxed text-stone-500">
              Paste study guide JSON below or upload a .json file. Need one? Copy the prompt, paste it into your AI
              tool, then paste its reply here.
            </p>
          </div>
        </div>
        <CopyButton text={() => buildGenerationPrompt(source)} label="Copy AI prompt + notes" copiedLabel="Prompt copied" />
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
        className="mt-6 h-64 w-full resize-y rounded-2xl bg-stone-50 p-4 font-mono text-[13px] leading-relaxed text-stone-800 ring-1 ring-stone-200 transition placeholder:text-stone-400 focus:bg-white focus:ring-2 focus:ring-brand-400 focus:outline-none"
      />

      {errors.length > 0 && (
        <div className="animate-page-in mt-3 flex gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200" role="alert">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden />
          <div>
            <p className="font-semibold">Couldn’t load this study guide</p>
            <ul className="mt-2 space-y-1 font-mono text-xs">
              {errors.map((error, i) => (
                <li key={i}>• {error}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setShowFormat(!showFormat)}
          aria-expanded={showFormat}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 transition hover:text-brand-800"
        >
          {showFormat ? 'Hide expected format' : 'Show expected format'}
          <ChevronDown className={`size-4 transition duration-200 ${showFormat ? 'rotate-180' : ''}`} aria-hidden />
        </button>
        <div className="flex flex-wrap items-center gap-3">
          <label className={buttonClasses({ className: 'cursor-pointer focus-within:ring-2 focus-within:ring-brand-400' })}>
            <Upload className="size-4" strokeWidth={2.25} aria-hidden />
            Upload .json
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              onChange={(e) => {
                loadFile(e.target.files?.[0])
                e.target.value = '' // allow re-selecting the same file
              }}
            />
          </label>
          <Button variant="primary" onClick={() => load()} disabled={!draft.trim()}>
            Load study guide
          </Button>
        </div>
      </div>

      {showFormat && (
        <div className="animate-page-in mt-6 space-y-5 border-t border-stone-200 pt-6">
          <div
            tabIndex={0}
            role="region"
            aria-label="Study guide fields"
            className="overflow-x-auto rounded-xl ring-1 ring-stone-200"
          >
            <table className="w-full text-left text-sm">
              <thead className="bg-stone-50 text-xs tracking-[0.06em] text-stone-500 uppercase">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Field</th>
                  <th className="px-4 py-2.5 font-semibold">Type</th>
                  <th className="px-4 py-2.5 font-semibold">Rules</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {FIELDS.map(([field, type, rule]) => (
                  <tr key={field}>
                    <td className="px-4 py-2.5 font-mono text-xs whitespace-nowrap text-stone-800">{field}</td>
                    <td className="px-4 py-2.5 font-mono text-xs text-brand-700">{type}</td>
                    <td className="px-4 py-2.5 text-stone-600">{rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-stone-500">
            Extra fields are ignored. A surrounding <code className="rounded bg-stone-100 px-1 text-xs text-stone-700">```json</code> code
            fence is fine.
          </p>
          <div className="relative">
            <CopyButton text={EXAMPLE_GUIDE_JSON} label="Copy example" className="absolute top-3 right-3" />
            <pre
              tabIndex={0}
              aria-label="Example study guide JSON"
              className="max-h-96 overflow-auto rounded-2xl bg-stone-900 p-5 pr-32 text-xs leading-relaxed text-stone-100"
            >
              {EXAMPLE_GUIDE_JSON}
            </pre>
          </div>
        </div>
      )}
    </section>
  )
}
