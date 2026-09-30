// The study pack library: every loaded guide, saved in the browser's
// localStorage so it survives refreshes. No backend involved.
//
// Stored as one JSON array under STORAGE_KEY:
//   [{ id, title, course, topic, sourceName, savedAt, fingerprint, guide }]
// Newest first. `guide` is the validated study guide itself.
import { validateStudyGuide } from './studyGuideFormat.js'

export const STORAGE_KEY = 'studypack.library.v1'
export const UNCATEGORIZED = 'Uncategorized'

function defaultStorage() {
  try {
    return window.localStorage
  } catch {
    return null // blocked, e.g. by privacy settings
  }
}

// Reads the library, dropping anything that no longer passes validation
// (hand-edited or corrupted storage) rather than failing the whole app.
export function readLibrary(storage = defaultStorage()) {
  let raw
  try {
    raw = storage?.getItem(STORAGE_KEY)
  } catch {
    return []
  }
  if (!raw) return []

  let items
  try {
    items = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(items)) return []

  return items.flatMap((item) => {
    const result = validateStudyGuide(item?.guide)
    if (!result.ok || typeof item.id !== 'string') return []
    return [describe(result.guide, { id: item.id, sourceName: item.sourceName, savedAt: item.savedAt })]
  })
}

// Returns an error message if the browser refused to save, otherwise null.
export function writeLibrary(entries, storage = defaultStorage()) {
  if (!storage) return 'This browser is blocking storage, so packs can’t be saved.'
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(entries))
    return null
  } catch (err) {
    return err?.name === 'QuotaExceededError'
      ? 'Your library is full. Delete a few packs to make room.'
      : 'This browser couldn’t save to your library.'
  }
}

// Builds a library entry for a guide. Course falls back to "Uncategorized"
// and topic to the guide's title.
export function describe(guide, { id = newId(), sourceName = '', savedAt = Date.now() } = {}) {
  return {
    id,
    title: guide.title,
    course: guide.course?.trim() || UNCATEGORIZED,
    topic: guide.topic?.trim() || guide.title,
    sourceName: typeof sourceName === 'string' ? sourceName : '',
    savedAt: Number.isFinite(savedAt) ? savedAt : Date.now(),
    fingerprint: fingerprint(guide),
    guide,
  }
}

// Adds a guide to the front of the library. Loading the exact same pack again
// returns the existing entry instead of saving a duplicate; a pack with the
// same title but different content is saved as its own entry.
export function addToLibrary(entries, guide, sourceName) {
  const print = fingerprint(guide)
  const existing = entries.find((e) => e.fingerprint === print)
  if (existing) return { entries, entry: existing, duplicate: true }

  const entry = describe(guide, { sourceName })
  return { entries: [entry, ...entries], entry, duplicate: false }
}

// Groups entries by course, courses A–Z with "Uncategorized" last; newest
// pack first within each course.
export function groupByCourse(entries) {
  const groups = new Map()
  for (const entry of entries) {
    if (!groups.has(entry.course)) groups.set(entry.course, [])
    groups.get(entry.course).push(entry)
  }
  return [...groups.entries()]
    .map(([course, items]) => ({ course, items: [...items].sort((a, b) => b.savedAt - a.savedAt) }))
    .sort((a, b) => {
      if (a.course === UNCATEGORIZED) return 1
      if (b.course === UNCATEGORIZED) return -1
      return a.course.localeCompare(b.course, undefined, { sensitivity: 'base', numeric: true })
    })
}

// FNV-1a over the guide's JSON. Guides are normalised by the validator, so
// the same pack always serialises the same way.
function fingerprint(guide) {
  const text = JSON.stringify(guide)
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36) + text.length.toString(36)
}

function newId() {
  return globalThis.crypto?.randomUUID?.() ?? `pack-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
