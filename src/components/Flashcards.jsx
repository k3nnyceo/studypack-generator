import { useEffect, useMemo, useState } from 'react'
import { shuffled } from '../lib/flashcards.js'
import FilterChip from './FilterChip.jsx'

const KIND_FILTERS = [
  { value: 'all', label: 'All cards' },
  { value: 'definition', label: 'Definitions' },
  { value: 'example', label: 'Examples' },
]

const FACE_LABELS = {
  definition: { front: 'Term', back: 'Definition' },
  example: { front: 'Problem', back: 'Answer' },
}

// A card counts as reviewed once its back has been seen. `reviewed` is a Set of
// card ids owned by the parent, so progress survives switching tabs.
export default function Flashcards({ cards, modules, reviewed, onReview, onResetProgress }) {
  const [moduleFilter, setModuleFilter] = useState('all')
  const [kindFilter, setKindFilter] = useState('all')
  const [shuffledIds, setShuffledIds] = useState(null)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [direction, setDirection] = useState('next')

  const deck = useMemo(() => {
    const ordered = shuffledIds
      ? shuffledIds.map((id) => cards.find((c) => c.id === id))
      : cards
    return ordered.filter(
      (c) =>
        (moduleFilter === 'all' || c.moduleIndex === moduleFilter) &&
        (kindFilter === 'all' || c.kind === kindFilter),
    )
  }, [cards, shuffledIds, moduleFilter, kindFilter])

  const card = deck[index]
  const reviewedInDeck = deck.filter((c) => reviewed.has(c.id)).length
  const deckComplete = deck.length > 0 && reviewedInDeck === deck.length

  function restart() {
    setIndex(0)
    setFlipped(false)
    setDirection('next')
  }

  function changeModule(value) {
    setModuleFilter(value)
    restart()
  }

  function changeKind(value) {
    setKindFilter(value)
    restart()
  }

  function toggleShuffle() {
    setShuffledIds(shuffledIds ? null : shuffled(cards.map((c) => c.id)))
    restart()
  }

  function flip() {
    if (!card) return
    if (!flipped) onReview(card.id)
    setFlipped(!flipped)
  }

  function go(step) {
    const next = index + step
    if (next < 0 || next >= deck.length) return
    setDirection(step > 0 ? 'next' : 'prev')
    setIndex(next)
    setFlipped(false)
  }

  // Arrow keys move between cards; Space flips when nothing else has focus.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === ' ' && e.target === document.body) {
        e.preventDefault()
        flip()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (cards.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-8 text-center text-slate-500 ring-1 ring-slate-200">
        This study guide has no definitions or worked examples to make flashcards from.
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Filters */}
      <div className="space-y-3">
        <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <FilterChip active={moduleFilter === 'all'} onClick={() => changeModule('all')}>
            All modules
            <ChipCount reviewed={reviewed} cards={cards} />
          </FilterChip>
          {modules.map((title, m) => {
            const moduleCards = cards.filter((c) => c.moduleIndex === m)
            if (moduleCards.length === 0) return null
            return (
              <FilterChip key={m} active={moduleFilter === m} onClick={() => changeModule(m)} title={title}>
                <span className="max-w-48 truncate">{title}</span>
                <ChipCount reviewed={reviewed} cards={moduleCards} />
              </FilterChip>
            )
          })}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Card type">
            {KIND_FILTERS.map((f) => (
              <button
                key={f.value}
                role="radio"
                aria-checked={kindFilter === f.value}
                onClick={() => changeKind(f.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                  kindFilter === f.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            onClick={toggleShuffle}
            aria-pressed={Boolean(shuffledIds)}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium ring-1 transition active:scale-95 ${
              shuffledIds
                ? 'bg-indigo-600 text-white ring-indigo-600 shadow-sm'
                : 'bg-white text-slate-700 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            <ShuffleIcon />
            {shuffledIds ? 'Shuffled' : 'Shuffle'}
          </button>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="font-medium text-slate-700">
            {deck.length > 0 ? `Card ${index + 1} of ${deck.length}` : 'No cards'}
          </span>
          <span className="text-slate-500">
            <span className="font-semibold tabular-nums text-emerald-600">{reviewedInDeck}</span> / {deck.length} reviewed
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-slate-200"
          role="progressbar"
          aria-label="Cards reviewed"
          aria-valuemin={0}
          aria-valuemax={deck.length}
          aria-valuenow={reviewedInDeck}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-[width] duration-500 ease-out"
            style={{ width: `${deck.length ? (reviewedInDeck / deck.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Card */}
      {card ? (
        <div key={card.id} className={direction === 'next' ? 'animate-card-next' : 'animate-card-prev'}>
          <div className="perspective-distant">
            <button
              onClick={flip}
              className={`relative grid w-full cursor-pointer rounded-3xl text-left transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] transform-3d focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-300 motion-reduce:transition-none ${
                flipped ? 'rotate-y-180' : ''
              }`}
            >
              <CardFace
                label={FACE_LABELS[card.kind].front}
                moduleTitle={card.moduleTitle}
                text={card.front}
                emphasis={card.kind === 'definition'}
                hint="Tap to reveal"
                isReviewed={reviewed.has(card.id)}
                hidden={flipped}
                className="bg-white text-slate-900 ring-1 ring-slate-200"
              />
              <CardFace
                label={FACE_LABELS[card.kind].back}
                moduleTitle={card.moduleTitle}
                text={card.back}
                hint="Tap to flip back"
                hidden={!flipped}
                className="rotate-y-180 bg-gradient-to-br from-indigo-600 to-violet-600 text-white"
                dark
              />
            </button>
          </div>
        </div>
      ) : (
        <p className="rounded-3xl bg-white p-10 text-center text-slate-500 ring-1 ring-slate-200">
          No cards match these filters.
        </p>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-4">
        <NavButton onClick={() => go(-1)} disabled={index === 0} label="Previous card">
          <path d="M12.5 4.5 7 10l5.5 5.5" />
        </NavButton>
        <p className="hidden text-xs text-slate-400 sm:block">
          <Kbd>Space</Kbd> flip · <Kbd>←</Kbd> <Kbd>→</Kbd> navigate
        </p>
        <NavButton onClick={() => go(1)} disabled={index >= deck.length - 1} label="Next card">
          <path d="M7.5 4.5 13 10l-5.5 5.5" />
        </NavButton>
      </div>

      {deckComplete && (
        <div className="animate-card-next flex flex-col items-center gap-3 rounded-2xl bg-emerald-50 p-5 text-center ring-1 ring-emerald-200 sm:flex-row sm:justify-between sm:text-left">
          <p className="text-sm text-emerald-900">
            <span className="font-semibold">Nice work!</span> You’ve reviewed every card in this set.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!shuffledIds) setShuffledIds(shuffled(cards.map((c) => c.id)))
                else setShuffledIds(shuffled(shuffledIds))
                restart()
              }}
              className="rounded-lg bg-white px-3 py-1.5 text-sm font-medium text-emerald-800 ring-1 ring-emerald-300 transition hover:bg-emerald-100"
            >
              Shuffle &amp; go again
            </button>
            <button
              onClick={() => {
                onResetProgress()
                restart()
              }}
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-emerald-800 transition hover:bg-emerald-100"
            >
              Reset progress
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function CardFace({ label, moduleTitle, text, emphasis, hint, isReviewed, hidden, className, dark }) {
  return (
    <div
      aria-hidden={hidden}
      className={`col-start-1 row-start-1 flex min-h-72 flex-col rounded-3xl p-6 shadow-[0_10px_40px_-12px_rgba(15,23,42,0.25)] backface-hidden sm:min-h-80 sm:p-8 ${className}`}
    >
      <div className="flex items-start justify-between gap-4 text-xs font-semibold uppercase tracking-wide">
        <span
          className={`rounded-full px-2.5 py-1 ${dark ? 'bg-white/15 text-white' : 'bg-indigo-50 text-indigo-700'}`}
        >
          {label}
        </span>
        <span className={`truncate normal-case tracking-normal ${dark ? 'text-indigo-100' : 'text-slate-400'}`}>
          {moduleTitle}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center py-6">
        <p className={`whitespace-pre-line text-center leading-snug text-balance ${textSize(text, emphasis)}`}>
          {text}
        </p>
      </div>

      <div className={`flex items-center justify-between text-xs ${dark ? 'text-indigo-100' : 'text-slate-400'}`}>
        <span>{hint}</span>
        {isReviewed && (
          <span className="inline-flex items-center gap-1 font-medium text-emerald-600">
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
              <path d="M16.7 5.3a1 1 0 0 1 0 1.4l-8 8a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.4L8 12.6l7.3-7.3a1 1 0 0 1 1.4 0Z" />
            </svg>
            Reviewed
          </span>
        )}
      </div>
    </div>
  )
}

// Short terms read best large; long problems and answers need to stay legible.
function textSize(text, emphasis) {
  if (text.length < 40) return emphasis ? 'text-3xl font-bold sm:text-4xl' : 'text-2xl font-semibold'
  if (text.length < 140) return 'text-xl font-medium sm:text-2xl'
  if (text.length < 320) return 'text-lg'
  return 'text-base'
}

function ChipCount({ reviewed, cards }) {
  const done = cards.filter((c) => reviewed.has(c.id)).length
  return (
    <span className="text-xs tabular-nums opacity-60">
      {done}/{cards.length}
    </span>
  )
}

function NavButton({ onClick, disabled, label, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-indigo-600 active:scale-90 disabled:pointer-events-none disabled:opacity-40"
    >
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
        {children}
      </svg>
    </button>
  )
}

function Kbd({ children }) {
  return (
    <kbd className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-sans text-[11px] text-slate-500">
      {children}
    </kbd>
  )
}

function ShuffleIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 6h2.5c1.4 0 2.6.7 3.4 1.8l2.2 3.4c.8 1.1 2 1.8 3.4 1.8H17M14.5 10.5 17 13l-2.5 2.5M3 14h2.5c1 0 1.9-.4 2.6-1M17 7h-2.5c-1 0-1.9.4-2.6 1M14.5 4.5 17 7l-2.5 2.5" />
    </svg>
  )
}
