import { useEffect, useMemo, useState } from 'react'
import { cardStatus, readCardMemory } from './cardMemory.js'
import { buildFlashcards } from './flashcards.js'

// Flashcards due today across the whole library: in every pack, the cards
// marked "Still learning" last time and the ones whose review date has come
// (src/lib/cardMemory.js). New cards don't count; they aren't a review.
// The Today screen lists them, and "Review" opens that pack's flashcards on
// its due cards only.

// [{ entry, due }] for the packs with cards due, most due first, and the total.
export function duePacks(entries, memory, now = Date.now()) {
  const packs = []
  for (const entry of entries) {
    const records = memory[entry.fingerprint]
    if (!records) continue
    // Only cards the pack still has (a regenerated pack has new cards).
    const due = buildFlashcards(entry.guide).filter((card) => {
      const status = cardStatus(records[card.id], now)
      return status === 'due' || status === 'learning'
    }).length
    if (due > 0) packs.push({ entry, due })
  }
  packs.sort((a, b) => b.due - a.due)
  return { packs, total: packs.reduce((n, p) => n + p.due, 0) }
}

// The same, kept up to date when cards are marked in another tab or the
// library changes. Re-read when the Today screen is shown (`refreshKey`).
export function useDueCards(entries, refreshKey) {
  const [memory, setMemory] = useState(readCardMemory)
  const [readFor, setReadFor] = useState(refreshKey)
  if (readFor !== refreshKey) {
    setReadFor(refreshKey)
    setMemory(readCardMemory())
  }
  useEffect(() => {
    const onStorage = (e) => e.key === 'studypack.cards.v1' && setMemory(readCardMemory())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
  return useMemo(() => duePacks(entries, memory), [entries, memory])
}
