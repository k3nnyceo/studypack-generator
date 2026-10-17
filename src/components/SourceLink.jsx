import { BookOpenText } from 'lucide-react'
import { useContext } from 'react'
import { SourceContext } from '../lib/sourceContext.js'
import { parseSourceRange, refLabel } from '../lib/sourceRefs.js'

// Opens the source viewer at the slides or pages something came from, with
// them highlighted. Hidden when this device doesn't have the lecture, or the
// item doesn't say where it came from (packs made before sourcePages existed).
//
// - `chip`: a module's sourceRange ("Slides 4–9") as a clickable chip.
// - otherwise: a "View in source" link for an item's own sourcePages.
export default function SourceLink({ sourcePages, sourceRange, chip = false, className = '' }) {
  const { source, open } = useContext(SourceContext)
  if (!source) return null
  const refs = chip ? parseSourceRange(sourceRange, source.sections) : (sourcePages ?? [])
  if (!refs.length) return null
  const label = refLabel(refs, source)
  const onClick = (e) => {
    e.stopPropagation()
    open(refs)
  }

  if (chip) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={`Show ${label} of ${source.fileName}`}
        aria-label={`${sourceRange || label}: show in the source`}
        className={`inline-flex h-7 max-w-full shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-50 active:scale-95 ${className}`}
      >
        <BookOpenText className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
        <span className="truncate">{sourceRange || label}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      title={`Show ${label} of ${source.fileName}`}
      aria-label={`View in source: ${label}`}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md text-xs font-semibold text-brand-700 underline-offset-2 transition hover:underline ${className}`}
    >
      <BookOpenText className="size-3.5 shrink-0" strokeWidth={2.25} aria-hidden />
      <span className="truncate">
        View in source <span className="font-medium text-stone-500">· {label}</span>
      </span>
    </button>
  )
}
