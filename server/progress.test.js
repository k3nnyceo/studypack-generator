// Run with: npm test
// Study progress synced through /api/library?progress=1 (server/library.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleLibraryRequest, memoryLibraryStore } from './library.js'

const ada = { id: 'u-ada', email: 'ada@example.com' }

async function call(store, method, { user = ada, body = null } = {}) {
  const res = {
    writeHead(status) {
      this.status = status
    },
    end(text) {
      this.body = JSON.parse(text)
    },
  }
  await handleLibraryRequest({ method, url: '/api/library?progress=1', headers: {} }, res, body, { store, getUser: async () => user })
  return res
}

const upload = (device, xp, extra = {}) => ({ upload: { device, own: { xp, sessions: 1, days: {} }, ...extra } })

test('two devices sync into one account; each keeps its own counters', async () => {
  const store = memoryLibraryStore()
  assert.equal((await call(store, 'GET')).body.progress, null)
  await call(store, 'PUT', { body: upload('phone-123456', 40, { plan: { exams: [{ id: 'a', course: 'MTH 101', date: '2026-12-01' }], removed: [], done: {} } }) })
  const res = await call(store, 'PUT', { body: upload('laptop-12345', 25, { streak: { last: '2026-11-20', count: 3, best: 3 } }) })
  assert.equal(res.status, 200)
  assert.deepEqual(Object.keys(res.body.progress.devices).sort(), ['laptop-12345', 'phone-123456'])
  assert.equal(res.body.progress.plan.exams[0].id, 'a')
  assert.equal(res.body.progress.streak.count, 3)
  assert.equal((await call(store, 'GET')).body.progress.devices['phone-123456'].xp, 40)
})

test('progress needs a signed-in student and a device id', async () => {
  const store = memoryLibraryStore()
  assert.equal((await call(store, 'GET', { user: null })).status, 401)
  assert.equal((await call(store, 'PUT', { body: upload('x', 5) })).status, 400)
  assert.equal((await call(store, 'PUT', { body: {} })).status, 400)
  assert.equal((await call(store, 'DELETE')).status, 405)
})

test('oversized progress drops quiz answers first, then refuses', async () => {
  const store = memoryLibraryStore()
  const big = { p: Object.fromEntries(Array.from({ length: 20000 }, (_, i) => [`q${i}`, { tries: 1, missed: 0, last: true, at: i }])) }
  const res = await call(store, 'PUT', { body: upload('phone-123456', 1, { results: big }) })
  assert.equal(res.status, 200)
  assert.deepEqual(res.body.progress.results, {})
  const cards = { p: Object.fromEntries(Array.from({ length: 40000 }, (_, i) => [`c${i}`, { box: 1, due: i, at: i }])) }
  assert.equal((await call(store, 'PUT', { body: upload('phone-123456', 1, { cards }) })).status, 413)
})
