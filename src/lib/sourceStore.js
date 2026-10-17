// The lecture each pack was made from, kept on this device in IndexedDB so the
// source viewer still works when the pack is opened again from the library.
// Keyed by the pack's fingerprint (src/lib/library.js). Nothing here is synced
// or uploaded.
//
// A record is { key, fileName, type, sections, file?, photos?, savedAt, bytes }.
// Every pack keeps its extracted text. Files are kept up to the upload limit
// (100 MB); when they add up to more than MAX_TOTAL_BYTES, the least recently
// opened packs give theirs up first (their text stays, so the viewer still
// works in its Text view).

const DB_NAME = 'studypack-sources'
const STORE = 'sources'
const MAX_ENTRIES = 300
const MAX_FILE_BYTES = 100 * 1024 * 1024
const MAX_TOTAL_BYTES = 600 * 1024 * 1024

let dbPromise = null
function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'key' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  }).catch((err) => {
    dbPromise = null
    throw err
  })
  return dbPromise
}

function run(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const result = fn(tx.objectStore(STORE))
        tx.oncomplete = () => resolve(result?.result ?? result)
        tx.onerror = tx.onabort = () => reject(tx.error)
      }),
  )
}

// The viewer's source for a notes result, or null if there's nothing to show.
export function sourceFromResult(result) {
  if (!result?.sections?.length) return null
  return {
    fileName: result.fileName,
    type: result.type,
    scanned: Boolean(result.scanned),
    sections: result.sections,
    file: result.file ?? null,
    photos: result.photos ?? null,
  }
}

// Best effort: a full or blocked store just means no viewer for old packs.
export async function saveSource(key, source) {
  if (!key || !source || typeof indexedDB === 'undefined') return
  const bytes = (source.file?.size ?? 0) + (source.photos ?? []).reduce((n, f) => n + f.size, 0)
  const keepFiles = bytes <= MAX_FILE_BYTES
  const record = {
    key,
    fileName: source.fileName,
    type: source.type,
    scanned: source.scanned,
    sections: source.sections,
    file: keepFiles ? source.file : null,
    photos: keepFiles ? source.photos : null,
    savedAt: Date.now(),
    bytes: keepFiles ? bytes : 0,
  }
  // Ask the browser not to clear these when space runs low (it may say no).
  navigator.storage?.persist?.().catch(() => {})
  try {
    await run('readwrite', (store) => store.put(record))
    await prune()
  } catch {
    if (keepFiles && bytes > 0) {
      // Probably out of space: keep the text at least.
      await run('readwrite', (store) => store.put({ ...record, file: null, photos: null, bytes: 0 })).catch(() => {})
    }
  }
}

export async function loadSource(key) {
  if (!key || typeof indexedDB === 'undefined') return null
  try {
    const record = await run('readonly', (store) => store.get(key))
    if (!record) return null
    // Mark it as recently used, so pruning keeps it.
    run('readwrite', (store) => store.put({ ...record, savedAt: Date.now() })).catch(() => {})
    return record
  } catch {
    return null
  }
}

export function deleteSource(key) {
  if (!key || typeof indexedDB === 'undefined') return Promise.resolve()
  return run('readwrite', (store) => store.delete(key)).catch(() => {})
}

// Deletes a pack's source and hands it back, so Undo can put it back.
export async function takeSource(key) {
  const record = await loadSource(key)
  await deleteSource(key)
  return record
}

export function restoreSource(record) {
  if (!record?.key || typeof indexedDB === 'undefined') return Promise.resolve()
  return run('readwrite', (store) => store.put(record)).catch(() => {})
}

// Newest first: past MAX_ENTRIES a record goes entirely; past
// MAX_TOTAL_BYTES of files, older records keep only their text.
async function prune() {
  const all = (await run('readonly', (store) => store.getAll())).sort((a, b) => b.savedAt - a.savedAt)
  const drop = all.slice(MAX_ENTRIES)
  const trim = []
  let total = 0
  for (const record of all.slice(0, MAX_ENTRIES)) {
    total += record.bytes ?? 0
    if (total > MAX_TOTAL_BYTES && record.bytes) trim.push({ ...record, file: null, photos: null, bytes: 0 })
  }
  if (!drop.length && !trim.length) return
  await run('readwrite', (store) => {
    drop.forEach((r) => store.delete(r.key))
    trim.forEach((r) => store.put(r))
  })
}
