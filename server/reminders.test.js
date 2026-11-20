// Run with: npm test
// Daily study reminders (server/reminders.js, through server/library.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleLibraryRequest, memoryLibraryStore } from './library.js'
import { reminderFor, withDevice } from './reminders.js'

// 5pm in Lagos on 20 November 2026.
const NOW = Date.parse('2026-11-20T16:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const cards = (n, due = NOW - 1000) => ({ pack: Object.fromEntries(Array.from({ length: n }, (_, i) => [`c${i}`, { box: 2, due }])) })
const prints = new Set(['pack'])

test('an exam coming up leads, with the cards due and the streak', () => {
  const progress = { cards: cards(3), plan: { exams: [{ id: 'e', course: 'MTH 101 Elementary Maths', date: '2026-11-24' }] }, streak: { last: '2026-11-19', count: 6, best: 6 } }
  assert.deepEqual(reminderFor({ progress, fingerprints: prints, now: NOW }), {
    title: 'MTH 101 exam in 4 days',
    body: 'Review your 3 due flashcards and keep your 6-day streak.',
  })
})

test('a streak ending tonight, or a pile of due cards, is worth a nudge; little else is', () => {
  assert.equal(reminderFor({ progress: { cards: cards(1), streak: { last: '2026-11-19', count: 3 } }, fingerprints: prints, now: NOW }).title, 'Keep your 3-day streak')
  assert.equal(reminderFor({ progress: { cards: cards(6) }, fingerprints: prints, now: NOW }).title, '6 flashcards due')
  assert.equal(reminderFor({ progress: { cards: cards(2) }, fingerprints: prints, now: NOW }), null, 'two cards can wait')
  assert.equal(reminderFor({ progress: { cards: cards(9, NOW + DAY) }, fingerprints: prints, now: NOW }), null, 'nothing due yet')
  assert.equal(reminderFor({ progress: { cards: cards(9) }, fingerprints: new Set(), now: NOW }), null, 'cards from deleted packs don’t count')
})

test('no reminder on a day the student already studied', () => {
  const progress = { cards: cards(9), plan: { exams: [{ id: 'e', course: 'PHY 101', date: '2026-11-21' }] }, streak: { last: '2026-11-20', count: 4 } }
  assert.equal(reminderFor({ progress, fingerprints: prints, now: NOW }), null)
})

test('a device subscribes once; the newest five are kept', () => {
  let devices = []
  for (let i = 0; i < 7; i++) devices = withDevice(devices, { endpoint: `https://push.example/${i}`, keys: { p256dh: 'p', auth: 'a' } })
  devices = withDevice(devices, { endpoint: 'https://push.example/3', keys: { p256dh: 'p', auth: 'a' } })
  assert.equal(devices.length, 5)
  assert.equal(devices[0].endpoint, 'https://push.example/3')
})

const env = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', CRON_SECRET: 's3cret' }
const ada = { id: 'u-ada' }
const subscription = { endpoint: 'https://push.example/ada', keys: { p256dh: 'p', auth: 'a' } }

async function call(store, method, url, { body = null, headers = {}, user = ada, send } = {}) {
  const res = {
    writeHead(status) {
      this.status = status
    },
    end(text) {
      this.body = JSON.parse(text)
    },
  }
  await handleLibraryRequest({ method, url, headers }, res, body, { store, env, getUser: async () => user, send })
  return res
}

test('the daily run sends once per day, only with the cron secret, and drops dead devices', async () => {
  const store = memoryLibraryStore()
  assert.equal((await call(store, 'GET', '/api/library?push=1')).body.key, 'pub')
  assert.equal((await call(store, 'PUT', '/api/library?push=1', { body: { subscription } })).status, 200)
  await store.put(ada.id, { id: 'p1', fingerprint: 'pack', guide: {} })
  await store.setProgress(ada.id, { cards: cards(8, Date.now() - 1000) })

  const sent = []
  const send = async (device, payload) => {
    sent.push(JSON.parse(payload))
    if (device.endpoint.endsWith('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 })
  }
  assert.equal((await call(store, 'GET', '/api/library?cron=reminders', { send })).status, 401)
  const run = await call(store, 'GET', '/api/library?cron=reminders', { headers: { authorization: 'Bearer s3cret' }, send })
  assert.deepEqual(run.body, { students: 1, sent: 1, removed: 0 })
  assert.equal(sent[0].title, '8 flashcards due')
  assert.equal(sent[0].url, '/#/today')
  const again = await call(store, 'GET', '/api/library?cron=reminders', { headers: { authorization: 'Bearer s3cret' }, send })
  assert.equal(again.body.sent, 0, 'not twice in a day')

  // A device that's gone is removed at its next reminder; turning off removes it at once.
  const bola = { id: 'u-bola' }
  await call(store, 'PUT', '/api/library?push=1', { user: bola, body: { subscription: { ...subscription, endpoint: 'https://push.example/gone' } } })
  await store.put(bola.id, { id: 'p1', fingerprint: 'pack', guide: {} })
  await store.setProgress(bola.id, { cards: cards(8, Date.now() - 1000) })
  const third = await call(store, 'GET', '/api/library?cron=reminders', { headers: { authorization: 'Bearer s3cret' }, send })
  assert.equal(third.body.removed, 1)
  assert.deepEqual(await store.pushUsers(), ['u-ada'])
  await call(store, 'PUT', '/api/library?push=1', { body: { remove: subscription.endpoint } })
  assert.deepEqual(await store.pushUsers(), [])
  assert.equal((await call(store, 'PUT', '/api/library?push=1', { body: { subscription: { endpoint: 'http://not-secure' } } })).status, 400)
})
