// Small helpers shared by the API handlers.

export function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

// Vercel parses JSON bodies; the local server passes a parsed object too. A raw
// string body is parsed here; a missing or empty one (a GET or DELETE) is
// null. Returns undefined only if it isn't valid JSON.
export function parseBody(body) {
  if (body === undefined || body === null) return null
  if (typeof body !== 'string') return body
  if (!body.trim()) return null
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}
