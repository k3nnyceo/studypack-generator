// Syncing the library with the signed-in account (/api/library,
// server/library.js), so the same packs are on every device.
//
// This device's library stays the working copy; the account is where packs
// meet. A sync:
//   1. retries deletes that didn't reach the server,
//   2. lists the account's packs (summaries only, no guides),
//   3. drops local packs marked `synced` that the account no longer has
//      (deleted on another device),
//   4. matches local packs that were never synced against the account by
//      content, so the same pack on two devices isn't stored twice,
//   5. uploads the rest, and downloads only the packs this device lacks.
import { describe } from './library.js'
import { validateStudyGuide } from './studyGuideFormat.js'

const DELETED_KEY = 'studypack.library.deleted.v1'
const DOWNLOAD_CONCURRENCY = 3

export class SyncError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function api(method, { id, body } = {}) {
  let res
  try {
    res = await fetch(`/api/library${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw new SyncError('Couldn’t reach StarterPack to sync your library.', 0)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) throw new SyncError(data?.error || `Library sync failed (${res.status}).`, res.status)
  return data
}

// Saves one pack to the account. Resolves to its summary.
export async function uploadPack({ id, sourceName, savedAt, guide }) {
  return (await api('PUT', { body: { entry: { id, sourceName, savedAt, guide } } })).entry
}

// Deletes a pack from the account. Remembered until it succeeds, so a delete
// made offline isn't undone by the next sync.
export async function deletePack(id) {
  rememberDeleted(id, true)
  await api('DELETE', { id })
  rememberDeleted(id, false)
}

export function forgetDelete(id) {
  rememberDeleted(id, false)
}

export function clearPendingDeletes() {
  writeDeleted([])
}

// Runs a sync. `getEntries()` returns the current local list and `apply(fn)`
// commits fn(current list), returning an error message or null: the list can
// change while requests are in flight (the student adds or deletes a pack),
// so changes are applied to the latest list, never to a copy taken earlier.
// Resolves to an error message for anything that couldn't be saved locally,
// or null. Throws SyncError if the server can't be reached.
export async function syncLibrary({ getEntries, apply }) {
  for (const id of readDeleted()) await deletePack(id)

  const remote = (await api('GET')).entries
  const remoteById = new Map(remote.map((e) => [e.id, e]))
  const remoteByPrint = new Map(remote.map((e) => [e.fingerprint, e]))

  // Steps 3 and 4, as one change to the local list.
  const toUpload = []
  let localError = apply((entries) =>
    entries.flatMap((entry) => {
      if (remoteById.has(entry.id)) return [{ ...entry, synced: true }]
      if (entry.synced) return [] // deleted on another device
      const twin = remoteByPrint.get(entry.fingerprint)
      if (twin) return [{ ...entry, id: twin.id, savedAt: twin.savedAt, sourceName: twin.sourceName, synced: true }]
      toUpload.push(entry)
      return [entry]
    }),
  )

  // Step 5: download what's missing, a few at a time.
  const missing = remote.filter((r) => !getEntries().some((e) => e.id === r.id))
  const queue = [...missing]
  const worker = async () => {
    for (let summary = queue.shift(); summary; summary = queue.shift()) {
      const { entry } = await api('GET', { id: summary.id }).catch((err) => {
        if (err.status === 404) return {} // deleted meanwhile
        throw err
      })
      const result = validateStudyGuide(entry?.guide)
      if (!result.ok) continue
      const pack = { ...describe(result.guide, { id: entry.id, sourceName: entry.sourceName, savedAt: entry.savedAt }), synced: true }
      localError =
        apply((entries) =>
          entries.some((e) => e.id === pack.id || e.fingerprint === pack.fingerprint)
            ? entries
            : [...entries, pack].sort((a, b) => b.savedAt - a.savedAt),
        ) ?? localError
    }
  }
  await Promise.all(Array.from({ length: DOWNLOAD_CONCURRENCY }, worker))

  for (const entry of toUpload) {
    if (!getEntries().some((e) => e.id === entry.id)) continue // deleted meanwhile
    try {
      await uploadPack(entry)
    } catch (err) {
      if (err.status === 400 || err.status === 413 || err.status === 409) {
        localError = err.message // this pack can't be synced; keep it on the device
        continue
      }
      throw err
    }
    localError = apply((entries) => entries.map((e) => (e.id === entry.id ? { ...e, synced: true } : e))) ?? localError
  }
  return localError
}

function readDeleted() {
  try {
    const ids = JSON.parse(localStorage.getItem(DELETED_KEY) ?? '[]')
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []
  } catch {
    return []
  }
}

function writeDeleted(ids) {
  try {
    localStorage.setItem(DELETED_KEY, JSON.stringify(ids))
  } catch {
    // storage blocked: the delete is just not retried
  }
}

function rememberDeleted(id, pending) {
  const ids = readDeleted().filter((x) => x !== id)
  writeDeleted(pending ? [...ids, id] : ids)
}
