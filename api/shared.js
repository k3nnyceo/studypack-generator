// Vercel Function for /api/shared: the Pack library. The logic lives in
// server/shared.js, shared with the local dev server.
import { getDefaults } from '../server/billing.js'
import { parseBody, sendJson } from '../server/http.js'
import { handleSharedRequest } from '../server/shared.js'

export default async function handler(req, res) {
  const body = parseBody(req.body)
  if (body === undefined) return sendJson(res, 400, { error: 'Invalid JSON body.' })
  await handleSharedRequest(req, res, body, { store: getDefaults().store })
}
