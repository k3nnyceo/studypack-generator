// Run with: npm test
// Exam countdown and the daily plan (src/lib/examPlan.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dailyPlan, daysUntil, readPlan, sameCourse, upcomingExams, withoutOldDays } from './examPlan.js'

const TODAY = '2026-11-20'
const pack = (id, course, topic = id) => ({ id, course, topic })

test('days until an exam, and which exams are still coming', () => {
  assert.equal(daysUntil('2026-12-02', TODAY), 12)
  assert.equal(daysUntil(TODAY, TODAY), 0)
  const exams = [
    { id: 'a', course: 'PHY 101', date: '2026-12-10' },
    { id: 'b', course: 'MTH 101', date: '2026-12-02' },
    { id: 'c', course: 'GST 111', date: '2026-11-19' },
  ]
  assert.deepEqual(
    upcomingExams(exams, TODAY).map((e) => [e.id, e.daysLeft]),
    [
      ['b', 12],
      ['a', 20],
    ],
  )
})

test('course names match by their code', () => {
  assert.ok(sameCourse('MTH101', 'MTH 101 Elementary Mathematics I'))
  assert.ok(sameCourse('mth 101', 'MTH 101'))
  assert.ok(!sameCourse('MTH 101', 'MTH 102'))
  assert.ok(sameCourse('Strength of Materials', ' strength of materials '))
})

test('the plan reviews due cards, studies one pack per course, and asks for a pack when there is none', () => {
  const m1 = pack('m1', 'MTH 101 Elementary Mathematics I', 'Algebra')
  const m2 = pack('m2', 'MTH 101 Elementary Mathematics I', 'Trigonometry')
  const other = pack('o1', 'CHM 101', 'Atoms')
  const exams = [
    { id: 'x1', course: 'MTH101', date: '2026-12-02' },
    { id: 'x2', course: 'GST 111', date: '2026-12-05' },
  ]
  const due = { packs: [{ entry: m2, due: 4 }, { entry: other, due: 2 }], total: 6 }
  const tasks = dailyPlan({ exams, entries: [m1, m2, other], due, today: TODAY })
  const kinds = tasks.map((t) => [t.kind, t.entry?.id ?? t.course])
  assert.deepEqual(kinds[0], ['review', 'm2'])
  assert.ok(['guide', 'quiz'].includes(kinds[1][0]) && ['m1', 'm2'].includes(kinds[1][1]), 'one MTH 101 study task')
  assert.deepEqual(kinds[2], ['make', 'GST 111'])
  assert.deepEqual(kinds[3], ['review', 'o1'], 'due cards from packs with no exam still count')
  assert.equal(tasks[0].text, 'Review 4 due flashcards: Trigonometry')
  assert.equal(tasks[2].text, 'Make a study pack for GST 111')
  assert.equal(new Set(tasks.map((t) => t.id)).size, tasks.length, 'ids are unique')
})

test('the last days before an exam are for a timed mock exam; far-off exams have no task yet', () => {
  const m1 = pack('m1', 'MTH 101')
  const close = dailyPlan({ exams: [{ id: 'x', course: 'MTH 101', date: '2026-11-22' }], entries: [m1], due: { packs: [], total: 0 }, today: TODAY })
  assert.equal(close[0].kind, 'exam')
  const far = dailyPlan({ exams: [{ id: 'x', course: 'MTH 101', date: '2027-03-01' }], entries: [m1], due: { packs: [], total: 0 }, today: TODAY })
  assert.deepEqual(far, [])
})

test('the study task takes turns between guide and quiz from day to day', () => {
  const m1 = pack('m1', 'MTH 101')
  const kindOn = (today) => dailyPlan({ exams: [{ id: 'x', course: 'MTH 101', date: '2026-12-30' }], entries: [m1], due: { packs: [], total: 0 }, today })[0].kind
  assert.notEqual(kindOn('2026-11-20'), kindOn('2026-11-21'))
})

test('saved plans are read safely and only today’s ticks are kept', () => {
  assert.deepEqual(readPlan({ getItem: () => 'nope' }), { exams: [], removed: [], done: {} })
  assert.deepEqual(readPlan({ getItem: () => JSON.stringify({ exams: [{ id: 'a' }] }) }), { exams: [{ id: 'a' }], removed: [], done: {} })
  assert.deepEqual(withoutOldDays({ '2026-11-19': ['a'], [TODAY]: ['b'] }, TODAY), { [TODAY]: ['b'] })
})
