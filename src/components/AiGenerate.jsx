import { Loader2, Sparkles } from 'lucide-react'

// "Generate with Claude" panel. Only rendered when AI_GENERATION_ENABLED is on.
export default function AiGenerate({ onGenerate, isGenerating, error }) {
  return (
    <section className="card p-6 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-stone-900">Generate with Claude</h3>
          <p className="mt-1 text-sm text-stone-500">Or let Claude write the study guide from your notes.</p>
        </div>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand-600 px-4 text-sm font-semibold text-white shadow-brand transition hover:bg-brand-700 disabled:cursor-wait disabled:opacity-70"
        >
          {isGenerating ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          {isGenerating ? 'Generating…' : 'Generate study guide'}
        </button>
      </div>

      {isGenerating && (
        <p className="mt-4 rounded-xl bg-brand-50 p-4 text-sm text-brand-900 ring-1 ring-brand-200" role="status">
          Claude is reading your notes and writing summaries, definitions, worked examples and quiz questions. This
          usually takes one to a few minutes depending on length.
        </p>
      )}
      {error && (
        <p className="mt-4 rounded-xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
