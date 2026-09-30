import { BookMarked, CircleCheck, Eye, EyeOff, Lightbulb, ListOrdered, Target } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Badge } from './ui.jsx'

export default function StudyGuide({ guide }) {
  const active = useActiveModule(guide.modules.length)

  return (
    <div className="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-10">
      <nav aria-label="Modules" className="mb-6 lg:mb-0">
        <p className="mb-3 hidden text-xs font-semibold tracking-[0.08em] text-stone-500 uppercase lg:block">
          Modules
        </p>
        <ol className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] lg:sticky lg:top-24 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0 lg:pb-0">
          {guide.modules.map((module, i) => {
            const isActive = active === i
            return (
              <li key={i} className="shrink-0">
                <a
                  href={`#module-${i + 1}`}
                  aria-current={isActive ? 'true' : undefined}
                  className={`flex items-start gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                    isActive
                      ? 'bg-white font-semibold text-stone-900 shadow-card ring-1 ring-stone-200/80'
                      : 'text-stone-600 ring-1 ring-stone-200 hover:bg-white hover:text-stone-900 lg:ring-0'
                  }`}
                >
                  <span
                    className={`flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-bold tabular-nums transition ${
                      isActive ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-500'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="pt-0.5 lg:line-clamp-2">{module.title}</span>
                </a>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="min-w-0 space-y-8">
        {guide.modules.map((module, i) => (
          <Module key={i} module={module} number={i + 1} />
        ))}
      </div>
    </div>
  )
}

// Tracks which module is in view so the sidebar can highlight it.
function useActiveModule(count) {
  const [active, setActive] = useState(0)
  useEffect(() => {
    const sections = Array.from({ length: count }, (_, i) => document.getElementById(`module-${i + 1}`)).filter(Boolean)
    if (!('IntersectionObserver' in window) || sections.length === 0) return
    const visible = new Map()
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => visible.set(e.target.id, e.isIntersecting))
        const first = sections.findIndex((s) => visible.get(s.id))
        if (first >= 0) setActive(first)
      },
      { rootMargin: '-96px 0px -55% 0px' },
    )
    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [count])
  return active
}

function Module({ module, number }) {
  return (
    <section id={`module-${number}`} className="card scroll-mt-24 p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-sm font-bold text-brand-700 tabular-nums ring-1 ring-brand-100">
          {String(number).padStart(2, '0')}
        </span>
        {module.sourceRange && <Badge>{module.sourceRange}</Badge>}
      </div>
      <h2 className="mt-4 text-2xl font-bold tracking-tight text-balance text-stone-900">{module.title}</h2>

      <div className="mt-4 space-y-4 leading-7 text-stone-700">
        {module.summary.split(/\n{2,}/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>

      {module.keyPoints.length > 0 && (
        <SubSection icon={Target} title="Key points">
          <ul className="space-y-2.5 rounded-2xl bg-stone-50 p-5 ring-1 ring-stone-200/70">
            {module.keyPoints.map((point, i) => (
              <li key={i} className="flex gap-3 leading-relaxed text-stone-700">
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-brand-500" strokeWidth={2} aria-hidden />
                {point}
              </li>
            ))}
          </ul>
        </SubSection>
      )}

      {module.definitions.length > 0 && (
        <SubSection icon={BookMarked} title="Key definitions">
          <dl className="grid gap-3 sm:grid-cols-2">
            {module.definitions.map((def, i) => (
              <div
                key={i}
                className="rounded-xl bg-white p-4 ring-1 ring-stone-200 transition hover:shadow-card hover:ring-brand-200"
              >
                <dt className="font-semibold text-stone-900">{def.term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-stone-600">{def.definition}</dd>
              </div>
            ))}
          </dl>
        </SubSection>
      )}

      {module.workedExamples.length > 0 && (
        <SubSection icon={Lightbulb} title="Worked examples">
          <div className="space-y-3">
            {module.workedExamples.map((example, i) => (
              <WorkedExample key={i} example={example} number={i + 1} />
            ))}
          </div>
        </SubSection>
      )}
    </section>
  )
}

function SubSection({ icon: Icon, title, children }) {
  return (
    <div className="mt-10">
      <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold tracking-[0.06em] text-stone-500 uppercase">
        <Icon className="size-4 text-brand-500" strokeWidth={2.25} aria-hidden />
        {title}
      </h3>
      {children}
    </div>
  )
}

// The solution stays hidden until the student asks for it, so they can try first.
function WorkedExample({ example, number }) {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className={`overflow-hidden rounded-2xl ring-1 transition ${revealed ? 'ring-brand-200 shadow-card' : 'ring-stone-200'}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <p className="font-semibold text-stone-900">
            <span className="mr-2 text-brand-600">Example {number}</span>
            <span className="text-stone-400" aria-hidden>
              ·
            </span>{' '}
            {example.title}
          </p>
        </div>
        <p className="mt-2 leading-relaxed whitespace-pre-line text-stone-700">{example.problem}</p>
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          aria-expanded={revealed}
          className={`mt-4 inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold transition active:scale-[0.98] ${
            revealed ? 'bg-stone-100 text-stone-700 hover:bg-stone-200' : 'bg-brand-50 text-brand-700 hover:bg-brand-100'
          }`}
        >
          {revealed ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          {revealed ? 'Hide solution' : 'Show solution'}
        </button>
      </div>

      {revealed && (
        <div className="animate-page-in border-t border-stone-200 bg-stone-50/70 p-5">
          <p className="mb-4 flex items-center gap-2 text-xs font-semibold tracking-[0.06em] text-stone-500 uppercase">
            <ListOrdered className="size-3.5" aria-hidden />
            Solution
          </p>
          <ol className="relative space-y-4 before:absolute before:top-2 before:bottom-2 before:left-[11px] before:w-px before:bg-stone-200">
            {example.steps.map((step, i) => (
              <li key={i} className="relative flex gap-4">
                <span className="z-10 flex size-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-stone-600 tabular-nums ring-1 ring-stone-300">
                  {i + 1}
                </span>
                <span className="pt-0.5 text-sm leading-relaxed whitespace-pre-line text-stone-700">{step}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-950 ring-1 ring-emerald-200">
            <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" strokeWidth={2} aria-hidden />
            <p>
              <span className="font-semibold">Answer: </span>
              {example.answer}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
