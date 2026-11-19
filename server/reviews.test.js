// Run with: npm test
// Ratings and reviews through /api/referrals (server/reviews.js): one per
// account, validated, consent only with a comment, admins see them all.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleReferralRequest } from './referrals.js'
import { memoryStore } from './usageLimits.js'

const ada = { id: 'u-ada', email: 'ada@example.com', name: 'Ada Obi' }
const admin = { id: 'u-admin', email: 'boss@example.com', name: 'Boss' }
const env = { ADMIN_EMAILS: 'boss@example.com' }

async function call(store, method, { user = ada, url = '/api/referrals', body = null } = {}) {
  const res = {
    writeHead(status) {
      this.status = status
    },
    end(text) {
      this.body = JSON.parse(text)
    },
  }
  await handleReferralRequest({ method, url, headers: {} }, res, body, { store, env, getUser: async () => user })
  return res
}

test('a student rates StudyPack once; rating again replaces it', async () => {
  const store = memoryStore()
  assert.equal((await call(store, 'GET', { url: '/api/referrals?review=mine' })).body.review, null)
  const sent = await call(store, 'POST', { body: { action: 'review', rating: 5, comment: '  Saved my MTH101 exam  ', public: true } })
  assert.equal(sent.status, 200)
  assert.deepEqual(
    { rating: sent.body.review.rating, comment: sent.body.review.comment, public: sent.body.review.public, name: sent.body.review.name, plan: sent.body.review.plan },
    { rating: 5, comment: 'Saved my MTH101 exam', public: true, name: 'Ada', plan: 'free' },
  )
  assert.equal((await call(store, 'GET', { url: '/api/referrals?review=mine' })).body.review.rating, 5)
  await store.unclaim(`studypack:review:cool:${ada.id}`)
  await call(store, 'POST', { body: { action: 'review', rating: 3, comment: '' } })
  const all = await call(store, 'GET', { user: admin, url: '/api/referrals?reviews=1' })
  assert.equal(all.body.count, 1)
  assert.equal(all.body.reviews[0].rating, 3)
})

test('bad ratings, signed-out students and quick repeats are refused', async () => {
  const store = memoryStore()
  assert.equal((await call(store, 'POST', { body: { action: 'review', rating: 6 } })).status, 400)
  assert.equal((await call(store, 'POST', { body: { action: 'review', rating: 2.5 } })).status, 400)
  assert.equal((await call(store, 'POST', { user: null, body: { action: 'review', rating: 4 } })).status, 401)
  assert.equal((await call(store, 'POST', { body: { action: 'review', rating: 4 } })).status, 200)
  assert.equal((await call(store, 'POST', { body: { action: 'review', rating: 5 } })).status, 429)
})

test('permission to show a review publicly needs a comment', async () => {
  const store = memoryStore()
  const res = await call(store, 'POST', { body: { action: 'review', rating: 5, comment: '', public: true } })
  assert.equal(res.body.review.public, false)
})

test('only admins see all reviews, with the average', async () => {
  const store = memoryStore()
  await call(store, 'POST', { body: { action: 'review', rating: 4 } })
  await call(store, 'POST', { user: { id: 'u-ben', email: 'ben@example.com', name: '' }, body: { action: 'review', rating: 5 } })
  assert.equal((await call(store, 'GET', { url: '/api/referrals?reviews=1' })).status, 403)
  const all = await call(store, 'GET', { user: admin, url: '/api/referrals?reviews=1' })
  assert.equal(all.body.count, 2)
  assert.equal(all.body.average, 4.5)
})

test('visit counting through the same endpoint still works', async () => {
  const store = memoryStore()
  assert.equal((await call(store, 'POST', { user: null, body: { ref: 'x' } })).status, 200)
})
