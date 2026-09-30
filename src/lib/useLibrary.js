import { useEffect, useRef, useState } from 'react'
import { addToLibrary, readLibrary, STORAGE_KEY, writeLibrary } from './library.js'

// The saved study pack library as React state, persisted to localStorage and
// kept in sync when another tab changes it.
export function useLibrary() {
  const [entries, setEntries] = useState(() => readLibrary())
  // Actions read the latest list from here, because callbacks such as a toast's
  // "Undo" can run after later changes and would otherwise see stale state.
  const latest = useRef(entries)

  useEffect(() => {
    function onStorage(e) {
      if (e.key !== STORAGE_KEY) return
      latest.current = readLibrary()
      setEntries(latest.current)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  // Saves first, and only updates state if the browser accepted the write, so
  // the list on screen never claims a pack is saved when it isn't.
  function commit(next) {
    const error = writeLibrary(next)
    if (!error) {
      latest.current = next
      setEntries(next)
    }
    return error
  }

  function add(guide, sourceName) {
    const result = addToLibrary(latest.current, guide, sourceName)
    if (result.duplicate) return { entry: result.entry, duplicate: true, error: null }
    const error = commit(result.entries)
    return { entry: error ? null : result.entry, duplicate: false, error }
  }

  // Returns what's needed to undo the removal.
  function remove(id) {
    const current = latest.current
    const index = current.findIndex((e) => e.id === id)
    if (index < 0) return null
    const error = commit(current.filter((e) => e.id !== id))
    return error ? { error } : { entry: current[index], index, error: null }
  }

  function restore(entry, index) {
    const current = latest.current
    if (current.some((e) => e.id === entry.id)) return null
    const next = [...current]
    next.splice(Math.min(index, next.length), 0, entry)
    return commit(next)
  }

  return { entries, add, remove, restore }
}
