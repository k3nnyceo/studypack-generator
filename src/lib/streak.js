import { useCallback, useState } from 'react'

// The daily study streak: consecutive days (Lagos time) with any studying,
// such as marking a flashcard, answering a quiz question, finishing an exam or
// checking a theory answer. Saved on this device:
//   studypack.streak.v1 = { last: 'YYYY-MM-DD', count, best }

const KEY = 'studypack.streak.v1'
const LAGOS_OFFSET_MS = 60 * 60 * 1000

export const lagosDay = (t = Date.now()) => new Date(t + LAGOS_OFFSET_MS).toISOString().slice(0, 10)
const dayBefore = (day) => lagosDay(Date.parse(`${day}T12:00:00Z`) - 24 * 60 * 60 * 1000 - LAGOS_OFFSET_MS)

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    return s && typeof s.count === 'number' ? s : { last: null, count: 0, best: 0 }
  } catch {
    return { last: null, count: 0, best: 0 }
  }
}

// The streak as it stands today: it's broken if the last study day was
// before yesterday.
export function currentStreak(s, today = lagosDay()) {
  const alive = s.last === today || s.last === dayBefore(today)
  return { count: alive ? s.count : 0, best: s.best, studiedToday: s.last === today }
}

export function afterStudying(s, today = lagosDay()) {
  if (s.last === today) return s
  const count = s.last === dayBefore(today) ? s.count + 1 : 1
  return { last: today, count, best: Math.max(s.best, count) }
}

// { count, best, studiedToday, studied() }
export function useStreak() {
  const [state, setState] = useState(read)
  const studied = useCallback(() => {
    setState((prev) => {
      const next = afterStudying(prev)
      if (next !== prev) {
        try {
          localStorage.setItem(KEY, JSON.stringify(next))
        } catch {
          // storage blocked: the streak lasts for this visit
        }
      }
      return next
    })
  }, [])
  return { ...currentStreak(state), studied }
}
