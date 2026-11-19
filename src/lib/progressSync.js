import { useEffect } from 'react'
import { readFocus } from './focus.js'
import { mergePlan, mergeRecords, mergeStreak, totalCounters } from './progressMerge.js'

// Study progress follows a signed-in student across devices: XP, focus
// minutes and sessions, the streak, exam dates and today's ticks, flashcard
// memory and quiz answers. Each device uploads what it has to
// /api/library?progress=1 (server/library.js), which merges it into the
// account's copy (src/lib/progressMerge.js), and takes back the result.
//
// XP, sessions and minutes are counted per device. The focus numbers on screen
// are this device's own plus every other device's, so this device remembers
// how much of them came from elsewhere:
//   studypack.device.v1 = this device's id
//   studypack.sync.v1   = { userId, others: { xp, sessions, days } }

const DEVICE_KEY = 'studypack.device.v1'
const SYNC_KEY = 'studypack.sync.v1'
// Where each part of progress is saved on the device (src/lib/focus.js,
// streak.js, examPlan.js, cardMemory.js and quizResults.js).
export const KEYS = {
  focus: 'studypack.focus.v1',
  streak: 'studypack.streak.v1',
  plan: 'studypack.plan.v1',
  cards: 'studypack.cards.v1',
  results: 'studypack.results.v1',
}
// While the app is open, sync this often.
const SYNC_EVERY_MS = 2 * 60 * 1000
// Browsers refuse a keepalive request (the one sent as the app is hidden)
// with a larger body.
const KEEPALIVE_MAX_BYTES = 60 * 1024

function readJson(storage, key, fallback) {
  try {
    const value = JSON.parse(storage.getItem(key) ?? 'null')
    return value && typeof value === 'object' ? value : fallback
  } catch {
    return fallback
  }
}

function writeJson(storage, key, value) {
  try {
    storage.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

export function deviceId(storage) {
  try {
    let id = storage.getItem(DEVICE_KEY)
    if (!/^[\w-]{8,64}$/.test(id ?? '')) {
      id = globalThis.crypto?.randomUUID?.() ?? `d-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
      storage.setItem(DEVICE_KEY, id)
    }
    return id
  } catch {
    return null
  }
}

const counters = (focus) => ({ xp: focus.xp ?? 0, sessions: focus.sessions ?? 0, days: focus.days ?? {} })
const NONE = { xp: 0, sessions: 0, days: {} }

// a - b (or a + b with sign 1), never below zero.
function combine(a, b, sign) {
  const days = { ...a.days }
  for (const [day, minutes] of Object.entries(b.days ?? {})) days[day] = (days[day] ?? 0) + sign * minutes
  for (const day of Object.keys(days)) if (!(days[day] > 0)) delete days[day]
  return { xp: Math.max(0, a.xp + sign * (b.xp ?? 0)), sessions: Math.max(0, a.sessions + sign * (b.sessions ?? 0)), days }
}

// What this device sends: its own counters (the focus numbers less what came
// from other devices; also right after switching accounts, since the old
// account's share is taken out) and everything else as it is.
export function buildUpload(storage) {
  const device = deviceId(storage)
  if (!device) return null
  const { others = NONE } = readJson(storage, SYNC_KEY, {})
  return {
    device,
    own: combine(counters(readFocus(storage)), others, -1),
    streak: readJson(storage, KEYS.streak, null),
    plan: readJson(storage, KEYS.plan, null),
    cards: readJson(storage, KEYS.cards, {}),
    results: readJson(storage, KEYS.results, {}),
  }
}

// Takes in the account's progress. Merged again with what's saved here now,
// so studying done while the request was out isn't lost. Returns the keys
// that changed.
export function applyProgress(storage, progress, userId) {
  const device = deviceId(storage)
  if (!device || !progress) return []
  const changed = []
  const save = (key, value) => {
    const before = storage.getItem(key)
    if (before !== JSON.stringify(value) && writeJson(storage, key, value)) changed.push(key)
  }

  const { others: oldOthers = NONE } = readJson(storage, SYNC_KEY, {})
  const others = totalCounters(progress.devices, device)
  const focus = readFocus(storage)
  if (writeJson(storage, SYNC_KEY, { userId, others })) {
    save(KEYS.focus, { ...focus, ...combine(combine(counters(focus), oldOthers, -1), others, 1) })
  }
  const streak = mergeStreak(readJson(storage, KEYS.streak, null), progress.streak)
  if (streak) save(KEYS.streak, streak)
  const plan = readJson(storage, KEYS.plan, null)
  if (plan || progress.plan) save(KEYS.plan, mergePlan(plan ?? {}, progress.plan ?? {}))
  save(KEYS.cards, mergeRecords(readJson(storage, KEYS.cards, {}), progress.cards ?? {}))
  save(KEYS.results, mergeRecords(readJson(storage, KEYS.results, {}), progress.results ?? {}))
  return changed
}

// Syncs while `user` is signed in: on sign-in, whenever the app comes back to
// the screen, every couple of minutes, and as it's hidden (so closing the
// app straight after studying still uploads). Screens pick the changes up
// through `storage` events.
export function useProgressSync(user) {
  const userId = user?.id ?? null
  useEffect(() => {
    if (!userId) return
    let busy = false
    let stopped = false
    async function sync({ leaving = false } = {}) {
      if (busy) return
      const upload = buildUpload(localStorage)
      if (!upload) return
      busy = true
      try {
        const body = JSON.stringify({ upload })
        const res = await fetch('/api/library?progress=1', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body,
          cache: 'no-store',
          keepalive: leaving && body.length < KEEPALIVE_MAX_BYTES,
        })
        const data = res.ok ? await res.json().catch(() => null) : null
        if (stopped || !data?.progress) return
        for (const key of applyProgress(localStorage, data.progress, userId)) window.dispatchEvent(new StorageEvent('storage', { key }))
      } catch {
        // Offline: the next sync sends it all again.
      } finally {
        busy = false
      }
    }
    sync()
    const onVisibility = () => sync({ leaving: document.visibilityState === 'hidden' })
    const timer = setInterval(() => document.visibilityState === 'visible' && sync(), SYNC_EVERY_MS)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      stopped = true
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [userId])
}
