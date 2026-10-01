// Small helpers shared by the API handlers.

export function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(data))
}

// Vercel parses JSON bodies; the local server passes a parsed object too. A raw
// string body is parsed here. Returns undefined if it isn't valid JSON.
export function parseBody(body) {
  if (typeof body !== 'string') return body
  try {
    return JSON.parse(body)
  } catch {
    return undefined
  }
}
