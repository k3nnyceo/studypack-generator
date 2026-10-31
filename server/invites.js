// Invite friends, earn free days. Every student has a personal link,
// /?ref=i-<code>, which rides on the share-link tracking (server/referrals.js):
// the friend's first sign-in remembers it on their account. Then:
//   - the friend's first one-off payment is FRIEND_DISCOUNT off, and
//   - when they pay for the first time, the inviter gets REWARD_DAYS: added to
//     their paid plan, or a week of Plus (with a week's share of its allowance)
//     if they're on Free.
// Only payments earn rewards, so made-up sign-ups earn nothing.
//
//   studypack:invite:<code>             the inviter's account id
//   studypack:invites:<inviter>:joined  friends who signed up through the link
//   studypack:invites:<inviter>:paid    friends who went on to pay
//   studypack:invites:<inviter>:days    free days earned
//   studypack:invites:discount:<ref>    a Paystack checkout made at the discount
import { createHash } from 'node:crypto'
import { PERIOD_DAYS } from './plans.js'
import { activeSubscription, getSubscription, saveSubscription } from './subscriptions.js'

export const FRIEND_DISCOUNT = 0.2
export const REWARD_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const NO_EXPIRY = 10 * 365 * 24 * 60 * 60
const PREFIX = 'i-'

const stat = (inviter, name) => `studypack:invites:${inviter}:${name}`

// A student's invite code: the same every time, and not their account id.
export const inviteCode = (userId) => PREFIX + BigInt(`0x${createHash('sha256').update(`invite:${userId}`).digest('hex').slice(0, 12)}`).toString(36).slice(0, 7)

export const isInviteRef = (ref) => typeof ref === 'string' && ref.startsWith(PREFIX)

// Makes the student's link work and returns its code.
export async function claimInviteCode(store, userId) {
  const code = inviteCode(userId)
  if (!(await store.getJson(`studypack:invite:${code}`))) await store.setJson(`studypack:invite:${code}`, userId)
  return code
}

// The account behind an invite code, or null.
export async function inviterFor(store, ref) {
  if (!isInviteRef(ref)) return null
  const id = await store.getJson(`studypack:invite:${ref}`)
  return id ? String(id) : null
}

// Who invited this student (from the link on their account), or null.
export async function invitedBy(store, userId) {
  const inviter = await inviterFor(store, await store.getJson(`studypack:account:${userId}:ref`))
  return inviter && inviter !== userId ? inviter : null
}

// A new sign-up through an invite link (called from recordSignup).
export async function recordInvitedSignup(store, userId, ref) {
  const inviter = await inviterFor(store, ref)
  if (inviter && inviter !== userId) await store.add(stat(inviter, 'joined'), 1, NO_EXPIRY)
}

// The share off this student's next one-off payment: FRIEND_DISCOUNT if a
// friend invited them and they've never paid, otherwise 0.
export async function friendDiscount(store, userId) {
  if (await store.get(`studypack:account:${userId}:paid`)) return 0
  return (await invitedBy(store, userId)) ? FRIEND_DISCOUNT : 0
}

export const discountedPrice = (price, discount) => Math.round(price * (1 - discount))

// A Paystack checkout made at the discount, so its smaller amount is accepted.
export const rememberDiscount = (store, reference) => store.claim(`studypack:invites:discount:${reference}`, 30 * 24 * 60 * 60)
export const hadDiscount = async (store, reference) => Boolean(await store.get(`studypack:invites:discount:${reference}`))

// A friend's first payment went through: rewards whoever invited them.
// Resolves to the inviter's id, or null.
export async function rewardInviter(store, payerId, plans, now = Date.now()) {
  const inviter = await invitedBy(store, payerId)
  if (!inviter || !(await store.claim(`studypack:invites:rewarded:${payerId}`, NO_EXPIRY))) return null

  const extra = REWARD_DAYS * DAY_MS
  const weekAllowance = Math.round((plans.plus.periodNaira * REWARD_DAYS) / PERIOD_DAYS)
  const current = activeSubscription(await getSubscription(store, inviter), now)
  const record = current
    ? {
        ...current,
        periodEnd: current.periodEnd + extra,
        // A reward week of Plus grows by another week's allowance; a paid
        // plan's allowance already covers its period.
        ...(current.allowanceNaira !== undefined && { allowanceNaira: current.allowanceNaira + weekAllowance }),
        bonusMs: (current.bonusMs ?? 0) + extra,
      }
    : { plan: 'plus', periodStart: now, periodEnd: now + extra, reference: `invite:${payerId}`, allowanceNaira: weekAllowance, bonusMs: extra }
  await saveSubscription(store, inviter, record)
  await Promise.all([store.add(stat(inviter, 'paid'), 1, NO_EXPIRY), store.add(stat(inviter, 'days'), REWARD_DAYS, NO_EXPIRY)])
  console.log(`[invites] ${payerId} paid: ${inviter} gets ${REWARD_DAYS} days (${record.plan} until ${new Date(record.periodEnd).toISOString()})`)
  return inviter
}

// What a student sees on their invite card.
export async function inviteSummary(store, userId) {
  const [code, joined, paid, days] = await Promise.all([
    claimInviteCode(store, userId),
    store.get(stat(userId, 'joined')),
    store.get(stat(userId, 'paid')),
    store.get(stat(userId, 'days')),
  ])
  return { code, joined, paid, days, rewardDays: REWARD_DAYS, friendDiscount: FRIEND_DISCOUNT }
}
