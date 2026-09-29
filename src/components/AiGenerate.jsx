// "Generate with Claude" panel. Only rendered when AI_GENERATION_ENABLED is on.
export default function AiGenerate({ onGenerate, isGenerating, error }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">Generate with Claude</h3>
          <p className="mt-1 text-sm text-slate-500">Or let Claude write the study guide from your notes.</p>
        </div>
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-wait disabled:opacity-70"
        >
          {isGenerating && <span className="h-4 w-4 animate-spin rounded-full border-2 border-indigo-300 border-t-white" />}
          {isGenerating ? 'Generating…' : 'Generate study guide'}
        </button>
      </div>

      {isGenerating && (
        <p className="mt-4 rounded-xl bg-indigo-50 p-4 text-sm text-indigo-900 ring-1 ring-indigo-200" role="status">
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
