import { Check, Eye, PenLine } from 'lucide-react'
import { useState } from 'react'
import FilterChip from './FilterChip.jsx'
import { Badge, Button } from './ui.jsx'

// Exam-style written questions ("Explain…", "Calculate…") with model answers
// and the points an examiner looks for. The student can draft an answer, then
// reveal the model answer and tick the marking points they covered, which
// gives a self-marked score.
export default function Theory({ items, modules }) {
  const [moduleFilter, setModuleFilter] = useState('all')
  const shown = items.filter((t) => moduleFilter === 'all' || t.moduleIndex === moduleFilter)

  if (items.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-8 text-center text-stone-500 ring-1 ring-stone-200">
        This pack has no theory questions. Packs generated from now on include them.
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="card overflow-hidden p-4 sm:p-5">
        <div className="-mr-4 flex gap-2 overflow-x-auto pr-10 pb-1 [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_calc(100%-3rem),transparent)] sm:-mr-5">
          <FilterChip active={moduleFilter === 'all'} onClick={() => setModuleFilter('all')}>
            All modules <span className="tabular-nums opacity-70">{items.length}</span>
          </FilterChip>
          {modules.map((title, m) => {
            const count = items.filter((t) => t.moduleIndex === m).length
            if (!count) return null
            return (
              <FilterChip key={m} active={moduleFilter === m} onClick={() => setModuleFilter(m)} title={title}>
                <span className="max-w-48 truncate">{title}</span> <span className="tabular-nums opacity-70">{count}</span>
              </FilterChip>
            )
          })}
        </div>
      </div>

      <ol className="space-y-4">
        {shown.map((item) => (
          <TheoryQuestion key={item.id} item={item} number={items.indexOf(item) + 1} />
        ))}
      </ol>
    </div>
  )
}

function TheoryQuestion({ item, number }) {
  const [draft, setDraft] = useState('')
  const [writing, setWriting] = useState(false)
  const [revealed, setRevealed] = useState(false)
  const [ticked, setTicked] = useState(() => new Set())
  const points = item.markingPoints
  const covered = ticked.size

  const toggle = (i) =>
    setTicked((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  return (
    <li className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{item.moduleTitle}</span>
        {item.marks && <Badge tone="brand">{item.marks} marks</Badge>}
      </div>
      <h3 className="mt-2 text-lg leading-snug font-semibold text-stone-900">
        {number}. {item.question}
      </h3>

      {writing && (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={6}
          placeholder="Write your answer as you would in the exam…"
          aria-label={`Your answer to question ${number}`}
          className="mt-4 w-full rounded-xl border border-stone-300 bg-white p-3 text-sm leading-relaxed focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
        />
      )}

      {!revealed ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {!writing && (
            <Button size="sm" icon={PenLine} onClick={() => setWriting(true)}>
              Write my answer
            </Button>
          )}
          <Button size="sm" variant="primary" icon={Eye} onClick={() => setRevealed(true)}>
            Show model answer
          </Button>
        </div>
      ) : (
        <div className="animate-page-in mt-5 space-y-5">
          <div className="rounded-xl bg-stone-50 p-4 ring-1 ring-stone-200">
            <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">Model answer</p>
            <div className="mt-2 space-y-2 text-sm leading-relaxed text-stone-800">
              {item.modelAnswer.split(/\n{2,}/).map((para, i) => (
                <p key={i} className="whitespace-pre-line">
                  {para}
                </p>
              ))}
            </div>
          </div>
          {points.length > 0 && (
            <div>
              <p className="text-sm font-semibold text-stone-900">Tick the points your answer covered</p>
              <ul className="mt-2 space-y-1.5">
                {points.map((point, i) => (
                  <li key={i}>
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg p-2 text-sm text-stone-700 transition hover:bg-stone-50">
                      <input type="checkbox" checked={ticked.has(i)} onChange={() => toggle(i)} className="mt-0.5 size-4 accent-brand-600" />
                      <span>{point}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <p className="mt-3 flex items-center gap-2 text-sm" role="status">
                <Check className="size-4 text-emerald-600" aria-hidden />
                <span className="font-semibold text-stone-900 tabular-nums">
                  {covered} of {points.length} points
                </span>
                {item.marks && (
                  <span className="text-stone-500">
                    · about {Math.round((covered / points.length) * item.marks)} of {item.marks} marks
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </li>
  )
}
