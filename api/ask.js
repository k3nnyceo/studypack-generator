// Vercel Function for /api/ask: "Ask about this pack", answers streamed as
// they're written. The logic lives in server/ask.js, shared with the local server.
import { parseBody, sendJson } from '../server/http.js'
import { handleAskRequest } from '../server/ask.js'

// An answer usually takes 5-20 seconds.
export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  const body = parseBody(req.body)
  if (body === undefined) return sendJson(res, 400, { error: 'Invalid JSON body.' })
  await handleAskRequest(req, res, body)
}
