import { ArrowRight, BookOpen, LibraryBig, FileJson, Layers, ListChecks, Loader2, Lock, Sparkles, TriangleAlert, Upload, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { PackCard } from './Library.jsx'
import UploadDropzone from './UploadDropzone.jsx'
import { AI_GENERATION_ENABLED, SIGN_IN_ENABLED } from '../config.js'
import { Badge, Button } from './ui.jsx'

const STEPS = [
  {
    icon: Upload,
    title: 'Upload your notes',
    body: 'Drop in lecture slides (PPTX) or PDF notes. Text is extracted right in your browser.',
  },
  AI_GENERATION_ENABLED
    ? {
        icon: Sparkles,
        title: 'Generate your study pack',
        body: 'One click writes summaries, key terms, worked examples, flashcards and a quiz from your notes.',
      }
    : {
        icon: FileJson,
        title: 'Load your study guide',
        body: 'Paste or upload a study guide in StudyPack’s JSON format, generated from your notes.',
      },
  {
    icon: ListChecks,
    title: 'Study and self-test',
    body: 'Work through summaries, flip flashcards and take quizzes with instant feedback.',
  },
]

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Structured study guides',
    body: 'Module-by-module summaries, key definitions and worked examples with solutions you reveal when ready.',
  },
  {
    icon: Layers,
    title: 'Flashcards that stick',
    body: 'Flip, shuffle and filter by topic, with progress tracking so you know what you’ve covered.',
  },
  {
    icon: ListChecks,
    title: 'Quizzes that teach',
    body: 'Instant feedback, clear explanations and a “retry what I missed” round to close the gaps.',
  },
]

export default function Landing({
  onFile,
  onTrySample,
  onBrowseShared,
  status,
  resumingJob,
  onCancelResume,
  fileName,
  error,
  recent,
  libraryCount,
  onOpenPack,
  onDeletePack,
  onViewLibrary,
}) {
  // On a phone, messages under the dropzone are below the fold; bring a new
  // one into view, or it looks like nothing happened.
  const messageRef = useRef(null)
  const message = resumingJob ? 'resuming' : status === 'error' ? error : ''
  useEffect(() => {
    const el = messageRef.current
    if (!message || !el) return
    // After the first paint, so it isn't undone by the browser restoring scroll on reload.
    const frame = requestAnimationFrame(() => {
      const { top, bottom } = el.getBoundingClientRect()
      if (top < 0 || bottom > window.innerHeight) el.scrollIntoView({ block: 'center' })
    })
    return () => cancelAnimationFrame(frame)
  }, [message])

  return (
    <div className="space-y-20 sm:space-y-28">
      <section className="mx-auto max-w-3xl text-center">
        <Badge tone="brand" className="mb-6 px-3 py-1">
          <Lock className="size-3" strokeWidth={2.75} aria-hidden />
          {/* With AI on, extracted text goes to Claude, so only claim what stays true. */}
          {AI_GENERATION_ENABLED
            ? `${SIGN_IN_ENABLED ? 'Free with Google sign-in' : 'No sign-up needed'} · your files are read on your device`
            : 'Private by design: your files stay on your device'}
        </Badge>
        <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight text-balance text-stone-900 sm:text-6xl">
          Turn lecture notes into a{' '}
          <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-brand-700 bg-clip-text text-transparent">
            study pack
          </span>{' '}
          you’ll actually use
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-pretty text-stone-600">
          Summaries, key definitions, worked examples, flashcards and quizzes, all built from your own course
          material.
        </p>

        <div className="mt-10 text-left">
          <UploadDropzone onFile={onFile} disabled={status === 'parsing'} />
        </div>

        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <span className="text-sm text-stone-500">No notes handy?</span>
          <Button variant="soft" icon={Sparkles} onClick={onTrySample} disabled={status === 'parsing'}>
            Try a sample study pack
          </Button>
          <Button variant="ghost" icon={LibraryBig} onClick={onBrowseShared} disabled={status === 'parsing'}>
            Browse ready-made packs
          </Button>
        </div>

        <div ref={messageRef}>
          {resumingJob && (
            <div
              className="mt-5 flex items-start gap-3 rounded-xl bg-brand-50 p-4 text-left text-sm text-brand-900 ring-1 ring-brand-200"
              role="status"
            >
              <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin text-brand-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">Finishing your study pack…</p>
                <p className="mt-0.5 break-words text-brand-800/80">
                  {resumingJob.fileName ? `${resumingJob.fileName} · it opens` : 'It opens'} here as soon as it’s ready.
                </p>
                <Button size="sm" variant="ghost" icon={X} onClick={onCancelResume} className="mt-2 -ml-3">
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {status === 'parsing' && (
            <div className="mt-5 flex items-center justify-center gap-2.5 text-sm text-stone-600" role="status">
              <Loader2 className="size-4 animate-spin text-brand-600" aria-hidden />
              Reading <span className="font-semibold text-stone-800">{fileName}</span>…
            </div>
          )}

          {status === 'error' && (
            <div
              className="mt-5 flex gap-3 rounded-xl bg-rose-50 p-4 text-left text-sm whitespace-pre-line text-rose-900 ring-1 ring-rose-200"
              role="alert"
            >
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden />
              <div>{error}</div>
            </div>
          )}
        </div>
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent-packs" className="-mt-8 sm:-mt-12">
          <div className="mb-4 flex items-center justify-between gap-4">
            <h2 id="recent-packs" className="text-sm font-semibold tracking-[0.08em] text-stone-500 uppercase">
              Pick up where you left off
            </h2>
            <button
              type="button"
              onClick={onViewLibrary}
              className="inline-flex items-center gap-1 text-sm font-semibold text-brand-600 transition hover:text-brand-800"
            >
              {libraryCount > recent.length ? `View all ${libraryCount}` : 'Open library'}
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((entry) => (
              <PackCard
                key={entry.id}
                entry={entry}
                showCourse
                onOpen={() => onOpenPack(entry)}
                onDelete={() => onDeletePack(entry)}
              />
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="how-it-works">
        <h2 id="how-it-works" className="text-center text-sm font-semibold tracking-[0.08em] text-stone-500 uppercase">
          How it works
        </h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title} className="card relative p-6">
              <span className="absolute top-6 right-6 text-xs font-semibold text-stone-500 tabular-nums">Step {i + 1}</span>
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
                <step.icon className="size-5" strokeWidth={2} aria-hidden />
              </span>
              <h3 className="mt-4 font-semibold text-stone-900">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-500">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="features" className="rounded-3xl bg-stone-900 px-6 py-12 text-white sm:px-12 sm:py-16">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-[0.08em] text-brand-300 uppercase">Everything in one place</p>
          <h2 id="features" className="mt-3 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Three ways to learn the same material
          </h2>
        </div>
        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title}>
              <span className="flex size-10 items-center justify-center rounded-xl bg-white/10 text-brand-200 ring-1 ring-white/15">
                <f.icon className="size-5" strokeWidth={2} aria-hidden />
              </span>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-300">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-stone-200 pt-8 text-center text-sm text-stone-500">
        StudyPack · Built for students who’d rather understand than cram.
      </footer>
    </div>
  )
}
