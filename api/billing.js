// Vercel Function for /api/billing: plans, usage, Paystack checkout. The logic
// lives in server/billing.js, shared with the local dev server.
import { handleBillingRequest } from '../server/billing.js'
import { parseBody, sendJson } from '../server/http.js'

export default async function handler(req, res) {
  const body = parseBody(req.body)
  if (body === undefined) return sendJson(res, 400, { error: 'Invalid JSON body.' })
  await handleBillingRequest(req, res, body)
}
