// Link previews for shared packs. A pack link (/?pack=<id>, src/lib/shareLinks.js)
// is sent here by middleware.js on Vercel (and by server/index.js locally):
//
//   GET /api/pack-page?pack=<id>  the app's page with that pack's title,
//                                 description and picture in its preview tags
//   GET /api/og?pack=<id>         the picture: a 1200×630 PNG (server/shareCard.js)
//
// The page is the same app, so visitors get StudyPack as usual; only what
// X, WhatsApp and others show under the link changes. An unknown pack gets
// the normal page and picture.
import { readFile } from 'node:fs/promises'
import { siteUrl } from './billing.js'
import { sendJson } from './http.js'
import { packCardImage } from './shareCard.js'
import { packSummary } from './shared.js'
import { packLabel } from '../src/lib/shareLinks.js'

const escapeAttr = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

// The built page. Locally it's dist/index.html; on Vercel the function can't
// see the static files, so it fetches the site's own page (kept for a while).
let cached = null
export async function loadIndexHtml(origin, { fetchImpl = fetch, now = Date.now } = {}) {
  if (cached && cached.origin === origin && now() - cached.at < 5 * 60 * 1000) return cached.html
  let html
  try {
    html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
  } catch {
    const res = await fetchImpl(`${origin}/index.html`, { headers: { Accept: 'text/html' } })
    if (!res.ok) throw new Error(`index.html answered ${res.status}`)
    html = await res.text()
  }
  cached = { origin, html, at: now() }
  return html
}

// The page with a pack's preview tags in place of the site's.
export function withPackPreview(html, pack, origin) {
  const label = packLabel({ course: pack.course, title: pack.topic || pack.title })
  const topic = pack.topic || pack.title || ''
  const title = `${label}: free study pack${topic && topic !== label ? ` · ${topic}` : ''} | StudyPack`
  const description = `Study guide, worked examples, flashcards and a quiz for ${pack.course || pack.title || label}. Free on StudyPack.`
  const url = `${origin}/?pack=${pack.id}`
  const image = `${origin}/api/og?pack=${pack.id}`
  const set = (pattern, value) => {
    html = html.replace(pattern, (_m, start, end) => `${start}${escapeAttr(value)}${end}`)
  }
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeAttr(title)}</title>`)
  set(/(<meta name="description" content=")[^"]*(")/, description)
  set(/(<meta property="og:title" content=")[^"]*(")/, title)
  set(/(<meta property="og:description" content=")[^"]*(")/, description)
  set(/(<meta property="og:url" content=")[^"]*(")/, url)
  set(/(<meta property="og:image" content=")[^"]*(")/, image)
  set(/(<meta property="og:image:alt" content=")[^"]*(")/, `${label} study pack on StudyPack`)
  set(/(<meta name="twitter:title" content=")[^"]*(")/, title)
  set(/(<meta name="twitter:description" content=")[^"]*(")/, description)
  set(/(<meta name="twitter:image" content=")[^"]*(")/, image)
  return html
}

const packIdOf = (req) => new URL(req.url, 'http://localhost').searchParams.get('pack')

export async function handlePackPage(req, res, { store, env = process.env, load = loadIndexHtml } = {}) {
  const origin = siteUrl(req, env)
  let html
  try {
    html = await load(origin)
  } catch (err) {
    console.error('[pack-page]', err.message)
    // Without the page, send the visitor to the app itself.
    res.writeHead(302, { Location: `/#/explore` })
    return res.end()
  }
  const pack = await packSummary(store, packIdOf(req)).catch(() => null)
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=600' })
  res.end(pack ? withPackPreview(html, pack, origin) : html)
}

export async function handleOgImage(req, res, { store, render = packCardImage } = {}) {
  const pack = await packSummary(store, packIdOf(req)).catch(() => null)
  if (!pack) {
    res.writeHead(302, { Location: '/og-image.jpg' })
    return res.end()
  }
  try {
    const png = Buffer.from(await render(pack).arrayBuffer())
    res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': png.length, 'Cache-Control': 'public, max-age=86400, s-maxage=86400' })
    res.end(png)
  } catch (err) {
    console.error('[og]', err.message)
    sendJson(res, 500, { error: 'Couldn’t draw the picture.' })
  }
}
