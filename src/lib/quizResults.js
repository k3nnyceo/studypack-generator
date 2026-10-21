import { useCallback, useEffect, useState } from 'react'

// Quiz and exam answers, kept across visits so Progress can find weak topics
// (src/lib/insights.js). Per question, its latest answer and how often it
// was answered and missed. Saved per pack on this device:
//   studypack.results.v1 = { [pack fingerprint]: { [question id]: { tries, missed, last, at } } }
// `last` is true if the latest answer was right.

const KEY = 'studypack.results.v1'

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
    // Storage full or blocked: results just last for this visit.
  }
}

export function nextResult(previous, correct, now = Date.now()) {
  return {
    tries: (previous?.tries ?? 0) + 1,
    missed: (previous?.missed ?? 0) + (correct ? 0 : 1),
    last: Boolean(correct),
    at: now,
  }
}

// { results, record([{ id, correct }]) } for one pack (by its fingerprint).
export function useQuizResults(packKey) {
  const [results, setResults] = useState(() => (packKey ? (readAll()[packKey] ?? {}) : {}))
  const [loadedFor, setLoadedFor] = useState(packKey)
  // Another pack opened: load its results (during render, not in an effect).
  if (loadedFor !== packKey) {
    setLoadedFor(packKey)
    setResults(packKey ? (readAll()[packKey] ?? {}) : {})
  }

  const record = useCallback(
    (answers) => {
      if (!packKey || !answers.length) return
      setResults((prev) => {
        const next = { ...prev }
        for (const { id, correct } of answers) next[id] = nextResult(next[id], correct)
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
    const onStorage = (e) => e.key === KEY && packKey && setResults(readAll()[packKey] ?? {})
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [packKey])

  return { results, record }
}
