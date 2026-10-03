// A small client for Paystack's API (https://paystack.com/docs/api). The
// secret key is read from the server's environment and never reaches the
// browser. Test keys (sk_test_…) move no real money.
import { createHmac, timingSafeEqual } from 'node:crypto'

const API = 'https://api.paystack.co'

export const paystackKey = (env = process.env) => env.PAYSTACK_SECRET_KEY || ''

export class PaystackError extends Error {}

export async function paystack(path, { method = 'GET', body, env = process.env } = {}) {
  const key = paystackKey(env)
  if (!key) throw new PaystackError('PAYSTACK_SECRET_KEY is not set')
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${key}`, ...(body && { 'Content-Type': 'application/json' }) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.status) throw new PaystackError(`Paystack ${method} ${path.split('?')[0]} failed (${res.status}): ${data?.message ?? 'no response'}`)
  return data.data
}

// The Paystack plan code for auto-renewing a StarterPack plan, creating the
// Paystack plan the first time it's needed (separately in test and live
// mode). Matched by name and price, so changing a price makes a new plan.
const planCodes = new Map()
export async function ensurePaystackPlan(plan, env = process.env, api = paystack) {
  const name = `StarterPack ${plan.name}`
  const amount = plan.price * 100
  const cacheKey = `${paystackKey(env).slice(0, 8)}:${name}:${amount}`
  if (planCodes.has(cacheKey)) return planCodes.get(cacheKey)
  const existing = (await api('/plan?perPage=100', { env })).find(
    (p) => p.name === name && p.amount === amount && p.interval === 'monthly' && !p.is_deleted && !p.is_archived,
  )
  const code = existing?.plan_code ?? (await api('/plan', { method: 'POST', body: { name, amount, interval: 'monthly', currency: 'NGN' }, env })).plan_code
  planCodes.set(cacheKey, code)
  return code
}

// Paystack signs each webhook with HMAC-SHA512 of the body, keyed by the secret key.
export function validSignature(rawBody, signature, env = process.env) {
  const key = paystackKey(env)
  if (!key || typeof signature !== 'string') return false
  const expected = createHmac('sha512', key).update(rawBody).digest()
  const given = Buffer.from(signature, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}
