// Run with: npm test
// Price changes for card subscribers, with a fake Paystack: a renewal charged
// at the old price is still credited and the old subscription is stopped;
// opening the app with an old-price subscription stops it before it renews;
// subscribing again at the new price clears the notice.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { handleBillingRequest, handlePaystackWebhook } from './billing.js'
import { getAutoRenew, getSubscription, setAutoRenew } from './subscriptions.js'
import { createMeter, memoryStore } from './usageLimits.js'
import { plansFromEnv } from './plans.js'

const env = { PAYSTACK_SECRET_KEY: 'sk_test_x' }
const plans = plansFromEnv(env)
const user = { id: 'u1', email: 'student@example.test' }

// Paystack plans: Pro at the old ₦3,500 (an existing subscription) and at the
// current price.
function fakePaystack({ transactions = {}, subscriptions = {} } = {}) {
  const calls = []
  const paystackPlans = {
    PLN_old_pro: { name: 'StudyPack Pro', amount: 350_000 },
    PLN_new_pro: { name: 'StudyPack Pro', amount: plans.pro.price * 100 },
  }
  const api = async (path, { method = 'GET', body } = {}) => {
    calls.push({ method, path, body })
    if (path.startsWith('/plan/')) return paystackPlans[decodeURIComponent(path.slice(6))] ?? Promise.reject(new Error('no plan'))
    if (path.startsWith('/transaction/verify/')) return transactions[decodeURIComponent(path.split('/').pop())]
    if (path.startsWith('/subscription/disable')) return {}
    if (path.startsWith('/subscription/')) return subscriptions[decodeURIComponent(path.split('/').pop())]
    throw new Error(`unexpected ${method} ${path}`)
  }
  return { api, calls }
}

const response = () => ({
  statusCode: 0,
  body: null,
  setHeader() {},
  writeHead(code) {
    this.statusCode = code
  },
  end(text) {
    this.body = JSON.parse(text)
  },
})

async function webhook(store, api, event) {
  const raw = JSON.stringify(event)
  const signature = createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(raw).digest('hex')
  const res = response()
  await handlePaystackWebhook({ headers: { 'x-paystack-signature': signature } }, res, raw, { store, env, api })
  return res
}

async function billing(store, api, now = Date.now) {
  const res = response()
  await handleBillingRequest({ method: 'GET', headers: {} }, res, null, { store, meter: createMeter(store, { plans, env }), getUser: async () => user, env, api, now })
  return res.body
}

test('a renewal charged at the old price is credited, then the old subscription is stopped', async () => {
  const store = memoryStore()
  await setAutoRenew(store, user.id, { active: true, plan: 'pro', subscriptionCode: 'SUB_1', emailToken: 'tok' })
  const { api, calls } = fakePaystack({
    transactions: {
      ref_renewal: { status: 'success', currency: 'NGN', amount: 350_000, plan: 'PLN_old_pro', metadata: { userId: user.id }, customer: { email: user.email } },
    },
  })
  const res = await webhook(store, api, { event: 'charge.success', data: { reference: 'ref_renewal' } })
  assert.equal(res.statusCode, 200)
  const sub = await getSubscription(store, user.id)
  assert.equal(sub?.plan, 'pro', 'the paid period is credited')
  assert.ok(calls.some((c) => c.path === '/subscription/disable' && c.body.code === 'SUB_1'), 'the old subscription is stopped')
  const renew = await getAutoRenew(store, user.id)
  assert.equal(renew.active, false)
  assert.deepEqual(renew.priceChange, { plan: 'pro', oldPrice: 3500, newPrice: plans.pro.price })
  const state = await billing(store, api)
  assert.deepEqual(state.priceChange, renew.priceChange, 'the app is told why')
})

test('opening the app with an old-price subscription stops it before it renews', async () => {
  const store = memoryStore()
  await setAutoRenew(store, user.id, { active: true, plan: 'pro', subscriptionCode: 'SUB_2', emailToken: 'tok' })
  const { api, calls } = fakePaystack({ subscriptions: { SUB_2: { amount: 350_000, plan: { plan_code: 'PLN_old_pro' } } } })
  const state = await billing(store, api)
  assert.ok(calls.some((c) => c.path === '/subscription/disable' && c.body.code === 'SUB_2'))
  assert.equal(state.priceChange?.newPrice, plans.pro.price)
  assert.equal((await getAutoRenew(store, user.id)).active, false)
})

test('a subscription at the current price is checked once and left alone', async () => {
  const store = memoryStore()
  await setAutoRenew(store, user.id, { active: true, plan: 'pro', subscriptionCode: 'SUB_3', emailToken: 'tok' })
  const { api, calls } = fakePaystack({ subscriptions: { SUB_3: { amount: plans.pro.price * 100 } } })
  await billing(store, api)
  await billing(store, api)
  assert.equal(calls.filter((c) => c.path.startsWith('/subscription/')).length, 1, 'checked with Paystack once')
  assert.ok(!calls.some((c) => c.path === '/subscription/disable'))
  assert.equal((await getAutoRenew(store, user.id)).active, true)
})

test('subscribing again at the new price clears the notice; underpaying the new price is refused', async () => {
  const store = memoryStore()
  await setAutoRenew(store, user.id, { active: false, plan: 'pro', priceChange: { plan: 'pro', oldPrice: 3500, newPrice: plans.pro.price } })
  const { api } = fakePaystack({
    transactions: {
      ref_new: { status: 'success', currency: 'NGN', amount: plans.pro.price * 100, plan: 'PLN_new_pro', metadata: { userId: user.id, plan: 'pro' }, customer: { email: user.email } },
      ref_short: { status: 'success', currency: 'NGN', amount: 350_000, metadata: { userId: user.id, plan: 'pro' }, customer: { email: user.email } },
    },
  })
  const short = await webhook(store, api, { event: 'charge.success', data: { reference: 'ref_short' } })
  assert.equal(short.statusCode, 200)
  assert.equal(await getSubscription(store, user.id), null, 'a one-off payment at the old price buys nothing')
  await webhook(store, api, { event: 'charge.success', data: { reference: 'ref_new' } })
  assert.equal((await getSubscription(store, user.id))?.plan, 'pro')
  assert.equal((await getAutoRenew(store, user.id)).priceChange, null)
})

test('Plus: Haiku packs with theory questions, between Free and Pro', async () => {
  const { applyPayment } = await import('./subscriptions.js')
  const plans = plansFromEnv({})
  assert.deepEqual(Object.keys(plans), ['free', 'plus', 'pro', 'max'])
  const plus = plans.plus
  assert.equal(plus.price, 2500)
  assert.ok(plus.fastModel && plus.theory && plus.batchParts, 'Haiku, theory questions, every part at once')
  assert.ok(!plus.scans && !plus.diagramPages && !plus.paste, 'scans, diagrams and pasting stay on Pro and Max')
  assert.ok(plus.periodNaira <= plus.price * 0.7, 'the month costs at most 70% of the price')
  assert.equal(plus.maxChars, plans.pro.maxChars)

  // The plans page promises about ten packs a month.
  const res = { writeHead(s) { this.status = s }, end(t) { this.body = JSON.parse(t) }, setHeader() {} }
  await handleBillingRequest({ method: 'GET', headers: {} }, res, null, { env: {}, store: memoryStore(), getUser: async () => null })
  const shown = res.body.plans?.find((p) => p.id === 'plus')
  assert.ok(shown.packsPerMonth >= 10 && shown.packsPerMonth <= 12, `about ten a month (${shown.packsPerMonth})`)

  // Moving up from Plus keeps the days left, by price: 20 Plus days are 10 Pro days.
  const store = memoryStore()
  const day = 864e5
  const t0 = Date.UTC(2026, 9, 1)
  await applyPayment(store, { userId: 'u', planId: 'plus', reference: 'r1' }, plans, t0)
  const { record } = await applyPayment(store, { userId: 'u', planId: 'pro', reference: 'r2' }, plans, t0 + 10 * day)
  assert.equal(record.plan, 'pro')
  assert.equal(Math.round((record.periodEnd - (t0 + 10 * day)) / day), 30 + 10)
})
