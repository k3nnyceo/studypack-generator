// Run with: npm test
// A device's side of syncing study progress (src/lib/progressSync.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeProgress } from './progressMerge.js'
import { applyProgress, buildUpload, KEYS } from './progressSync.js'

function device(id, data = {}) {
  const items = new Map([['studypack.device.v1', id], ...Object.entries(data).map(([k, v]) => [k, JSON.stringify(v)])])
  return {
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => void items.set(k, String(v)),
    read: (k) => JSON.parse(items.get(k) ?? 'null'),
  }
}
const focus = (xp, minutes) => ({ goal: 60, xp, sessions: 1, days: { '2026-11-20': minutes }, timer: null })

// One round: the device uploads, the "server" merges, the device takes it in.
function sync(account, storage) {
  const next = mergeProgress(account, buildUpload(storage))
  applyProgress(storage, next, 'u-ada')
  return next
}

test('XP and minutes add up across devices and never count twice', () => {
  const phone = device('phone-123456', { [KEYS.focus]: focus(50, 40) })
  const laptop = device('laptop-12345', { [KEYS.focus]: focus(30, 25) })
  let account = {}
  account = sync(account, phone)
  account = sync(account, laptop)
  account = sync(account, phone)
  account = sync(account, phone)
  assert.equal(phone.read(KEYS.focus).xp, 80)
  assert.equal(laptop.read(KEYS.focus).xp, 80)
  assert.equal(phone.read(KEYS.focus).days['2026-11-20'], 65)
  assert.equal(phone.read(KEYS.focus).sessions, 2)

  // More studying on the laptop reaches the phone, with nothing doubled.
  laptop.setItem(KEYS.focus, JSON.stringify({ ...laptop.read(KEYS.focus), xp: 100 }))
  account = sync(account, laptop)
  account = sync(account, phone)
  assert.equal(phone.read(KEYS.focus).xp, 100)
  assert.equal(phone.read(KEYS.focus).goal, 60, 'the daily goal stays this device’s own')
})

test('exams, streak, flashcards and quiz answers come across', () => {
  const phone = device('phone-123456', {
    [KEYS.plan]: { exams: [{ id: 'e1', course: 'MTH 101', date: '2026-12-01' }], removed: [], done: {} },
    [KEYS.cards]: { pack: { c1: { box: 2, due: 9, at: 5 } } },
    [KEYS.streak]: { last: '2026-11-20', count: 4, best: 4 },
  })
  const laptop = device('laptop-12345', { [KEYS.results]: { pack: { q1: { tries: 1, missed: 1, last: false, at: 3 } } } })
  let account = sync({}, phone)
  account = sync(account, laptop)
  assert.equal(laptop.read(KEYS.plan).exams[0].course, 'MTH 101')
  assert.equal(laptop.read(KEYS.cards).pack.c1.box, 2)
  assert.equal(laptop.read(KEYS.streak).count, 4)
  sync(account, phone)
  assert.equal(phone.read(KEYS.results).pack.q1.missed, 1)
})

test('signing in to another account takes the old account’s share out first', () => {
  const phone = device('phone-123456', { [KEYS.focus]: focus(10, 10) })
  const laptop = device('laptop-12345', { [KEYS.focus]: focus(90, 60) })
  let ada = sync({}, laptop)
  ada = sync(ada, phone)
  assert.equal(phone.read(KEYS.focus).xp, 100)
  // Bola signs in on the phone: only the phone's own 10 XP go with it.
  const bola = sync({}, phone)
  assert.equal(phone.read(KEYS.focus).xp, 10)
  assert.equal(bola.devices['phone-123456'].xp, 10)
})
