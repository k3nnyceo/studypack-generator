// Run with: npm test
// Focus sessions, XP and levels (src/lib/focus.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { endTimer, FINISH_BONUS, levelFor, pauseTimer, readFocus, resumeTimer, startTimer, timerState, weekOf } from './focus.js'

const MIN = 60_000
const T0 = Date.parse('2026-11-19T10:00:00Z')
const fresh = () => readFocus({ getItem: () => null })

test('levels need 50, then 75, then 100 XP', () => {
  assert.deepEqual(levelFor(0), { level: 1, into: 0, needed: 50 })
  assert.deepEqual(levelFor(49), { level: 1, into: 49, needed: 50 })
  assert.deepEqual(levelFor(50), { level: 2, into: 0, needed: 75 })
  assert.deepEqual(levelFor(130), { level: 3, into: 5, needed: 100 })
})

test('a finished session credits its minutes plus the bonus to today', () => {
  const s = startTimer(fresh(), 25, 'Circuits', T0)
  assert.equal(timerState(s.timer, T0 + 10 * MIN).remainingMs, 15 * MIN)
  const { state, minutes, xp, finished } = endTimer(s, T0 + 26 * MIN)
  assert.deepEqual({ minutes, xp, finished }, { minutes: 25, xp: 25 + FINISH_BONUS, finished: true })
  assert.equal(state.timer, null)
  assert.equal(state.days['2026-11-19'], 25)
  assert.equal(state.sessions, 1)
})

test('paused time does not count, and ending early credits whole minutes without the bonus', () => {
  let s = startTimer(fresh(), 25, '', T0)
  s = pauseTimer(s, T0 + 5 * MIN)
  assert.equal(timerState(s.timer, T0 + 30 * MIN).elapsedMs, 5 * MIN)
  s = resumeTimer(s, T0 + 30 * MIN)
  const { minutes, xp, finished } = endTimer(s, T0 + 37.5 * MIN)
  assert.deepEqual({ minutes, xp, finished }, { minutes: 12, xp: 12, finished: false })
})

test('a session under a minute earns nothing', () => {
  const { state, minutes } = endTimer(startTimer(fresh(), 25, '', T0), T0 + 40_000)
  assert.equal(minutes, 0)
  assert.deepEqual(state.days, {})
  assert.equal(state.sessions, 0)
})

test('the week runs from 6 days ago to today', () => {
  const state = { ...fresh(), days: { '2026-11-19': 30, '2026-11-13': 10, '2026-11-12': 99 } }
  const week = weekOf(state, T0)
  assert.equal(week.length, 7)
  assert.deepEqual(week.map((d) => d.minutes), [10, 0, 0, 0, 0, 0, 30])
  assert.equal(week[6].label, 'Thu')
  assert.ok(week[6].today)
})
