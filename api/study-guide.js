// Vercel Function for POST /api/study-guide. The logic lives in
// server/studyGuideHandler.js, shared with the local dev server.
import { handleStudyGuideRequest, sendJson } from '../server/studyGuideHandler.js'

// Generation can take a minute or two; 300s is the Hobby plan's maximum.
export const config = { maxDuration: 300 }

export default async function handler(req, res) {
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
  // Vercel parses JSON bodies; fall back to parsing a raw string body.
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return sendJson(res, 400, { error: 'Invalid JSON body.' })
    }
  }
  await handleStudyGuideRequest(req, res, body)
}
