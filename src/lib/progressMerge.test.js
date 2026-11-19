// Run with: npm test
// Combining study progress from several devices (src/lib/progressMerge.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeCounters, mergePlan, mergeProgress, mergeRecords, mergeStreak, totalCounters } from './progressMerge.js'

test('each device’s XP and minutes are kept apart, so syncing twice counts nothing twice', () => {
  let doc = {}
  doc = mergeProgress(doc, { device: 'phone', own: { xp: 50, sessions: 2, days: { '2026-11-20': 40 } } })
  doc = mergeProgress(doc, { device: 'laptop', own: { xp: 30, sessions: 1, days: { '2026-11-20': 25 } } })
  // The phone syncs again with the same counters, then with more.
  doc = mergeProgress(doc, { device: 'phone', own: { xp: 50, sessions: 2, days: { '2026-11-20': 40 } } })
  doc = mergeProgress(doc, { device: 'phone', own: { xp: 65, sessions: 3, days: { '2026-11-20': 55 } } })
  assert.deepEqual(totalCounters(doc.devices), { xp: 95, sessions: 4, days: { '2026-11-20': 80 } })
  assert.deepEqual(totalCounters(doc.devices, 'phone'), { xp: 30, sessions: 1, days: { '2026-11-20': 25 } }, 'what the phone adds from others')
})

test('an older copy of a device’s counters never lowers them', () => {
  assert.deepEqual(mergeCounters({ xp: 10, sessions: 2, days: { d: 5 } }, { xp: 4, sessions: 3, days: { d: 2, e: 1 } }), { xp: 10, sessions: 3, days: { d: 5, e: 1 } })
})

test('the most recent streak wins; the best is kept', () => {
  assert.deepEqual(mergeStreak({ last: '2026-11-19', count: 5, best: 9 }, { last: '2026-11-20', count: 2, best: 2 }), { last: '2026-11-20', count: 2, best: 9 })
  assert.equal(mergeStreak({ last: '2026-11-20', count: 6, best: 6 }, { last: '2026-11-20', count: 3, best: 3 }).count, 6)
  assert.deepEqual(mergeStreak(null, { last: 'x', count: 1, best: 1 }), { last: 'x', count: 1, best: 1 })
})

test('exams join up, removed ones stay removed, and ticks are combined', () => {
  const phone = { exams: [{ id: 'a', course: 'MTH 101', date: '2026-12-01' }, { id: 'b', course: 'PHY 101', date: '2026-12-05' }], removed: [], done: { '2026-11-20': ['t1'] } }
  const laptop = { exams: [{ id: 'a', course: 'MTH 101', date: '2026-12-01' }, { id: 'c', course: 'GST 111', date: '2026-12-09' }], removed: ['b'], done: { '2026-11-20': ['t2'], '2026-11-10': ['old'] } }
  const merged = mergePlan(phone, laptop)
  assert.deepEqual(merged.exams.map((e) => e.id).sort(), ['a', 'c'])
  assert.deepEqual(merged.removed, ['b'])
  assert.deepEqual(merged.done['2026-11-20'].sort(), ['t1', 't2'])
})

test('flashcards and quiz answers keep the newest record', () => {
  const a = { pack: { c1: { box: 3, due: 500, at: 100 }, c2: { box: 1, due: 900 } } }
  const b = { pack: { c1: { box: 0, due: 200, at: 200 }, c2: { box: 2, due: 950 }, c3: { box: 1, due: 10, at: 5 } }, other: { c9: { box: 1, due: 1, at: 1 } } }
  const merged = mergeRecords(a, b)
  assert.equal(merged.pack.c1.box, 0, '"Still learning" marked later wins')
  assert.equal(merged.pack.c2.box, 2, 'old records without a time: the later review date')
  assert.ok(merged.pack.c3 && merged.other.c9)
})
