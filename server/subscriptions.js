// Paid plans per account, stored with the usage meter's store (Upstash).
//
// Every successful payment grants a 30-day period of Pro or Max, whether it
// was a one-time payment (card, bank transfer, USSD) or a monthly card charge
// by a Paystack subscription ("auto-renew"). A record looks like
//   studypack:sub:<user>        { plan, periodStart, periodEnd, reference }
//   studypack:autorenew:<user>  { subscriptionCode, emailToken, plan, active }
// and payments are applied once each, by Paystack reference.
import { AUTO_RENEW_GRACE_DAYS, PERIOD_DAYS } from './plans.js'

const DAY_MS = 24 * 60 * 60 * 1000
const YEAR_SECONDS = 365 * 24 * 60 * 60

const subKey = (userId) => `studypack:sub:${userId}`
const autoRenewKey = (userId) => `studypack:autorenew:${userId}`

export const getSubscription = (store, userId) => store.getJson(subKey(userId))
export const getAutoRenew = (store, userId) => store.getJson(autoRenewKey(userId))

// The record if its period hasn't ended, otherwise null (the account is on Free).
export const activeSubscription = (record, now = Date.now()) => (record && record.periodEnd > now ? record : null)

// Links a Paystack customer to an account, so renewal charges (which carry no
// metadata of ours) find the right student.
export const rememberCustomer = (store, { email, customerCode }, userId) =>
  Promise.all([
    email && store.setJson(`studypack:email:${email.toLowerCase()}`, userId),
    customerCode && store.setJson(`studypack:customer:${customerCode}`, userId),
  ])

export async function findUser(store, { customerCode, email }) {
  return (
    (customerCode && (await store.getJson(`studypack:customer:${customerCode}`))) ||
    (email && (await store.getJson(`studypack:email:${email.toLowerCase()}`))) ||
    null
  )
}

// Applies a successful payment. Resolves to { applied, record, previous }:
// `applied` is false if this reference was already applied.
//
// Paying again on the same plan starts a fresh 30-day period (the monthly
// allowance resets) and keeps any days left. Switching plan converts the days
// left into the new plan's days by price, so nothing paid for is lost. A card
// auto-renewal starts a fresh period with a couple of days' grace instead,
// since Paystack bills by calendar month.
export async function applyPayment(store, { userId, planId, reference, autoRenew = false }, plans, now = Date.now()) {
  if (!(await store.claim(`studypack:paid:${reference}`, YEAR_SECONDS))) return { applied: false }

  const previous = activeSubscription(await getSubscription(store, userId), now)
  let carryMs = 0
  if (previous && !autoRenew) {
    const left = previous.periodEnd - now
    carryMs = previous.plan === planId ? left : (left * plans[previous.plan].price) / plans[planId].price
  }
  const days = PERIOD_DAYS + (autoRenew ? AUTO_RENEW_GRACE_DAYS : 0)
  const record = {
    plan: planId,
    periodStart: now,
    periodEnd: now + days * DAY_MS + Math.round(carryMs),
    reference,
  }
  await store.setJson(subKey(userId), record)
  return { applied: true, record, previous }
}

export async function setAutoRenew(store, userId, fields) {
  const current = (await getAutoRenew(store, userId)) ?? {}
  await store.setJson(autoRenewKey(userId), { ...current, ...fields })
}
