import { ClipboardType, Loader2, ScanText, Sparkles, TriangleAlert, X } from 'lucide-react'
import { useState } from 'react'
import { formatResetTime } from '../lib/billing.js'
import { MAX_SCAN_PAGES } from '../lib/scanPages.js'
import { Button } from './ui.jsx'

// Shown under the upload box for the two Max inputs: a scanned or
// photographed file to read, or text to paste. `allowed` is whether the
// student's plan includes it (null while unknown or signed out).
export function ScanPanel({ scan, progress, error, allowed, signedIn, onRead, onCancel, onClose, onOpenPlans }) {
  const pages = Math.min(scan.pageCount, MAX_SCAN_PAGES)
  return (
    <Panel icon={ScanText} title={`${scan.kind === 'photos' ? 'Photos' : 'A scanned file'}: ${scan.fileName}`} onClose={progress ? null : onClose}>
      {progress ? (
        <div role="status" aria-live="polite">
          <p className="flex items-center gap-2 font-semibold text-stone-800">
            <Loader2 className="size-4 animate-spin text-brand-600" aria-hidden />
            Reading page {Math.min(progress.done + 1, progress.total)} of {progress.total}…
          </p>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-100">
            <div className="h-full rounded-full bg-brand-500 transition-[width] duration-500" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
          </div>
          <p className="mt-2 text-xs text-stone-500">Keep this page open. Each set of 5 pages takes about 15–30 seconds.</p>
          <Button size="sm" variant="ghost" icon={X} onClick={onCancel} className="mt-2 -ml-3">
            Cancel
          </Button>
        </div>
      ) : !signedIn ? (
        <p className="text-sm text-stone-600">
          {scan.kind === 'photos' ? 'These are photos' : 'Its pages are pictures, with no text to copy'}. StudyPack can read scanned and
          handwritten notes on the Max plan. Sign in to continue.
        </p>
      ) : allowed === false ? (
        <Upsell onOpenPlans={onOpenPlans}>
          {scan.kind === 'photos' ? 'Reading photos of notes' : 'This file is scanned, so its text can’t be copied. Reading scanned'} and
          handwritten notes is part of the Max plan.
        </Upsell>
      ) : (
        <>
          <p className="text-sm text-stone-600">
            {scan.kind === 'photos' ? `${scan.pageCount} photo${scan.pageCount === 1 ? '' : 's'}` : `${scan.pageCount} scanned pages`}.
            StudyPack will read {scan.pageCount > pages ? `the first ${pages} pages` : 'them'}, handwriting included, then you can
            generate your study pack.
            {scan.pageCount > pages && ` For the rest, split the file and read it in parts.`}
          </p>
          <Button variant="primary" icon={ScanText} onClick={onRead} disabled={allowed === null} className="mt-4">
            Read {pages} page{pages === 1 ? '' : 's'}
          </Button>
        </>
      )}
      {error && <ErrorNote error={error} onOpenPlans={onOpenPlans} />}
    </Panel>
  )
}

export function PastePanel({ allowed, signedIn, onSubmit, onClose, onOpenPlans }) {
  const [text, setText] = useState('')
  const words = text.trim().split(/\s+/).filter(Boolean).length
  return (
    <Panel icon={ClipboardType} title="Paste your notes" onClose={onClose}>
      {!signedIn ? (
        <p className="text-sm text-stone-600">Pasting notes is part of the Max plan. Sign in to continue.</p>
      ) : allowed === false ? (
        <Upsell onOpenPlans={onOpenPlans}>Pasting notes from anywhere (a website, a document, a message) is part of the Max plan.</Upsell>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onSubmit(text)
          }}
        >
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder="Paste lecture notes, a handout or an article here…"
            aria-label="Notes to turn into a study pack"
            className="w-full rounded-xl border border-stone-300 bg-white p-3 text-sm leading-relaxed focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-stone-500 tabular-nums">{words} words</span>
            <Button type="submit" variant="primary" disabled={words < 30 || allowed === null}>
              Continue
            </Button>
          </div>
          {words > 0 && words < 30 && <p className="mt-2 text-xs text-stone-500">Paste at least 30 words.</p>}
        </form>
      )}
    </Panel>
  )
}

function Panel({ icon: Icon, title, onClose, children }) {
  return (
    <section className="animate-page-in card mt-5 p-5 text-left" aria-label={title}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <h2 className="flex min-w-0 items-center gap-2 font-semibold text-stone-900">
          <Icon className="size-5 shrink-0 text-brand-600" strokeWidth={2.25} aria-hidden />
          <span className="truncate">{title}</span>
        </h2>
        {onClose && (
          <button type="button" onClick={onClose} aria-label="Close" className="-m-1 rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700">
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

function Upsell({ onOpenPlans, children }) {
  return (
    <div>
      <p className="text-sm text-stone-600">{children}</p>
      <Button size="sm" variant="primary" icon={Sparkles} onClick={onOpenPlans} className="mt-3">
        See Max
      </Button>
    </div>
  )
}

function ErrorNote({ error, onOpenPlans }) {
  return (
    <div className="mt-4 flex gap-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200" role="alert">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
      <div>
        <p>
          {error.message}
          {error.resetsAt && ` It refills at ${formatResetTime(error.resetsAt)}.`}
        </p>
        {error.reason === 'plan' && (
          <Button size="sm" variant="primary" icon={Sparkles} onClick={onOpenPlans} className="mt-2">
            See Max
          </Button>
        )}
      </div>
    </div>
  )
}
