// Vercel Function for /api/auth: Google sign-in (POST), the current session
// (GET) and sign out (DELETE). The logic lives in server/auth.js, shared with
// the local dev server.
import { handleAuthRequest } from '../server/auth.js'
import { parseBody, sendJson } from '../server/http.js'

export default async function handler(req, res) {
  const body = parseBody(req.body)
  if (body === undefined) return sendJson(res, 400, { error: 'Invalid JSON body.' })
  await handleAuthRequest(req, res, body)
}
