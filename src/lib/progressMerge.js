// How study progress from several devices is combined (src/lib/progressSync.js
// on the device, server/library.js on the account). Used by both, so the
// server merges with the same rules.
//
// A progress document:
//   { devices: { [deviceId]: { xp, sessions, days: { 'YYYY-MM-DD': minutes } } },
//     streak: { last, count, best },
//     plan: { exams: [{ id, course, date }], removed: [exam id], done: { day: [task id] } },
//     cards: { [pack fingerprint]: { [card id]: { box, due, at? } } },
//     results: { [pack fingerprint]: { [question id]: { tries, missed, last, at } } } }
//
// XP, sessions and focus minutes are counted per device: each device only ever
// adds to its own counters, so taking the larger of two copies of a device's
// counters is always right, and syncing twice never counts anything twice.
// Everything else keeps the newest answer.

const DONE_DAYS_KEPT = 2

const num = (n) => (Number.isFinite(n) && n > 0 ? n : 0)

// One device's counters: the larger of each.
export function mergeCounters(a = {}, b = {}) {
  const days = { ...(a.days ?? {}) }
  for (const [day, minutes] of Object.entries(b.days ?? {})) days[day] = Math.max(num(days[day]), num(minutes))
  return { xp: Math.max(num(a.xp), num(b.xp)), sessions: Math.max(num(a.sessions), num(b.sessions)), days }
}

// The sum of every device's counters except `skip`'s.
export function totalCounters(devices = {}, skip = null) {
  const total = { xp: 0, sessions: 0, days: {} }
  for (const [id, c] of Object.entries(devices)) {
    if (id === skip) continue
    total.xp += num(c.xp)
    total.sessions += num(c.sessions)
    for (const [day, minutes] of Object.entries(c.days ?? {})) total.days[day] = (total.days[day] ?? 0) + num(minutes)
  }
  return total
}

// The streak studied most recently wins; on the same day, the longer count.
export function mergeStreak(a, b) {
  if (!a?.last) return b ?? a ?? null
  if (!b?.last) return a
  const newer = a.last === b.last ? (a.count >= b.count ? a : b) : a.last > b.last ? a : b
  return { ...newer, best: Math.max(a.best ?? 0, b.best ?? 0, newer.count ?? 0) }
}

// Exams from both, less any removed on either; today's (and yesterday's) ticks combined.
export function mergePlan(a, b) {
  a ??= {}
  b ??= {}
  const removed = [...new Set([...(a.removed ?? []), ...(b.removed ?? [])])]
  const exams = new Map()
  for (const exam of [...(a.exams ?? []), ...(b.exams ?? [])]) if (!removed.includes(exam.id) && !exams.has(exam.id)) exams.set(exam.id, exam)
  const done = {}
  const days = [...new Set([...Object.keys(a.done ?? {}), ...Object.keys(b.done ?? {})])].sort().slice(-DONE_DAYS_KEPT)
  for (const day of days) done[day] = [...new Set([...(a.done?.[day] ?? []), ...(b.done?.[day] ?? [])])]
  return { exams: [...exams.values()], removed, done }
}

// Per pack, per item: the newer record (by `at`; for older flashcard records
// without one, the later review date).
const newer = (x, y) => {
  if (!x) return y
  if (!y) return x
  if (x.at || y.at) return (y.at ?? 0) > (x.at ?? 0) ? y : x
  return (y.due ?? 0) > (x.due ?? 0) ? y : x
}
export function mergeRecords(a, b) {
  a ??= {}
  b ??= {}
  const out = { ...a }
  for (const [pack, items] of Object.entries(b)) {
    const merged = { ...(out[pack] ?? {}) }
    for (const [id, record] of Object.entries(items ?? {})) merged[id] = newer(merged[id], record)
    out[pack] = merged
  }
  return out
}

// The account's progress after a device's upload: `upload` is
// { device, own: counters, streak, plan, cards, results }.
export function mergeProgress(stored = {}, upload, now = Date.now()) {
  const devices = { ...(stored.devices ?? {}) }
  if (upload.device) devices[upload.device] = mergeCounters(devices[upload.device], upload.own)
  return {
    devices,
    streak: mergeStreak(stored.streak, upload.streak),
    plan: mergePlan(stored.plan, upload.plan),
    cards: mergeRecords(stored.cards, upload.cards),
    results: mergeRecords(stored.results, upload.results),
    updatedAt: now,
  }
}
