import Anthropic from '@anthropic-ai/sdk'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateStudyGuide, MAX_INPUT_CHARS, StudyGuideError } from './studyGuide.js'

const PORT = Number(process.env.PORT) || 8787
// Same flag the frontend reads (src/config.js). While it's off, the server never calls Claude.
const AI_GENERATION_ENABLED = process.env.VITE_ENABLE_AI_GENERATION === 'true'
const MAX_BODY_BYTES = 5 * 1024 * 1024
const DIST_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/api/study-guide' && req.method === 'POST') {
      await handleStudyGuide(req, res)
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
  }
})

async function handleStudyGuide(req, res) {
  if (!AI_GENERATION_ENABLED) {
    return sendJson(res, 503, {
      error: 'AI generation is turned off. Set VITE_ENABLE_AI_GENERATION=true in .env to enable it.',
    })
  }

  let body
  try {
    body = JSON.parse(await readBody(req))
  } catch (err) {
    return sendJson(res, err.status ?? 400, { error: err.status ? err.message : 'Invalid JSON body.' })
  }

  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) {
    return sendJson(res, 400, { error: 'No text was provided.' })
  }
  if (text.length > MAX_INPUT_CHARS) {
    return sendJson(res, 413, {
      error: 'These notes are too long to process in one go. Try splitting them into smaller files.',
    })
  }

  const started = Date.now()
  try {
    const guide = await generateStudyGuide({ text, fileName: body.fileName })
    console.log(`Generated study guide for "${body.fileName}" in ${((Date.now() - started) / 1000).toFixed(1)}s`)
    sendJson(res, 200, guide)
  } catch (err) {
    const { status, message } = toClientError(err)
    console.error(`Study guide generation failed (${status}):`, err.message)
    sendJson(res, status, { error: message })
  }
}

// Maps SDK errors to messages that are safe and useful to show a student.
function toClientError(err) {
  if (err instanceof StudyGuideError) {
    return { status: err.status, message: err.message }
  }
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
    return { status: 500, message: 'The server’s Claude API key is missing or invalid.' }
  }
  if (err instanceof Anthropic.RateLimitError) {
    return { status: 429, message: 'StudyPack is busy right now. Please try again in a minute.' }
  }
  if (err instanceof Anthropic.BadRequestError) {
    return { status: 400, message: 'Claude couldn’t process this document.' }
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return { status: 502, message: 'Couldn’t reach Claude. Check the server’s network connection.' }
  }
  if (err instanceof Anthropic.APIError) {
    return { status: 502, message: 'Claude is temporarily unavailable. Please try again.' }
  }
  // Thrown by the SDK constructor when no credentials are configured.
  if (err instanceof Anthropic.AnthropicError) {
    return { status: 500, message: 'The server’s Claude API key is missing or invalid.' }
  }
  return { status: 500, message: 'Something went wrong generating the study guide.' }
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

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(data))
}

// In production the same server hosts the built frontend from dist/.
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
  if (!AI_GENERATION_ENABLED) {
    console.log('AI generation is off (VITE_ENABLE_AI_GENERATION is not "true"); /api/study-guide is disabled.')
  } else if (!process.env.ANTHROPIC_API_KEY) {
    console.warn('Warning: ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.')
  }
})
