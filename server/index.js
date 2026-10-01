// Local API server for development (`npm run dev`) and self-hosting (`npm start`).
// On Vercel, api/study-guide.js runs the same handler as a function instead.
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { handleAuthRequest } from './auth.js'
import { handleBillingRequest, handlePaystackWebhook } from './billing.js'
import { sendJson } from './http.js'
import { handleLibraryRequest } from './library.js'
import { aiGenerationEnabled, handleJobRequest, handleStudyGuideRequest } from './studyGuideHandler.js'
import { storeFromEnv } from './usageLimits.js'

const PORT = Number(process.env.PORT) || 8787
const MAX_BODY_BYTES = 5 * 1024 * 1024
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname
    if (pathname === '/api/study-guide' && (req.method === 'GET' || req.method === 'DELETE')) {
      await handleJobRequest(req, res)
    } else if (pathname === '/api/study-guide' && req.method === 'POST') {
      const body = await readJson(req, res)
      if (body !== undefined) await handleStudyGuideRequest(req, res, body)
    } else if (pathname === '/api/auth') {
      const body = req.method === 'POST' ? await readJson(req, res) : null
      if (body !== undefined) await handleAuthRequest(req, res, body)
    } else if (pathname === '/api/library') {
      const body = req.method === 'PUT' ? await readJson(req, res) : null
      if (body !== undefined) await handleLibraryRequest(req, res, body)
    } else if (pathname === '/api/billing') {
      const body = req.method === 'POST' ? await readJson(req, res) : null
      if (body !== undefined) await handleBillingRequest(req, res, body)
    } else if (pathname === '/api/paystack-webhook' && req.method === 'POST') {
      await handlePaystackWebhook(req, res, await readBody(req))
    } else if (req.url.startsWith('/api/')) {
      sendJson(res, 404, { error: 'Not found' })
    } else if (req.method === 'GET') {
      await serveStatic(req, res)
    } else {
      sendJson(res, 405, { error: 'Method not allowed' })
    }
  } catch (err) {
    console.error(err)
    if (!res.headersSent) sendJson(res, 500, { error: 'Unexpected server error.' })
    else res.end()
  }
})

// The parsed JSON body, or undefined after answering 400/413.
async function readJson(req, res) {
  try {
    return JSON.parse(await readBody(req))
  } catch (err) {
    sendJson(res, err.status ?? 400, { error: err.status ? err.message : 'Invalid JSON body.' })
    return undefined
  }
}

// Oversized bodies are drained rather than destroyed, so the client still
// receives the 413 response instead of a reset connection.
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0
    let tooLarge = Number(req.headers['content-length']) > MAX_BODY_BYTES
    const chunks = []
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) tooLarge = true
      if (!tooLarge) chunks.push(chunk)
    })
    req.on('end', () => {
      if (tooLarge) reject(Object.assign(new Error('Request body is too large.'), { status: 413 }))
      else resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', reject)
  })
}

// When self-hosting, the same server serves the built frontend from dist/.
async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
  let filePath = path.join(DIST_DIR, urlPath)
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + path.sep)) return sendJson(res, 403, { error: 'Forbidden' })

  let info = await stat(filePath).catch(() => null)
  if (!info?.isFile()) {
    filePath = path.join(DIST_DIR, 'index.html')
    info = await stat(filePath).catch(() => null)
    if (!info) {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      return res.end('Frontend not built. Run "npm run build", or use "npm run dev" during development.')
    }
  }

  res.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath)] ?? 'application/octet-stream' })
  createReadStream(filePath).pipe(res)
}

server.requestTimeout = 0 // generation can take a few minutes for long notes
server.listen(PORT, () => {
  console.log(`StudyPack API listening on http://localhost:${PORT}`)
  if (!aiGenerationEnabled()) {
    console.log('AI generation is off (VITE_ENABLE_AI_GENERATION is not "true"); /api/study-guide is disabled.')
    return
  }
  if (process.env.BEDROCK_API_KEY) {
    console.log(`Claude via Amazon Bedrock (${process.env.BEDROCK_REGION || 'us-east-1'}).`)
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('Warning: no BEDROCK_API_KEY or ANTHROPIC_API_KEY is set. Add one to .env.')
  }
  const upstash = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL
  if (!upstash) {
    console.log(storeFromEnv() ? 'Usage limits: in-memory (dev only; resets on restart).' : 'Usage limits: NOT configured, so generation is refused.')
  }
})
