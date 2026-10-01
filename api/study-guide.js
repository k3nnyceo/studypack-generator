// Vercel Function for /api/study-guide: POST starts a generation job, GET and
// DELETE (?job=<id>) read or cancel it. The logic lives in
// server/studyGuideHandler.js, shared with the local dev server.
import { handleJobRequest, handleStudyGuideRequest, sendJson } from '../server/studyGuideHandler.js'

// The job keeps running after the POST is answered (waitUntil), within this
// limit. Generation takes a minute or two; 300s is the Hobby plan's maximum.
export const config = { maxDuration: 300 }

export default async function handler(req, res) {
  if (req.method === 'GET' || req.method === 'DELETE') return handleJobRequest(req, res)
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
