import { ArrowRight, BookOpen, Layers, ListChecks } from 'lucide-react'
import { Button, Eyebrow } from './ui.jsx'

// Course header shown above the study views: full on the guide, compact on
// flashcards and quiz so the content stays close to the top.
export default function GuideHero({ guide, fileName, compact, counts, onNavigate }) {
  if (compact) {
    return (
      <div className="mx-auto min-w-0 max-w-3xl">
        <Eyebrow>{fileName}</Eyebrow>
        <h1 className="mt-1 truncate text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">{guide.title}</h1>
      </div>
    )
  }

  const definitions = guide.modules.reduce((n, m) => n + m.definitions.length, 0)
  const examples = guide.modules.reduce((n, m) => n + m.workedExamples.length, 0)
  const stats = [
    { label: 'Modules', value: guide.modules.length },
    { label: 'Key terms', value: definitions },
    { label: 'Worked examples', value: examples },
  ]

  return (
    <header className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-700 via-brand-800 to-brand-950 p-6 text-white shadow-elevated sm:p-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-brand-400/30 blur-3xl"
      />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 left-1/3 size-64 rounded-full bg-amber-300/10 blur-3xl" />

      <div className="relative">
        <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.08em] text-brand-200 uppercase">
          <BookOpen className="size-3.5" strokeWidth={2.5} aria-hidden />
          Study guide · {fileName}
        </p>
        <h1 className="mt-3 max-w-3xl text-3xl leading-tight font-extrabold tracking-tight text-balance sm:text-4xl">
          {guide.title}
        </h1>
        <p className="mt-4 max-w-3xl leading-relaxed text-pretty text-brand-100">{guide.overview}</p>

        <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-xs font-medium text-brand-200">{s.label}</dt>
              <dd className="mt-0.5 text-2xl font-bold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => onNavigate('flashcards')}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-brand-800 shadow-card transition hover:bg-brand-50 active:scale-[0.98]"
          >
            <Layers className="size-4" strokeWidth={2.25} aria-hidden />
            Study {counts.flashcards} flashcards
          </button>
          <Button
            onClick={() => onNavigate('quiz')}
            className="bg-white/10 text-white ring-1 ring-white/25 hover:bg-white/15"
            variant="ghost"
          >
            <ListChecks className="size-4" strokeWidth={2.25} aria-hidden />
            Take the {counts.quiz}-question quiz
            <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
          </Button>
        </div>
      </div>
    </header>
  )
}
