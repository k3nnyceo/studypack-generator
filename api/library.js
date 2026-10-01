// Vercel Function for /api/library: a signed-in student's synced study pack
// library. The logic lives in server/library.js, shared with the local dev server.
import { parseBody, sendJson } from '../server/http.js'
import { handleLibraryRequest } from '../server/library.js'

export default async function handler(req, res) {
  const body = parseBody(req.body)
  if (body === undefined) return sendJson(res, 400, { error: 'Invalid JSON body.' })
  await handleLibraryRequest(req, res, body)
}
