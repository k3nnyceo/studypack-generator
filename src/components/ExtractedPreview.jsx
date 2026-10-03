import { ArrowRight, ChevronDown, CircleCheck, FileText, MonitorPlay, Presentation } from 'lucide-react'
import { useState } from 'react'
import CopyButton from './CopyButton.jsx'
import { Button, Eyebrow } from './ui.jsx'

// The Notes view: extracted text, plus whatever turns it into a study guide
// (the JSON import panel, and optionally AI generation) via `children`.
export default function ExtractedPreview({ result, hasGuide, onViewGuide, children }) {
  const [openIndex, setOpenIndex] = useState(0)
  const [view, setView] = useState('sections') // 'sections' | 'raw'
  const unit = result.type === 'video' ? 'section' : result.type === 'pdf' ? 'page' : 'slide'
  const FileIcon = result.type === 'video' ? MonitorPlay : result.type === 'pdf' ? FileText : Presentation

  return (
    <div className="space-y-6">
      <div className="card flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-4">
          <span
            className={`flex size-12 shrink-0 items-center justify-center rounded-2xl ring-1 ${
              result.type === 'video'
                ? 'bg-red-50 text-red-600 ring-red-100'
                : result.type === 'pdf'
                  ? 'bg-rose-50 text-rose-600 ring-rose-100'
                  : 'bg-amber-50 text-amber-700 ring-amber-100'
            }`}
          >
            <FileIcon className="size-6" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <CircleCheck className="size-3.5" strokeWidth={2.5} aria-hidden />
              Text extracted
            </p>
            <h1 className="mt-0.5 truncate text-xl font-bold tracking-tight text-stone-900">{result.fileName}</h1>
            <p className="mt-0.5 text-sm text-stone-500">
              {result.sections.length} {unit}s · {result.wordCount.toLocaleString()} words
            </p>
            {result.youtube?.truncated && (
              <p className="mt-1 text-sm text-amber-700">
                Covers the first {result.youtube.coveredMinutes} of {result.youtube.minutes} minutes, the most one study pack can hold.
              </p>
            )}
          </div>
        </div>
        {hasGuide && (
          <Button variant="primary" onClick={onViewGuide}>
            Open study guide
            <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
          </Button>
        )}
      </div>

      {children}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200/80 px-6 py-4">
          <div>
            <Eyebrow>Source</Eyebrow>
            <h2 className="mt-0.5 font-semibold text-stone-900">Extracted text</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-lg bg-stone-100 p-1 text-sm" role="radiogroup" aria-label="Text view">
              {[
                ['sections', `By ${unit}`],
                ['raw', 'Full text'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={view === value}
                  onClick={() => setView(value)}
                  className={`rounded-md px-3 py-1 font-semibold transition ${
                    view === value ? 'bg-white text-stone-900 shadow-card' : 'text-stone-600 hover:text-stone-900'
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
          <pre
            tabIndex={0}
            aria-label="Full extracted text"
            className="max-h-[36rem] overflow-auto px-6 py-5 font-sans text-sm leading-relaxed whitespace-pre-wrap text-stone-700"
          >
            {result.fullText}
          </pre>
        ) : (
          <ul className="divide-y divide-stone-100">
            {result.sections.map((section, i) => {
              const isOpen = openIndex === i
              return (
                <li key={section.index}>
                  <button
                    type="button"
                    onClick={() => setOpenIndex(isOpen ? null : i)}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-4 px-6 py-3.5 text-left transition hover:bg-stone-50"
                  >
                    <span
                      className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold tabular-nums transition ${
                        isOpen ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-500'
                      }`}
                    >
                      {section.index}
                    </span>
                    <span className="flex-1 truncate font-medium text-stone-800">{section.title}</span>
                    <ChevronDown
                      className={`size-4 shrink-0 text-stone-500 transition duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </button>
                  {isOpen && (
                    <div className="animate-page-in space-y-3 px-6 pb-5 sm:pl-[4.25rem]">
                      <p className="text-sm leading-relaxed whitespace-pre-line text-stone-600">
                        {section.text || <em className="text-stone-500">No text on this {unit}.</em>}
                      </p>
                      {section.notes && (
                        <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950 ring-1 ring-amber-200">
                          <p className="mb-1 text-xs font-semibold tracking-[0.06em] text-amber-800 uppercase">
                            Speaker notes
                          </p>
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
      </section>
    </div>
  )
}
