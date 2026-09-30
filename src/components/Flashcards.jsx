import { Check, ChevronLeft, ChevronRight, PartyPopper, RotateCcw, Shuffle } from 'lucide-react'
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
      <p className="rounded-2xl bg-white p-8 text-center text-stone-500 ring-1 ring-stone-200">
        This study guide has no definitions or worked examples to make flashcards from.
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Filters */}
      <div className="card space-y-4 overflow-hidden p-4 sm:p-5">
        <div className="-mr-4 flex gap-2 overflow-x-auto pr-10 pb-1 [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_calc(100%-3rem),transparent)] sm:-mr-5">
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
          <div className="inline-flex rounded-xl bg-stone-100 p-1" role="radiogroup" aria-label="Card type">
            {KIND_FILTERS.map((f) => (
              <button
                key={f.value}
                role="radio"
                aria-checked={kindFilter === f.value}
                onClick={() => changeKind(f.value)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                  kindFilter === f.value ? 'bg-white text-stone-900 shadow-card' : 'text-stone-600 hover:text-stone-900'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            onClick={toggleShuffle}
            aria-pressed={Boolean(shuffledIds)}
            className={`inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-sm font-semibold ring-1 transition active:scale-95 ${
              shuffledIds
                ? 'bg-brand-600 text-white shadow-brand ring-brand-600'
                : 'bg-white text-stone-700 ring-stone-200 hover:bg-stone-50'
            }`}
          >
            <Shuffle className="size-4" strokeWidth={2.25} aria-hidden />
            {shuffledIds ? 'Shuffled' : 'Shuffle'}
          </button>
        </div>
      </div>

      {/* Progress */}
      <div>
        <div className="mb-2 flex items-baseline justify-between text-sm">
          <span className="font-semibold text-stone-800">
            {deck.length > 0 ? `Card ${index + 1} of ${deck.length}` : 'No cards'}
          </span>
          <span className="text-stone-500">
            <span className="font-bold text-brand-700 tabular-nums">{reviewedInDeck}</span> / {deck.length} reviewed
          </span>
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-stone-200/80"
          role="progressbar"
          aria-label="Cards reviewed"
          aria-valuemin={0}
          aria-valuemax={deck.length}
          aria-valuenow={reviewedInDeck}
        >
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-400 to-brand-600 transition-[width] duration-500 ease-out"
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
              className={`relative grid w-full cursor-pointer rounded-3xl text-left transition-transform duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] transform-3d focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-300 motion-reduce:transition-none ${
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
                className="bg-white text-stone-900 ring-1 ring-stone-200/80"
              />
              <CardFace
                label={FACE_LABELS[card.kind].back}
                moduleTitle={card.moduleTitle}
                text={card.back}
                hint="Tap to flip back"
                hidden={!flipped}
                className="rotate-y-180 bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900 text-white"
                dark
              />
            </button>
          </div>
        </div>
      ) : (
        <p className="card p-10 text-center text-stone-500">
          No cards match these filters.
        </p>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between gap-4">
        <NavButton onClick={() => go(-1)} disabled={index === 0} label="Previous card" icon={ChevronLeft} />
        <p className="hidden text-xs text-stone-500 sm:block">
          <Kbd>Space</Kbd> flip · <Kbd>←</Kbd> <Kbd>→</Kbd> navigate
        </p>
        <NavButton onClick={() => go(1)} disabled={index >= deck.length - 1} label="Next card" icon={ChevronRight} />
      </div>

      {deckComplete && (
        <div className="animate-card-next flex flex-col items-center gap-4 rounded-2xl bg-brand-50 p-5 text-center ring-1 ring-brand-200 sm:flex-row sm:justify-between sm:text-left">
          <p className="flex items-center gap-3 text-sm text-brand-950">
            <PartyPopper className="size-5 shrink-0 text-brand-600" aria-hidden />
            <span>
              <span className="font-semibold">Nice work!</span> You’ve reviewed every card in this set.
            </span>
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                if (!shuffledIds) setShuffledIds(shuffled(cards.map((c) => c.id)))
                else setShuffledIds(shuffled(shuffledIds))
                restart()
              }}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-sm font-semibold text-brand-800 shadow-card ring-1 ring-brand-200 transition hover:bg-brand-100"
            >
              <Shuffle className="size-4" aria-hidden />
              Shuffle &amp; go again
            </button>
            <button
              onClick={() => {
                onResetProgress()
                restart()
              }}
              className="inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand-800 transition hover:bg-brand-100"
            >
              <RotateCcw className="size-4" aria-hidden />
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
      className={`col-start-1 row-start-1 flex min-h-72 flex-col rounded-3xl p-6 shadow-elevated backface-hidden sm:min-h-80 sm:p-8 ${className}`}
    >
      <div className="flex items-start justify-between gap-4 text-xs font-semibold tracking-[0.06em] uppercase">
        <span
          className={`rounded-full px-2.5 py-1 ${dark ? 'bg-white/15 text-white' : 'bg-brand-50 text-brand-700'}`}
        >
          {label}
        </span>
        <span className={`truncate normal-case tracking-normal ${dark ? 'text-brand-100' : 'text-stone-500'}`}>
          {moduleTitle}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center py-6">
        <p className={`whitespace-pre-line text-center leading-snug text-balance ${textSize(text, emphasis)}`}>
          {text}
        </p>
      </div>

      <div className={`flex items-center justify-between text-xs ${dark ? 'text-brand-100' : 'text-stone-500'}`}>
        <span>{hint}</span>
        {isReviewed && (
          <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 font-semibold text-brand-700">
            <Check className="size-3.5" strokeWidth={3} aria-hidden />
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
    <span className="text-xs font-medium text-stone-500 tabular-nums group-aria-pressed:text-stone-300">
      {done}/{cards.length}
    </span>
  )
}

function NavButton({ onClick, disabled, label, icon: Icon }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="flex size-12 items-center justify-center rounded-full bg-white text-stone-700 shadow-card ring-1 ring-stone-200 transition hover:text-brand-600 hover:shadow-card-hover active:scale-90 disabled:pointer-events-none disabled:opacity-40"
    >
      <Icon className="size-5" strokeWidth={2.25} aria-hidden />
    </button>
  )
}

function Kbd({ children }) {
  return (
    <kbd className="rounded-md border border-stone-200 bg-white px-1.5 py-0.5 font-sans text-[11px] font-semibold text-stone-600 shadow-[0_1px_0_rgb(214_211_209)]">
      {children}
    </kbd>
  )
}
