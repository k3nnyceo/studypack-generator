// Vercel Function for /api/youtube: a YouTube lecture's captions as notes.
// The logic lives in server/youtube.js, shared with the local dev server.
import { parseBody, sendJson } from '../server/http.js'
import { handleYoutubeRequest } from '../server/youtube.js'

// Long videos are a Supadata job, polled for up to 45 seconds.
export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  const body = parseBody(req.body)
  if (body === undefined) return sendJson(res, 400, { error: 'Invalid JSON body.' })
  await handleYoutubeRequest(req, res, body)
}
