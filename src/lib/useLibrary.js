import { useEffect, useRef, useState } from 'react'
import { addToLibrary, readLibrary, STORAGE_KEY, writeLibrary } from './library.js'
import { clearPendingDeletes, deletePack, forgetDelete, syncLibrary, uploadPack } from './librarySync.js'

// Resync when the app comes back to the foreground, at most this often.
const RESYNC_AFTER_MS = 60_000

// The saved study pack library as React state, persisted to localStorage and
// kept in sync when another tab changes it. With a signed-in `user`, it's also
// synced with their account (see librarySync.js).
//
// `sync` is { state: 'off' | 'syncing' | 'synced' | 'error', error }.
export function useLibrary(user, { onSessionExpired } = {}) {
  const [entries, setEntries] = useState(() => readLibrary())
  // Actions read the latest list from here, because callbacks such as a toast's
  // "Undo" can run after later changes and would otherwise see stale state.
  const latest = useRef(entries)
  const [sync, setSync] = useState({ state: 'off', error: '' })
  const userId = useRef(null)
  userId.current = user?.id ?? null
  const expired = useRef(onSessionExpired)
  expired.current = onSessionExpired
  const syncing = useRef(false)
  const lastSync = useRef(0)
  // Deletes still on their way to the server, so an Undo waits for them
  // before re-uploading (otherwise the late delete would win).
  const deleting = useRef(new Map())

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

  const apply = (fn) => commit(fn(latest.current))
  const markSynced = (id) => apply((list) => list.map((e) => (e.id === id ? { ...e, synced: true } : e)))

  function syncFailed(err) {
    if (err.status === 401) expired.current?.()
    setSync({ state: 'error', error: err.message })
  }

  async function runSync() {
    if (!userId.current || syncing.current) return
    syncing.current = true
    setSync((s) => ({ state: 'syncing', error: s.error }))
    try {
      const error = await syncLibrary({ getEntries: () => latest.current, apply })
      setSync({ state: error ? 'error' : 'synced', error: error ?? '' })
    } catch (err) {
      syncFailed(err)
    } finally {
      syncing.current = false
      lastSync.current = Date.now()
    }
  }

  // Sync on sign-in, and again whenever the app comes back to the foreground.
  useEffect(() => {
    if (!user?.id) {
      setSync({ state: 'off', error: '' })
      return
    }
    runSync()
    function onVisible() {
      if (document.visibilityState === 'visible' && Date.now() - lastSync.current > RESYNC_AFTER_MS) runSync()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // runSync reads everything through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  function upload(entry) {
    if (!userId.current) return
    uploadPack(entry)
      .then(() => markSynced(entry.id))
      .catch((err) => {
        // It stays unsynced on this device; the next sync uploads it.
        if (err.status === 401) expired.current?.()
      })
  }

  function add(guide, sourceName) {
    const result = addToLibrary(latest.current, guide, sourceName)
    if (result.duplicate) return { entry: result.entry, duplicate: true, error: null }
    const error = commit(result.entries)
    if (!error) upload(result.entry)
    return { entry: error ? null : result.entry, duplicate: false, error }
  }

  // Returns what's needed to undo the removal.
  function remove(id) {
    const current = latest.current
    const index = current.findIndex((e) => e.id === id)
    if (index < 0) return null
    const error = commit(current.filter((e) => e.id !== id))
    if (error) return { error }
    const entry = current[index]
    // Also when signed out: it's remembered and sent once signed back in.
    if (entry.synced) {
      const request = deletePack(id).catch(() => {})
      deleting.current.set(id, request)
      request.finally(() => deleting.current.delete(id))
    }
    return { entry, index, error: null }
  }

  function restore(entry, index) {
    const current = latest.current
    if (current.some((e) => e.id === entry.id)) return null
    forgetDelete(entry.id)
    const { synced: _synced, ...unsynced } = entry
    const next = [...current]
    next.splice(Math.min(index, next.length), 0, unsynced)
    const error = commit(next)
    if (!error) Promise.resolve(deleting.current.get(entry.id)).then(() => upload(unsynced))
    return error
  }

  // On sign-out, the account's packs leave this device (they're safe in the
  // account); packs that were never synced stay.
  function forgetAccount() {
    clearPendingDeletes()
    apply((list) => list.filter((e) => !e.synced))
  }

  return { entries, add, remove, restore, sync, syncNow: runSync, forgetAccount }
}
