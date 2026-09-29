import { useState } from 'react'
import CopyButton from './CopyButton.jsx'

// Shows the extracted text and hosts whatever turns it into a study guide
// (the JSON import panel, and optionally AI generation) via `children`.
export default function ExtractedPreview({ result, onReset, hasGuide, onViewGuide, children }) {
  const [openIndex, setOpenIndex] = useState(0)
  const [view, setView] = useState('sections') // 'sections' | 'raw'
  const unit = result.type === 'pdf' ? 'page' : 'slide'

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Text extracted</p>
          <h2 className="mt-1 truncate text-xl font-bold text-slate-900">{result.fileName}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {result.sections.length} {unit}s · {result.wordCount.toLocaleString()} words
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <button
            onClick={onReset}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-slate-50"
          >
            Upload another
          </button>
          {hasGuide && (
            <button
              onClick={onViewGuide}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
            >
              View study guide
            </button>
          )}
        </div>
      </div>

      {children}

      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-6 py-3">
          <h3 className="font-semibold text-slate-800">Extracted text</h3>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-sm" role="radiogroup" aria-label="Text view">
              {[
                ['sections', `By ${unit}`],
                ['raw', 'Full text'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  role="radio"
                  aria-checked={view === value}
                  onClick={() => setView(value)}
                  className={`rounded-md px-3 py-1 font-medium transition ${
                    view === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <CopyButton text={result.fullText} label="Copy all text" />
          </div>
        </div>
        {view === 'raw' ? (
          <pre className="max-h-[36rem] overflow-auto whitespace-pre-wrap px-6 py-4 font-sans text-sm leading-relaxed text-slate-700">
            {result.fullText}
          </pre>
        ) : (
          <ul className="divide-y divide-slate-100">
            {result.sections.map((section, i) => {
              const isOpen = openIndex === i
              return (
                <li key={section.index}>
                  <button
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-4 px-6 py-3 text-left transition hover:bg-slate-50"
                  >
                    <span className="w-8 shrink-0 text-sm tabular-nums text-slate-400">{section.index}</span>
                    <span className="flex-1 truncate font-medium text-slate-800">{section.title}</span>
                    <svg
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className={`h-4 w-4 shrink-0 text-slate-400 transition ${isOpen ? 'rotate-180' : ''}`}
                    >
                      <path d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="space-y-3 px-6 pb-5 sm:pl-18">
                      <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">
                        {section.text || <em className="text-slate-400">No text on this {unit}.</em>}
                      </p>
                      {section.notes && (
                        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                          <p className="mb-1 text-xs font-semibold uppercase tracking-wide">Speaker notes</p>
                          <p className="whitespace-pre-line">{section.notes}</p>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
