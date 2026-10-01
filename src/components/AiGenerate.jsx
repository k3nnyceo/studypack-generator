import { BookOpen, Layers, ListChecks, Lock, Sparkles, TriangleAlert, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button, Eyebrow } from './ui.jsx'

const OUTPUTS = [
  { icon: BookOpen, label: 'Study guide' },
  { icon: Layers, label: 'Flashcards' },
  { icon: ListChecks, label: 'Quiz' },
]

// The main "Generate" step after an upload. Only rendered when
// AI_GENERATION_ENABLED is on.
export default function AiGenerate({ onGenerate, onCancel, isGenerating, error }) {
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
          <GeneratingStatus onCancel={onCancel} />
        ) : (
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Button variant="primary" size="lg" icon={Sparkles} onClick={onGenerate}>
              Generate study pack
            </Button>
            <span className="text-sm text-stone-500">Free to try · takes about a minute</span>
          </div>
        )}

        {error && (
          <div className="animate-page-in mt-5 flex gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-900 ring-1 ring-rose-200" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-600" aria-hidden />
            <p>{error}</p>
          </div>
        )}

        <p className="mt-6 flex items-start gap-2 border-t border-stone-100 pt-4 text-xs leading-relaxed text-stone-500">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Your file is read on your device. To write your pack, its text is sent to Claude, Anthropic’s AI model.
        </p>
      </div>
    </section>
  )
}

// Mounted only while generating, so its timer starts from zero each time.
function GeneratingStatus({ onCancel }) {
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
          Writing your study pack… <span className="font-medium text-stone-500 tabular-nums">{formatTime(seconds)}</span>
        </p>
        <Button size="sm" variant="ghost" icon={X} onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-100">
        <div className="h-full w-1/3 animate-[indeterminate_1.6s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-brand-400 to-brand-600" />
      </div>
      <p className="mt-3 text-sm text-stone-500">This usually takes 1–2 minutes. It keeps going if you lock your phone or switch apps; come back here to see it.</p>
    </div>
  )
}

const formatTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
