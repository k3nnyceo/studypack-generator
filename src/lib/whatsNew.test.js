// Run with: npm test
// "New in StudyPack" announcements (src/lib/whatsNew.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { dismiss, nextAnnouncement, readDismissed } from './whatsNew.js'

const list = [
  { id: 'c', title: 'C', cta: { view: 'today' } },
  { id: 'b', title: 'B', cta: { url: '' }, needs: '' },
  { id: 'a', title: 'A' },
]

test('the newest not-dismissed announcement shows, one at a time', () => {
  assert.equal(nextAnnouncement([], 'home', list).id, 'c')
  assert.equal(nextAnnouncement(['c'], 'home', list).id, 'a', 'b needs a link that isn’t set up')
  assert.equal(nextAnnouncement(['c', 'a'], 'home', list), null)
})

test('an announcement linking to the open screen is skipped there', () => {
  assert.equal(nextAnnouncement([], 'today', list).id, 'a')
})

test('dismissed ids are remembered, once each', () => {
  const values = new Map()
  const storage = { getItem: (k) => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }
  dismiss('c', storage)
  dismiss('c', storage)
  dismiss('a', storage)
  assert.deepEqual(readDismissed(storage), ['c', 'a'])
  assert.deepEqual(readDismissed({ getItem: () => 'not json' }), [])
})
