import { BookOpen, ChartArea, Check, Gauge, Layers, LibraryBig, ListChecks, Loader2, Lock, RotateCcw, Sparkles, TriangleAlert, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { SIGN_IN_ENABLED } from '../config.js'
import { formatResetTime } from '../lib/billing.js'
import SignIn from './SignIn.jsx'
import { Button, Eyebrow } from './ui.jsx'

const OUTPUTS = [
  { icon: BookOpen, label: 'Study guide' },
  { icon: Layers, label: 'Flashcards' },
  { icon: ListChecks, label: 'Quiz' },
]

// The main "Generate" step after an upload. Only rendered when
// AI_GENERATION_ENABLED is on. Generating needs a sign-in, so signed-out
// students get the sign-in options in place of Generate. `error` is null or
// { message, reason?, resetsAt? }; a plan limit adds when it refills and a way
// to upgrade. `diagrams` is { pages, limit, unit, send, onToggle }: the diagram
// pages found in the notes (null while looking), how many the plan lets Claude
// see, and whether to send them. `split` is set when the notes are too long
// for one pack: { parts, unit, done, generating, onGenerate(part), batch,
// onGenerateAll (null on plans without it), onCancelAll, onOpenLibrary,
// onOpenPlans } (see PartsList).
export default function AiGenerate({ onGenerate, split, onCancel, isGenerating, error, signedIn, authReady, billing, onOpenPlans, diagrams }) {
  const needsSignIn = SIGN_IN_ENABLED && !signedIn
  const usage = signedIn ? billing?.usage : null
  const canUpgrade = billing?.paymentsEnabled && billing?.plan !== 'max'

  return (
    <section className="relative overflow-hidden rounded-3xl bg-white p-6 shadow-elevated ring-1 ring-brand-200 sm:p-8">
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full bg-brand-100/70 blur-3xl" />
      <div className="relative">
        <Eyebrow>Next step</Eyebrow>
        <h2 className="mt-1 text-xl font-bold tracking-tight text-stone-900 sm:text-2xl">Generate your study pack</h2>
        <p className="mt-2 max-w-xl text-stone-600">
          StudyPack writes module summaries, key definitions, worked examples, flashcards and a quiz from your notes.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {OUTPUTS.map((o) => (
            <li key={o.label} className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700">
              <o.icon className="size-4" strokeWidth={2.25} aria-hidden />
              {o.label}
            </li>
          ))}
        </ul>

        {isGenerating ? (
          <GeneratingStatus
            onCancel={onCancel}
            label={split?.generating ? `Writing part ${split.generating} of ${split.parts.length}…` : 'Writing your study pack…'}
          />
        ) : needsSignIn ? (
          <div className="mt-6">
            <p className="font-semibold text-stone-800">Sign in to generate your study pack</p>
            <p className="mt-1 text-sm text-stone-500">
              It’s free. Your packs are saved to your account and appear on all your devices.
            </p>
            {/* Stays put while the session check finishes, so the page doesn't jump. */}
            <div className="mt-4 min-h-10">{authReady && <SignIn text="continue_with" />}</div>
          </div>
        ) : (
          <>
            <DiagramOption diagrams={diagrams} perPart={Boolean(split)} canUpgrade={canUpgrade} onOpenPlans={onOpenPlans} />
            {split ? (
              <PartsList split={split} />
            ) : (
              <div className="mt-6 flex flex-wrap items-center gap-4">
                <Button variant="primary" size="lg" icon={Sparkles} onClick={onGenerate}>
                  Generate study pack
                </Button>
                <span className="text-sm text-stone-500">Takes 2–3 minutes</span>
              </div>
            )}
          </>
        )}

        {usage && !isGenerating && (
          <button
            type="button"
            onClick={onOpenPlans}
            className="mt-4 flex items-center gap-2 text-sm text-stone-500 transition hover:text-stone-800"
          >
            <Gauge className="size-4 shrink-0" strokeWidth={2.25} aria-hidden />
            <span>
              This session: <span className="font-semibold tabular-nums">{usage.window.percent}%</span> used · This{' '}
              {billing.plan === 'free' ? 'month' : 'period'}: <span className="font-semibold tabular-nums">{usage.period.percent}%</span>
            </span>
          </button>
        )}

        {error && (
          <div
            className={`animate-page-in mt-5 flex gap-3 rounded-xl p-4 text-sm ring-1 ${error.reason ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-rose-50 text-rose-900 ring-rose-200'}`}
            role="alert"
          >
            <TriangleAlert className={`mt-0.5 size-4 shrink-0 ${error.reason ? 'text-amber-600' : 'text-rose-600'}`} aria-hidden />
            <div className="min-w-0">
              <p>
                {error.message}
                {error.resetsAt && ` It refills at ${formatResetTime(error.resetsAt)}.`}
              </p>
              {error.reason && (error.reason !== 'too-long' || billing.plan === 'free') && canUpgrade && (
                <Button size="sm" variant="primary" icon={Sparkles} onClick={onOpenPlans} className="mt-3">
                  {billing.plan === 'free' ? 'See paid plans' : 'Upgrade your plan'}
                </Button>
              )}
            </div>
          </div>
        )}

        <p className="mt-6 flex items-start gap-2 border-t border-stone-100 pt-4 text-xs leading-relaxed text-stone-500">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Your file is read on your device. To write your pack, its text (and its diagram pages, if included) is sent to
          Claude, Anthropic’s AI model.
        </p>
      </div>
    </section>
  )
}

// Paid plans: which diagram pages Claude will see as pictures, with a switch.
// Free: a note that Pro and Max include them. Nothing when there are none.
function DiagramOption({ diagrams, perPart, canUpgrade, onOpenPlans }) {
  const refs = [...new Set((diagrams?.pages ?? []).slice(0, diagrams?.limit || undefined).map((p) => p.ref))].sort((a, b) => a - b)
  if (!diagrams || !refs.length) return null
  const { unit, limit, send, onToggle } = diagrams
  const found = new Set(diagrams.pages.map((p) => p.ref)).size
  const label = `${refs.length} diagram ${unit}${refs.length === 1 ? '' : 's'}`

  if (!limit) {
    return (
      <p className="mt-6 flex items-start gap-2.5 rounded-xl bg-stone-50 p-3.5 text-sm text-stone-600 ring-1 ring-stone-200">
        <ChartArea className="mt-0.5 size-4 shrink-0 text-brand-600" strokeWidth={2.25} aria-hidden />
        <span>
          Your notes have {found} {unit}
          {found === 1 ? '' : 's'} of diagrams or graphs. On Pro and Max, Claude sees them too, so your pack can explain them.{' '}
          {canUpgrade && (
            <button type="button" onClick={onOpenPlans} className="font-semibold text-brand-700 hover:underline">
              See plans
            </button>
          )}
        </span>
      </p>
    )
  }

  return (
    <label className="mt-6 flex cursor-pointer items-start gap-3 rounded-xl bg-brand-50/60 p-3.5 text-sm ring-1 ring-brand-100 transition hover:bg-brand-50">
      <input
        type="checkbox"
        checked={send}
        onChange={(e) => onToggle(e.target.checked)}
        className="mt-0.5 size-4 shrink-0 accent-brand-600"
      />
      <span className="min-w-0">
        <span className="font-semibold text-stone-800">
          {perPart ? `Let Claude see each part’s diagram ${unit}s` : `Let Claude see the ${label}`}
        </span>
        {perPart ? (
          <span className="mt-0.5 block text-stone-600">
            {found} found in this file. Each part sends its own, up to {limit}, as pictures so its pack can explain the diagrams
            and graphs.
          </span>
        ) : (
          <span className="mt-0.5 block text-stone-600">
            {unit === 'slide' ? 'Slides' : 'Pages'} {refs.join(', ')}, sent as pictures so your pack can explain the diagrams and graphs.
            {found > refs.length && ` Your plan includes up to ${limit} per pack.`}
          </span>
        )}
      </span>
    </label>
  )
}

// Notes too long for one pack: one row per part, each made into its own pack,
// one at a time or all at once (two running together). Parts already made
// from these notes are ticked; while making them all, each row shows how its
// part is going.
function PartsList({ split }) {
  const { parts, unit, done, onGenerate, batch, onGenerateAll, onCancelAll, onOpenLibrary, onOpenPlans } = split
  const running = Boolean(batch?.running)
  const left = parts.filter((p) => !done.has(p.number))
  const next = left[0]
  const statusOf = (part) => (done.has(part.number) ? 'done' : (batch?.statuses[part.number]?.state ?? null))
  const writing = parts.filter((p) => statusOf(p) === 'writing').length
  const waiting = parts.map((p) => batch?.statuses[p.number]).find((s) => s?.state === 'waiting')

  return (
    <div className="mt-6">
      <p className="font-semibold text-stone-800">This lecture is long, so it’s made into {parts.length} study packs</p>
      <p className="mt-1 text-sm text-stone-500">
        Each part is a full pack of its own, about 2–3 minutes each. “View in source” still opens the right {unit.toLowerCase()} of
        the whole file.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {running ? (
          <>
            <p className="flex items-center gap-2 text-sm font-semibold text-stone-800" role="status" aria-live="polite">
              <Loader2 className="size-4 animate-spin text-brand-600" aria-hidden />
              Writing {writing} of {left.length} remaining… they’re saved to your library as they’re ready
            </p>
            <Button size="sm" variant="ghost" icon={X} onClick={onCancelAll}>
              Cancel
            </Button>
          </>
        ) : left.length > 1 && onGenerateAll ? (
          <Button variant="primary" icon={Sparkles} onClick={onGenerateAll}>
            Generate all {left.length === parts.length ? parts.length : `${left.length} remaining`} parts
          </Button>
        ) : left.length > 1 ? (
          <p className="text-sm text-stone-600">
            Make them one at a time below.{' '}
            {onOpenPlans && (
              <button type="button" onClick={onOpenPlans} className="font-semibold text-brand-700 hover:underline">
                Paid plans make every part at once
              </button>
            )}
          </p>
        ) : null}
        {!running && done.size > 0 && (
          <Button size="sm" variant="ghost" icon={LibraryBig} onClick={onOpenLibrary}>
            Open your library
          </Button>
        )}
      </div>
      {waiting && !running && (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" role="alert">
          {waiting.message}
          {waiting.resetsAt && ` It refills at ${formatResetTime(waiting.resetsAt)}; make the rest then.`}
        </p>
      )}

      <ol className="mt-4 divide-y divide-stone-100 overflow-hidden rounded-2xl ring-1 ring-stone-200">
        {parts.map((part) => {
          const status = statusOf(part)
          const made = status === 'done'
          const range = part.from === null ? '' : part.from === part.to ? `${unit.slice(0, -1)} ${part.from}` : `${unit} ${part.from}–${part.to}`
          const note = batch?.statuses[part.number]
          return (
            <li key={part.number} className="flex flex-wrap items-center gap-3 bg-white px-4 py-3">
              <span
                className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums ${
                  made ? 'bg-emerald-100 text-emerald-700' : status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-brand-50 text-brand-700'
                }`}
              >
                {made ? (
                  <Check className="size-4" strokeWidth={3} aria-label="Made" />
                ) : status === 'writing' ? (
                  <Loader2 className="size-4 animate-spin" aria-label="Writing" />
                ) : (
                  part.number
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-stone-800">Part {part.number}</span>
                <span className="block text-xs text-stone-500 tabular-nums">
                  {range}
                  {status === 'writing' && ' · writing…'}
                  {status === 'queued' && ' · waiting its turn'}
                  {status === 'waiting' && ' · waits for your allowance'}
                </span>
                {status === 'failed' && note?.message && <span className="mt-0.5 block text-xs text-rose-700">{note.message}</span>}
              </span>
              {!running && (
                <Button
                  size="sm"
                  variant={part === next && left.length === 1 ? 'primary' : 'soft'}
                  icon={made ? RotateCcw : Sparkles}
                  onClick={() => onGenerate(part)}
                  aria-label={`${made ? 'Make again' : status === 'failed' ? 'Try again' : 'Generate'}: part ${part.number}${range ? `, ${range}` : ''}`}
                >
                  {made ? 'Make again' : status === 'failed' ? 'Try again' : 'Generate'}
                </Button>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}

// Mounted only while generating, so its timer starts from zero each time.
function GeneratingStatus({ onCancel, label }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const started = Date.now()
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="mt-6" role="status" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-stone-800">
          {label} <span className="font-medium text-stone-500 tabular-nums">{formatTime(seconds)}</span>
        </p>
        <Button size="sm" variant="ghost" icon={X} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-100">
        <div className="h-full w-1/3 animate-[indeterminate_1.6s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-brand-400 to-brand-600" />
      </div>
      <p className="mt-3 text-sm text-stone-500">This usually takes 2–3 minutes. It keeps going if you lock your phone or switch apps; come back here to see it.</p>
    </div>
  )
}

const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
