// /api/billing and /api/paystack-webhook, shared by the Vercel functions and
// the local dev server.
//
//   GET  /api/billing                            plans, the account's plan and its usage
//   POST /api/billing { action: 'checkout', plan, autoRenew }  -> { url } of Paystack's checkout
//   POST /api/billing { action: 'verify', reference }          after returning from checkout
//   POST /api/billing { action: 'manage' }       -> { url } to cancel auto-renew or change card
//   POST /api/billing { action: 'redeem', key }  a Gumroad license key (server/gumroad.js)
//   POST /api/paystack-webhook                   Paystack's events (renewals, cancellations)
//
// A payment is applied when either the student returns from checkout (verify)
// or Paystack's webhook arrives, whichever is first; both check the
// transaction with Paystack's API rather than trusting what they're told.
import { getSessionUser } from './auth.js'
import { cleanLicenseKey, gumroadProducts, purchaseNaira, purchaseProblem, verifyGumroadKey } from './gumroad.js'
import { recordPayment } from './referrals.js'
import { sendJson } from './http.js'
import { ensurePaystackPlan, paystack, paystackKey, validSignature } from './paystack.js'
import { estimateCostUsd, PAID_PLANS, plansFromEnv, toNaira } from './plans.js'
import {
  activeSubscription,
  applyPayment,
  findUser,
  getAutoRenew,
  getSubscription,
  rememberCustomer,
  setAutoRenew,
} from './subscriptions.js'
import { createMeter, storeFromEnv } from './usageLimits.js'

// "About N packs", for the plan cards: a typical 23-page lecture.
const TYPICAL_PACK_CHARS = 11_000

let defaults
// The store and meter shared by billing and generation.
export function getDefaults() {
  if (!defaults) {
    const store = storeFromEnv()
    defaults = { store, meter: store && createMeter(store, { siteDailyCap: Number(process.env.GUIDES_PER_DAY_TOTAL) || 20 }) }
  }
  return defaults
}

export async function handleBillingRequest(req, res, body, deps = {}) {
  const {
    store = getDefaults().store,
    meter = getDefaults().meter,
    getUser = getSessionUser,
    env = process.env,
    api = paystack,
    gumroad = verifyGumroadKey,
    now = Date.now,
  } = deps
  const user = await getUser(req)
  // Signed out, the plans can still be shown; buying needs an account.
  if (!user && req.method === 'GET') return sendJson(res, 200, publicState(env))
  if (!user) return sendJson(res, 401, { error: 'Sign in to choose a plan.' })
  if (!store || !meter) return sendJson(res, 503, { error: 'Plans aren’t available right now.' })

  try {
    if (req.method === 'GET') return sendJson(res, 200, await billingState({ store, meter, user, env, now }))
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

    const plans = plansFromEnv(env)
    if (body?.action === 'checkout') {
      const plan = plans[body.plan]
      if (!PAID_PLANS.includes(body.plan)) return sendJson(res, 400, { error: 'Unknown plan.' })
      if (!paystackKey(env)) return sendJson(res, 503, { error: 'Payments aren’t set up yet.' })
      if (!user.email) return sendJson(res, 400, { error: 'Your Google account has no email address for the receipt.' })

      const autoRenew = body.autoRenew === true
      await rememberCustomer(store, { email: user.email }, user.id)
      const checkout = await api('/transaction/initialize', {
        method: 'POST',
        env,
        body: {
          email: user.email,
          amount: plan.price * 100,
          currency: 'NGN',
          callback_url: `${siteUrl(req, env)}/?billing=return`,
          metadata: { userId: user.id, plan: plan.id, autoRenew },
          // With a plan, Paystack makes it a monthly card subscription.
          ...(autoRenew && { plan: await ensurePaystackPlan(plan, env, api) }),
        },
      })
      return sendJson(res, 200, { url: checkout.authorization_url })
    }

    if (body?.action === 'verify') {
      const reference = typeof body.reference === 'string' ? body.reference : ''
      if (!/^[\w.=-]{1,100}$/.test(reference)) return sendJson(res, 400, { error: 'Invalid payment reference.' })
      const result = await applyTransaction({ store, reference, env, api, plans, now, expectUser: user.id })
      if (result.error) return sendJson(res, result.status, { error: result.error })
      return sendJson(res, 200, await billingState({ store, meter, user, env, now }))
    }

    if (body?.action === 'redeem') {
      const result = await redeemGumroadKey({ store, user, key: body.key, env, gumroad, plans, now })
      if (result.error) return sendJson(res, result.status, { error: result.error })
      return sendJson(res, 200, await billingState({ store, meter, user, env, now }))
    }

    if (body?.action === 'manage') {
      const renew = await getAutoRenew(store, user.id)
      if (!renew?.active || !renew.subscriptionCode) return sendJson(res, 400, { error: 'You don’t have auto-renew turned on.' })
      const { link } = await api(`/subscription/${encodeURIComponent(renew.subscriptionCode)}/manage/link`, { env })
      return sendJson(res, 200, { url: link })
    }
    return sendJson(res, 400, { error: 'Unknown action.' })
  } catch (err) {
    console.error('[billing]', err.message)
    return sendJson(res, 502, { error: 'Couldn’t reach the payment service. Please try again.' })
  }
}

function publicState(env) {
  const typicalFor = (p) => toNaira(estimateCostUsd(TYPICAL_PACK_CHARS, p.theory), env)
  const gumroad = gumroadProducts(env)
  return {
    paymentsEnabled: Boolean(paystackKey(env)),
    // Gumroad product pages (for paying in dollars), by plan.
    gumroad: Object.fromEntries(Object.entries(gumroad).map(([plan, p]) => [plan, p.url])),
    plans: Object.values(plansFromEnv(env)).map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      // Whole packs that really fit, so the plans page never promises more.
      packsPerWindow: Math.max(1, Math.floor(p.windowNaira / typicalFor(p))),
      packsPerMonth: Math.max(1, Math.floor(p.periodNaira / typicalFor(p))),
      maxPages: Math.round(p.maxChars / 500),
      libraryPerDay: p.libraryPerDay,
      youtubePerWindow: p.youtubePerWindow,
      youtubePerMonth: p.youtubePerMonth,
      theory: p.theory,
      scans: p.scans,
      paste: p.paste,
    })),
  }
}

async function billingState({ store, meter, user, env, now }) {
  const subscription = activeSubscription(await getSubscription(store, user.id), now())
  const [usage, renew] = await Promise.all([meter.status(user.id, subscription), getAutoRenew(store, user.id)])
  const percent = ({ used, limit }) => (limit ? Math.min(100, Math.round((used / limit) * 100)) : 100)
  return {
    ...publicState(env),
    plan: usage.plan,
    periodEnd: subscription?.periodEnd ?? null,
    autoRenew: Boolean(subscription && renew?.active && renew.plan === subscription.plan),
    // Shares, not naira: students see how much is left, not what it costs.
    usage: {
      window: { percent: percent(usage.window), resetsAt: usage.window.resetsAt },
      period: { percent: percent(usage.period), resetsAt: usage.period.resetsAt },
    },
  }
}

// Checks a transaction with Paystack and applies it. Resolves to {} or
// { status, error }. `expectUser` (on verify) refuses someone else's payment.
async function applyTransaction({ store, reference, env, api, plans, now, expectUser }) {
  const tx = await api(`/transaction/verify/${encodeURIComponent(reference)}`, { env })
  if (tx.status !== 'success') return { status: 402, error: 'This payment hasn’t gone through.' }

  const meta = typeof tx.metadata === 'string' ? safeJson(tx.metadata) : tx.metadata
  const customerCode = tx.customer?.customer_code
  const email = tx.customer?.email
  const userId = meta?.userId || (await findUser(store, { customerCode, email }))
  if (!userId) {
    console.error(`[billing] Payment ${reference} has no StudyPack account.`)
    return { status: 404, error: 'This payment isn’t linked to a StudyPack account.' }
  }
  if (expectUser && userId !== expectUser) return { status: 403, error: 'This payment belongs to another account.' }

  const planCode = typeof tx.plan === 'string' ? tx.plan : tx.plan?.plan_code
  const planId = meta?.plan ?? (await planIdForCode(planCode, plans, env, api))
  const plan = plans[planId]
  if (!PAID_PLANS.includes(planId) || tx.currency !== 'NGN' || tx.amount < plan.price * 100) {
    console.error(`[billing] Payment ${reference} doesn't match a plan (plan=${planId} amount=${tx.amount} ${tx.currency}).`)
    return { status: 400, error: 'This payment doesn’t match a StudyPack plan.' }
  }

  await rememberCustomer(store, { email, customerCode }, userId)
  const autoRenew = Boolean(planCode)
  const { applied, record, previous } = await applyPayment(store, { userId, planId, reference, autoRenew }, plans, now())
  if (applied) {
    await recordPayment(store, userId, tx.amount / 100).catch((err) => console.error('[billing] Could not record referral:', err.message))
    console.log(`[billing] ${reference}: ${userId} on ${planId} until ${new Date(record.periodEnd).toISOString()}${autoRenew ? ' (auto-renew)' : ''}`)
    // A plan change ends the old plan's card subscription, so it isn't charged again.
    const renew = await getAutoRenew(store, userId)
    if (previous && previous.plan !== planId && renew?.active && renew.plan === previous.plan) {
      await api('/subscription/disable', { method: 'POST', env, body: { code: renew.subscriptionCode, token: renew.emailToken } }).catch((err) =>
        console.error('[billing] Could not stop the old subscription:', err.message),
      )
      await setAutoRenew(store, userId, { active: false })
    }
  }
  return {}
}

// Checks a Gumroad key against each plan's product and grants that plan.
// Resolves to {} or { status, error }.
async function redeemGumroadKey({ store, user, key: raw, env, gumroad, plans, now }) {
  const products = gumroadProducts(env)
  if (!Object.keys(products).length) return { status: 503, error: 'Gumroad keys aren’t set up yet.' }
  const key = cleanLicenseKey(raw)
  if (!key) return { status: 400, error: 'That doesn’t look like a Gumroad license key.' }

  let planId = null
  let purchase = null
  for (const [plan, { productId }] of Object.entries(products)) {
    purchase = await gumroad(productId, key)
    if (purchase) {
      planId = plan
      break
    }
  }
  if (!purchase) return { status: 404, error: 'That key isn’t valid for StudyPack. Check it against your Gumroad receipt.' }
  const problem = purchaseProblem(purchase, env)
  if (problem) return { status: 402, error: problem }

  // One account per key: the first to redeem it keeps it. Redeeming again on
  // the same account is harmless (the payment is applied once).
  const ownerKey = `studypack:gumroad:${key}`
  if (await store.claim(`${ownerKey}:claimed`, 10 * 365 * 24 * 60 * 60)) {
    await store.setJson(ownerKey, user.id)
  } else if ((await store.getJson(ownerKey)) !== user.id) {
    return { status: 409, error: 'This key has already been used by another StudyPack account.' }
  }

  const reference = `gumroad:${purchase.sale_id || key}`
  const { applied, record } = await applyPayment(store, { userId: user.id, planId, reference }, plans, now())
  if (applied) {
    await recordPayment(store, user.id, purchaseNaira(purchase, env)).catch((err) => console.error('[billing] Could not record referral:', err.message))
    console.log(`[billing] ${reference}: ${user.id} on ${planId} until ${new Date(record.periodEnd).toISOString()} (Gumroad)`)
  }
  return {}
}

async function planIdForCode(planCode, plans, env, api) {
  if (!planCode) return null
  for (const id of PAID_PLANS) {
    if ((await ensurePaystackPlan(plans[id], env, api).catch(() => null)) === planCode) return id
  }
  return null
}

// Paystack's events. Payments are re-checked with the API; subscription events
// are taken from the signed body.
export async function handlePaystackWebhook(req, res, rawBody, deps = {}) {
  const { store = getDefaults().store, env = process.env, api = paystack, now = Date.now } = deps
  if (!validSignature(rawBody, req.headers['x-paystack-signature'], env)) {
    console.error('[billing] Webhook with a bad signature ignored.')
    return sendJson(res, 401, { error: 'Bad signature' })
  }
  if (!store) return sendJson(res, 503, { error: 'Unavailable' })
  const event = safeJson(rawBody)
  const data = event?.data ?? {}

  try {
    if (event?.event === 'charge.success') {
      const result = await applyTransaction({ store, reference: data.reference, env, api, plans: plansFromEnv(env), now })
      if (result.error) console.error(`[billing] Webhook payment ${data.reference}: ${result.error}`)
    } else if (event?.event === 'subscription.create' || event?.event === 'subscription.enable') {
      const userId = await findUser(store, { customerCode: data.customer?.customer_code, email: data.customer?.email })
      const planId = await planIdForCode(data.plan?.plan_code, plansFromEnv(env), env, api)
      if (userId && planId) {
        await setAutoRenew(store, userId, { subscriptionCode: data.subscription_code, emailToken: data.email_token, plan: planId, active: true })
      }
    } else if (event?.event === 'subscription.not_renew' || event?.event === 'subscription.disable') {
      const userId = await findUser(store, { customerCode: data.customer?.customer_code, email: data.customer?.email })
      const renew = userId && (await getAutoRenew(store, userId))
      if (renew?.subscriptionCode === data.subscription_code) await setAutoRenew(store, userId, { active: false })
    }
  } catch (err) {
    // A 5xx makes Paystack retry later.
    console.error('[billing] Webhook failed:', err.message)
    return sendJson(res, 500, { error: 'Try again' })
  }
  sendJson(res, 200, { ok: true })
}

// Where Paystack sends the student back. SITE_URL if set, else this request's host.
function siteUrl(req, env) {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/+$/, '')
  const proto = req.headers['x-forwarded-proto']?.split(',')[0] || (req.socket?.encrypted ? 'https' : 'http')
  return `${proto}://${req.headers['x-forwarded-host'] || req.headers.host}`
}

function safeJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
