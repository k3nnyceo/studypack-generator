// Vercel Function for /api/transcribe: reads scanned or photographed pages
// (Max). The logic lives in server/transcribe.js, shared with the local server.
import { parseBody, sendJson } from '../server/http.js'
import { handleTranscribeRequest } from '../server/transcribe.js'

// Five pages take Haiku roughly 15-30 seconds.
export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  const body = parseBody(req.body)
  if (body === undefined) return sendJson(res, 400, { error: 'Invalid JSON body.' })
  await handleTranscribeRequest(req, res, body)
}
