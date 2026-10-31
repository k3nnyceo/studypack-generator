// Run with: npm test
// Invite friends, earn free days (server/invites.js): a friend who signs up
// through a student's link pays 20% less the first time, and their first
// payment gives the inviter 7 days (a week of Plus on Free, or 7 more days of
// their paid plan, kept across card renewals). Nothing for sign-ups alone,
// for inviting yourself, or twice for the same friend.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleBillingRequest } from './billing.js'
import { inviteCode, inviteSummary } from './invites.js'
import { plansFromEnv } from './plans.js'
import { recordSignup, referralStats } from './referrals.js'
import { applyPayment, getSubscription } from './subscriptions.js'
import { createMeter, memoryStore } from './usageLimits.js'

const env = { PAYSTACK_SECRET_KEY: 'sk_test_x' }
const plans = plansFromEnv(env)
const DAY = 864e5
const T0 = Date.UTC(2026, 9, 1)

// Paystack that records checkouts and reports them paid at what was asked.
function fakePaystack() {
  const checkouts = new Map()
  let n = 0
  const api = async (path, { method = 'GET', body } = {}) => {
    if (path === '/transaction/initialize') {
      const reference = `ref${++n}`
      checkouts.set(reference, body)
      return { authorization_url: `https://paystack.test/${reference}`, reference }
    }
    if (path.startsWith('/transaction/verify/')) {
      const reference = decodeURIComponent(path.split('/').pop())
      const c = checkouts.get(reference)
      return { status: 'success', amount: c.amount, currency: 'NGN', metadata: c.metadata, customer: { email: c.email } }
    }
    throw new Error(`unexpected ${method} ${path}`)
  }
  return { api, checkouts }
}

function client(store, api, user, now = () => T0) {
  const call = async (method, body = null) => {
    const res = { setHeader() {}, writeHead(s) { this.status = s }, end(t) { this.body = JSON.parse(t) } }
    await handleBillingRequest({ method, headers: { host: 'studypack.test' } }, res, body, { store, meter: createMeter(store, { plans, env }), getUser: async () => user, env, api, now })
    return res
  }
  return {
    state: async () => (await call('GET')).body,
    // Checks out and pays; resolves to the amount charged in naira.
    async pay(plan, autoRenew = false) {
      const { body } = await call('POST', { action: 'checkout', plan, autoRenew })
      const reference = body.url.split('/').pop()
      const verified = await call('POST', { action: 'verify', reference })
      assert.equal(verified.status, 200, JSON.stringify(verified.body))
      return reference
    },
  }
}

async function invite(store, inviterId, friendId) {
  const { code } = await inviteSummary(store, inviterId)
  await recordSignup(store, friendId, code)
  return code
}

test('a friend pays 20% less the first time, and their inviter on Free gets a week of Plus', async () => {
  const store = memoryStore()
  const { api, checkouts } = fakePaystack()
  await recordSignup(store, 'ada', undefined)
  const code = await invite(store, 'ada', 'bola')
  assert.match(code, /^i-[a-z0-9]{1,7}$/)
  assert.equal(code, inviteCode('ada'), 'the same link every time')

  const bola = client(store, api, { id: 'bola', email: 'bola@example.test' })
  assert.equal((await bola.state()).friendDiscount, 0.2)
  const ref = await bola.pay('plus')
  assert.equal(checkouts.get(ref).amount, 2000 * 100, 'Plus at ₦2,000 instead of ₦2,500')
  assert.equal((await bola.state()).plan, 'plus')
  assert.equal((await bola.state()).friendDiscount, 0, 'only the first payment')
  const again = await bola.pay('plus')
  assert.equal(checkouts.get(again).amount, 2500 * 100)

  const reward = await getSubscription(store, 'ada')
  assert.equal(reward.plan, 'plus')
  assert.equal(reward.periodEnd - reward.periodStart, 7 * DAY)
  assert.equal(reward.allowanceNaira, Math.round((plans.plus.periodNaira * 7) / 30), 'a week’s share of Plus')
  const ada = client(store, api, { id: 'ada', email: 'ada@example.test' })
  const adaState = await ada.state()
  assert.equal(adaState.plan, 'plus')
  assert.equal(adaState.rewardWeek, true)
  assert.deepEqual(await inviteSummary(store, 'ada'), { code, joined: 1, paid: 1, days: 7, rewardDays: 7, friendDiscount: 0.2 })

  // Admin stats count all students' links as one "invites" row.
  const rows = await referralStats(store)
  assert.ok(rows.some((r) => r.ref === 'invites' && r.signups === 1 && r.payers === 1))
  assert.ok(!rows.some((r) => r.ref.startsWith('i-')))
})

test('an inviter on a paid plan gets 7 more days, kept when their card renews', async () => {
  const store = memoryStore()
  const { api } = fakePaystack()
  await applyPayment(store, { userId: 'ada', planId: 'pro', reference: 'p1', autoRenew: true }, plans, T0)
  const before = await getSubscription(store, 'ada')
  await invite(store, 'ada', 'bola')
  await client(store, api, { id: 'bola', email: 'bola@example.test' }).pay('pro')
  const after = await getSubscription(store, 'ada')
  assert.equal(after.plan, 'pro')
  assert.equal(after.periodEnd - before.periodEnd, 7 * DAY)
  assert.equal(after.allowanceNaira, undefined, 'a paid plan keeps its own allowance')

  // The card renews 10 days before the period ends: the 7 earned days carry over.
  const renewal = after.periodEnd - 10 * DAY
  const { record } = await applyPayment(store, { userId: 'ada', planId: 'pro', reference: 'p2', autoRenew: true }, plans, renewal)
  assert.equal(Math.round((record.periodEnd - renewal) / DAY), 30 + 2 + 7)
})

test('no reward for sign-ups alone, inviting yourself, auto-renew discounts, or the same friend twice', async () => {
  const store = memoryStore()
  const { api, checkouts } = fakePaystack()
  await invite(store, 'ada', 'bola')
  assert.equal(await getSubscription(store, 'ada'), null, 'signing up earns nothing')

  // Your own link does nothing.
  const { code } = await inviteSummary(store, 'cara')
  await recordSignup(store, 'cara', code)
  const cara = client(store, api, { id: 'cara', email: 'cara@example.test' })
  assert.equal((await cara.state()).friendDiscount, 0)

  // A card subscription is charged in full (Paystack's plan price), but still rewards.
  const { api: subsApi, checkouts: subs } = fakePaystack()
  const withPlan = async (path, opts) => (path.startsWith('/plan') ? (path === '/plan?perPage=100' ? [] : { plan_code: 'PLN_plus' }) : subsApi(path, opts))
  const ref = await client(store, withPlan, { id: 'bola', email: 'bola@example.test' }).pay('plus', true)
  assert.equal(subs.get(ref).amount, 2500 * 100)
  assert.equal((await inviteSummary(store, 'ada')).paid, 1)

  // A second friend account paying again doesn't reward twice for the same friend.
  await client(store, api, { id: 'bola', email: 'bola@example.test' }).pay('plus')
  assert.equal((await inviteSummary(store, 'ada')).days, 7)
  assert.equal(checkouts.size, 1)
})

test('a reward week of Plus has a week’s allowance, and paying keeps its days', async () => {
  const store = memoryStore()
  const { api } = fakePaystack()
  await invite(store, 'ada', 'bola')
  await client(store, api, { id: 'bola', email: 'bola@example.test' }).pay('plus')
  const meter = createMeter(store, { plans, env }, () => T0 + DAY)
  const status = await meter.status('ada', await getSubscription(store, 'ada'))
  assert.equal(status.period.limit, Math.round((plans.plus.periodNaira * 7) / 30))

  // Then Ada pays for Plus herself: 30 days plus what's left of the week, full allowance.
  const ref = await client(store, api, { id: 'ada', email: 'ada@example.test' }, () => T0 + 2 * DAY).pay('plus')
  assert.ok(ref)
  const paid = await getSubscription(store, 'ada')
  assert.equal(paid.allowanceNaira, undefined)
  assert.equal(Math.round((paid.periodEnd - (T0 + 2 * DAY)) / DAY), 30 + 5)
})
