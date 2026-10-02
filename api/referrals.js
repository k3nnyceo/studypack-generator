// Vercel Function for /api/referrals: visits through share links, and the
// stats for admins. The logic lives in server/referrals.js.
import { parseBody, sendJson } from '../server/http.js'
import { handleReferralRequest } from '../server/referrals.js'
import { storeFromEnv } from '../server/usageLimits.js'

const store = storeFromEnv()

export default async function handler(req, res) {
  const body = parseBody(req.body)
  if (body === undefined) return sendJson(res, 400, { error: 'Invalid JSON body.' })
  await handleReferralRequest(req, res, body, { store })
}
