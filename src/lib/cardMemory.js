import { useCallback, useEffect, useState } from 'react'

// Flashcards that remember (a light Leitner system). After flipping a card the
// student says "Got it" or "Still learning". Got it moves the card up a box and
// pushes its next review further out; Still learning sends it back to the
// start, so it comes round again soon. Saved per pack on this device:
//   studypack.cards.v1 = { [pack fingerprint]: { [card id]: { box, due } } }

const KEY = 'studypack.cards.v1'
const DAY = 24 * 60 * 60 * 1000
// Days until the next review after each "Got it" in a row.
export const INTERVAL_DAYS = [1, 3, 7, 16, 35]

function readAll() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return data && typeof data === 'object' ? data : {}
  } catch {
    return {}
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data))
  } catch {
    // Storage full or blocked: memory just lasts for this visit.
  }
}

// 'new' (never marked), 'learning' (missed last time), 'due' (time to review
// again) or 'learned' (not due yet).
export function cardStatus(record, now = Date.now()) {
  if (!record) return 'new'
  if (record.box === 0) return 'learning'
  return record.due <= now ? 'due' : 'learned'
}

// Cards to study first: missed, then due, then new, then the rest by how soon
// they're due. Stable within each group, so the module order is kept.
const RANK = { learning: 0, due: 1, new: 2, learned: 3 }
export function studyOrder(cards, records, now = Date.now()) {
  return cards
    .map((card, i) => ({ card, i, status: cardStatus(records[card.id], now) }))
    .sort((a, b) => RANK[a.status] - RANK[b.status] || (a.status === 'learned' ? records[a.card.id].due - records[b.card.id].due : a.i - b.i))
    .map((x) => x.card)
}

export function nextRecord(record, knewIt, now = Date.now()) {
  if (!knewIt) return { box: 0, due: now }
  const box = Math.min((record?.box ?? 0) + 1, INTERVAL_DAYS.length)
  return { box, due: now + INTERVAL_DAYS[box - 1] * DAY }
}

// { records, mark(cardId, knewIt) } for one pack (by its fingerprint).
export function useCardMemory(packKey) {
  const [records, setRecords] = useState(() => (packKey ? (readAll()[packKey] ?? {}) : {}))
  const [loadedFor, setLoadedFor] = useState(packKey)
  // Another pack opened: load its memory (during render, not in an effect).
  if (loadedFor !== packKey) {
    setLoadedFor(packKey)
    setRecords(packKey ? (readAll()[packKey] ?? {}) : {})
  }

  const mark = useCallback(
    (cardId, knewIt) => {
      if (!packKey) return
      setRecords((prev) => {
        const next = { ...prev, [cardId]: nextRecord(prev[cardId], knewIt) }
        const all = readAll()
        all[packKey] = next
        writeAll(all)
        return next
      })
    },
    [packKey],
  )

  // Another tab studying the same pack.
  useEffect(() => {
    const onStorage = (e) => e.key === KEY && packKey && setRecords(readAll()[packKey] ?? {})
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [packKey])

  return { records, mark }
}
