// Pro and Max sold on Gumroad, for students paying in dollars from outside
// Nigeria. Each Gumroad product ("30 days of StarterPack Pro") has license keys
// turned on; the buyer gets a key in their receipt and redeems it on the plans
// page, which grants 30 days of the plan. A key works for one account, once.
//
// Keys are checked with Gumroad's license API, which needs no secret: the
// product id plus the key is the proof of purchase.
import { nairaPerUsd } from './plans.js'

const VERIFY_URL = 'https://api.gumroad.com/v2/licenses/verify'
const KEY = /^[A-Za-z0-9-]{8,64}$/

// { pro: { productId, url }, max: … } for the plans that are set up.
export function gumroadProducts(env = process.env) {
  const products = {}
  for (const plan of ['pro', 'max']) {
    const productId = env[`GUMROAD_${plan.toUpperCase()}_PRODUCT_ID`]
    if (productId) products[plan] = { productId, url: env[`GUMROAD_${plan.toUpperCase()}_URL`] || '' }
  }
  return products
}

export const cleanLicenseKey = (value) => {
  const key = typeof value === 'string' ? value.trim().toUpperCase() : ''
  return KEY.test(key) ? key : null
}

// Gumroad's answer for a key, or null if it isn't a key for this product.
export async function verifyGumroadKey(productId, key) {
  const res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ product_id: productId, license_key: key, increment_uses_count: 'false' }),
  })
  const data = await res.json().catch(() => null)
  if (res.status === 404 || data?.success === false) return null
  if (!res.ok || !data?.purchase) throw new Error(`Gumroad license check failed (${res.status})`)
  return data.purchase
}

// Why a purchase can't be redeemed, or null if it can.
export function purchaseProblem(purchase, env = process.env) {
  if (purchase.refunded || purchase.chargebacked || purchase.disputed) return 'This purchase was refunded or disputed, so its key no longer works.'
  if (purchase.test && env.GUMROAD_ALLOW_TEST !== 'true') return 'That’s a Gumroad test purchase, which can’t be redeemed.'
  return null
}

// The sale in naira, for referral revenue (Gumroad prices are in cents).
export function purchaseNaira(purchase, env = process.env) {
  const amount = Number(purchase.price) / 100
  return String(purchase.currency).toLowerCase() === 'usd' && Number.isFinite(amount) ? Math.round(amount * nairaPerUsd(env)) : 0
}
