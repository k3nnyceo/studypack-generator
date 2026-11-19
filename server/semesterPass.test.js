// Run with: npm test
// The semester pass (server/plans.js, server/billing.js) and the 30-day
// allowance blocks of long paid periods (server/usageLimits.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { handleBillingRequest } from './billing.js'
import { passesFromEnv, plansFromEnv } from './plans.js'
import { applyPayment, getSubscription } from './subscriptions.js'
import { createMeter, memoryStore, paidBlock } from './usageLimits.js'

const DAY = 864e5
const T0 = Date.UTC(2026, 10, 1)

test('the semester pass is 4 months of Pro for ₦25,000, ₦5,000 off monthly', async () => {
  const pass = passesFromEnv({}).semester
  assert.deepEqual({ plan: pass.plan, months: pass.months, price: pass.price }, { plan: 'pro', months: 4, price: 25000 })
  const plans = plansFromEnv({})
  assert.deepEqual([plans.plus.price, plans.pro.price, plans.max.price], [3000, 7500, 15000])
  for (const id of ['plus', 'pro', 'max']) assert.ok(plans[id].periodNaira <= plans[id].price * 0.7, `${id}: the month costs at most 70%`)
  // Even a student who uses every month of the pass in full leaves some margin.
  assert.ok(plans.pro.periodNaira * pass.months < pass.price, 'four Pro allowances cost less than the pass')
})

test('long paid periods refill every 30 days; short last stretches share or join', () => {
  const block = (days, at) => paidBlock({ periodStart: T0, periodEnd: T0 + days * DAY }, T0 + at * DAY)
  // A normal month, with or without auto-renew's grace, is one block.
  assert.deepEqual(block(30, 29), { id: `p${T0}`, endsAt: T0 + 30 * DAY, share: 1 })
  assert.deepEqual(block(32, 31), { id: `p${T0}`, endsAt: T0 + 32 * DAY, share: 1 })
  // A pass: four blocks of 30 days, each with the full allowance.
  assert.deepEqual(block(120, 0), { id: `p${T0}`, endsAt: T0 + 30 * DAY, share: 1 })
  assert.deepEqual(block(120, 45), { id: `p${T0}-1`, endsAt: T0 + 60 * DAY, share: 1 })
  assert.deepEqual(block(120, 119), { id: `p${T0}-3`, endsAt: T0 + 120 * DAY, share: 1 })
  // Paying early with 20 days left: 30 days, then 20 days with 2/3 of the allowance.
  assert.deepEqual(block(50, 40), { id: `p${T0}-1`, endsAt: T0 + 50 * DAY, share: 20 / 30 })
  // A reward week (shorter than a block) keeps its own allowance.
  assert.equal(block(7, 3).share, 1)
})

test('the meter gives each month of a pass its own Pro allowance', async () => {
  const store = memoryStore()
  const plans = plansFromEnv({})
  let now = T0
  const meter = createMeter(store, { plans }, () => now)
  const { record } = await applyPayment(store, { userId: 'u', planId: 'pro', reference: 'pass1', months: 4 }, plans, T0)
  assert.equal(Math.round((record.periodEnd - T0) / DAY), 120)
  assert.equal((await meter.reserveCost('u', record, 2000)).ok, true)
  assert.equal((await meter.status('u', record)).period.used, 2000)
  now = T0 + 31 * DAY
  const status = await meter.status('u', record)
  assert.equal(status.period.used, 0, 'month two starts fresh')
  assert.equal(status.period.limit, plans.pro.periodNaira)
  assert.equal(status.period.resetsAt, T0 + 60 * DAY)
})

test('checkout charges the pass price, and paying applies 4 months of Pro', async () => {
  const store = memoryStore()
  const env = { PAYSTACK_SECRET_KEY: 'sk_test_x', SITE_URL: 'https://studypack.example' }
  const user = { id: 'u1', email: 'ada@example.com' }
  const calls = []
  const tx = { status: 'success', currency: 'NGN', amount: 25000 * 100, metadata: { userId: 'u1', plan: 'pro', pass: 'semester' }, customer: { email: 'ada@example.com' } }
  const api = async (path, opts) => {
    calls.push({ path, ...opts })
    if (path === '/transaction/initialize') return { authorization_url: 'https://checkout.paystack.com/x', reference: 'ref-pass' }
    if (path.startsWith('/transaction/verify/')) return tx
    throw new Error(`unexpected ${path}`)
  }
  const call = async (body, method = 'POST') => {
    const res = { writeHead(s) { this.status = s }, end(t) { this.body = JSON.parse(t) }, setHeader() {} }
    await handleBillingRequest({ method, headers: {} }, res, body, { env, store, api, getUser: async () => user, now: () => T0 })
    return res
  }

  const listed = await call(null, 'GET')
  assert.deepEqual(listed.body.passes.map((p) => [p.id, p.price, p.monthlyTotal]), [['semester', 25000, 30000]])

  const checkout = await call({ action: 'checkout', pass: 'semester' })
  assert.equal(checkout.body.url, 'https://checkout.paystack.com/x')
  assert.equal(calls[0].body.amount, 25000 * 100)
  assert.deepEqual(calls[0].body.metadata, { userId: 'u1', plan: 'pro', pass: 'semester', autoRenew: false })
  assert.equal(calls[0].body.plan, undefined, 'no card subscription')

  const verified = await call({ action: 'verify', reference: 'ref-pass' })
  assert.equal(verified.status, 200)
  const sub = await getSubscription(store, 'u1')
  assert.equal(sub.plan, 'pro')
  assert.equal(Math.round((sub.periodEnd - T0) / DAY), 120)

  // Paying less than the pass price doesn't count.
  tx.amount = 7500 * 100
  assert.equal((await call({ action: 'verify', reference: 'ref-cheap' })).status, 400)
  assert.equal((await call({ action: 'checkout', pass: 'nope' })).status, 400)
})
