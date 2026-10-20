// Phase 2 of the source viewer: on paid plans, the pages of a lecture that are
// mostly diagrams, graphs or pictures are shown to the AI as images, so the
// pack can explain them instead of only the text around them. Everything here
// runs on the device; only the chosen pictures are sent, with the notes.
//
//   findDiagramPages(result) -> candidates, best first, without rendering
//   renderDiagramPages(result, candidates) -> [{ ref, unit, mediaType, data }]
//
// PDFs: each page's drawing instructions (pdf.js operator list) show how much
// of it is covered by pictures, and how many lines and shapes are drawn beyond
// the text (exports from PowerPoint and Word draw a shape with most runs of
// text) and beyond what the template draws on every page. PowerPoints: a slide's own pictures,
// by how much of the slide they cover; pictures repeated on many slides
// (logos, title backgrounds) are skipped. Scans and photos are already read
// as pictures (server/transcribe.js), so they get nothing extra.

import { SHOWABLE_IMAGE } from './parsePptx.js'
import { toJpeg } from './scanPages.js'

// Large enough to read labels on a diagram, small enough that ten pages stay
// well inside one request (about 120-250 KB each).
const MAX_SIDE = 1200
// A picture has to cover this much of the page to count (logos don't).
const MIN_PICTURE_SHARE = 0.08
// Lines and shapes beyond the page's usual template that make a vector diagram.
const MIN_EXTRA_PATHS = 15
// Runs of text below which page 1 or 2 is a cover or title slide.
const MIN_COVER_TEXTS = 12
// A picture on this many slides or more is part of the template.
const REPEATED_ON = 3

export const DIAGRAM_SOURCE_TYPES = ['pdf', 'pptx']

// Whether a notes result can have diagram pages at all.
export const canSendDiagrams = (result) =>
  Boolean(result?.file) && DIAGRAM_SOURCE_TYPES.includes(result.type) && !result.scanned

// Candidates, best first: [{ ref, unit, score, kind: 'page' | 'picture', path? }].
export async function findDiagramPages(result, { signal } = {}) {
  if (!canSendDiagrams(result)) return []
  return result.type === 'pdf' ? findInPdf(result.file, signal) : findInPptx(result.sections)
}

async function findInPdf(file, signal) {
  const { loadPdf, pdfjs } = await import('./pdfjs.js')
  const { OPS } = pdfjs
  const { doc, destroy } = await loadPdf(file)
  try {
    const pages = []
    for (let n = 1; n <= doc.numPages; n++) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const page = await doc.getPage(n)
      const { width, height } = page.getViewport({ scale: 1 })
      const ops = await page.getOperatorList()
      pages.push({ n, ...measure(ops, OPS, width * height) })
      page.cleanup()
    }
    // Every page of a slide deck draws the same rules and boxes: only lines
    // and shapes beyond the usual count suggest a diagram.
    const shapes = (p) => Math.max(0, p.paths - p.texts)
    const usual = median(pages.map(shapes))
    // A picture on more than one page (a logo, a title photo) is decoration.
    const pagesWith = new Map()
    for (const p of pages) for (const key of new Set(p.pictures.map((pic) => pic.key))) pagesWith.set(key, (pagesWith.get(key) ?? 0) + 1)
    return pages
      .map((p) => {
        const { n } = p
        const pictures = p.pictures.filter((pic) => !pic.key || pagesWith.get(pic.key) < 2).reduce((sum, pic) => sum + pic.share, 0)
        const extra = Math.max(0, shapes(p) - usual)
        // The first pages with hardly any text are the cover and title slides.
        if (n <= 2 && p.texts < MIN_COVER_TEXTS && extra < MIN_EXTRA_PATHS) return null
        const isDiagram = pictures >= MIN_PICTURE_SHARE || extra >= MIN_EXTRA_PATHS
        return isDiagram && { ref: n, unit: 'Page', kind: 'page', score: Math.min(1, pictures) * 100 + Math.min(extra, 200) / 2 }
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score)
  } finally {
    await destroy()
  }
}

// The pictures on a page ({ key, share }: their pixel size, to spot the same
// picture on other pages, and the share of the page they cover), and the
// number of paths and of runs of text drawn. Pictures are drawn into a unit square, so their area
// on the page is the determinant of the transform in force at the time.
function measure(ops, OPS, pageArea) {
  const TEXT_OPS = new Set([OPS.showText, OPS.showSpacedText, OPS.nextLineShowText, OPS.nextLineSetSpacingShowText])
  let ctm = [1, 0, 0, 1, 0, 0]
  const stack = []
  const pictures = []
  let paths = 0
  let texts = 0
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i]
    if (fn === OPS.save) stack.push(ctm)
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
    else if (fn === OPS.transform) ctm = multiply(ctm, args)
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm)
      if (Array.isArray(args?.[0]) || ArrayBuffer.isView(args?.[0])) ctm = multiply(ctm, [...args[0]])
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
      const share = Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]) / pageArea
      const [id, w, h] = args ?? []
      const size = typeof w === 'number' ? [w, h] : [id?.width, id?.height]
      pictures.push({ key: size[0] ? `${size[0]}x${size[1]}` : null, share })
    } else if (fn === OPS.constructPath || fn === OPS.shadingFill) paths++
    else if (TEXT_OPS.has(fn)) texts++
  }
  return { pictures, paths, texts }
}

const multiply = ([a, b, c, d, e, f], [a2, b2, c2, d2, e2, f2]) => [
  a2 * a + b2 * c,
  a2 * b + b2 * d,
  c2 * a + d2 * c,
  c2 * b + d2 * d,
  e2 * a + f2 * c + e,
  e2 * b + f2 * d + f,
]

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

function findInPptx(sections) {
  const slidesWith = new Map() // picture path -> number of slides it's on
  for (const s of sections) {
    for (const path of new Set((s.blocks ?? []).filter((b) => b.type === 'image').map((b) => b.path))) {
      slidesWith.set(path, (slidesWith.get(path) ?? 0) + 1)
    }
  }
  const candidates = []
  for (const s of sections) {
    for (const b of s.blocks ?? []) {
      if (b.type !== 'image' || !SHOWABLE_IMAGE(b.mime) || b.mime === 'image/svg+xml') continue
      if (slidesWith.get(b.path) >= REPEATED_ON) continue
      // Without a known size, assume it's a real figure but rank it low.
      const share = b.area ?? MIN_PICTURE_SHARE
      if (share < MIN_PICTURE_SHARE) continue
      candidates.push({ ref: s.index, unit: 'Slide', kind: 'picture', path: b.path, mime: b.mime, score: share * 100 })
    }
  }
  return candidates.sort((a, b) => b.score - a.score)
}

// Renders the chosen candidates to JPEGs, keeping their order (best first,
// so the server can drop the weakest if the plan allows fewer):
// [{ ref, unit, mediaType, data }] with `data` in base64. Rendered one at a
// time so only one big canvas is in memory.
export async function renderDiagramPages(result, chosen, { signal } = {}) {
  const ordered = chosen
  const out = []
  if (result.type === 'pdf') {
    const { loadPdf } = await import('./pdfjs.js')
    const { doc, destroy } = await loadPdf(result.file)
    try {
      for (const c of ordered) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        const page = await doc.getPage(c.ref)
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: MAX_SIDE / Math.max(base.width, base.height) })
        const canvas = whiteCanvas(viewport.width, viewport.height)
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        page.cleanup()
        out.push({ ref: c.ref, unit: c.unit, ...(await toJpeg(canvas)) })
      }
    } finally {
      await destroy()
    }
    return out
  }

  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(result.file)
  for (const c of ordered) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const entry = zip.file(c.path)
    if (!entry) continue
    try {
      const bitmap = await createImageBitmap(new Blob([await entry.async('arraybuffer')], { type: c.mime }))
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
      const canvas = whiteCanvas(bitmap.width * scale, bitmap.height * scale)
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      out.push({ ref: c.ref, unit: c.unit, ...(await toJpeg(canvas)) })
    } catch {
      // A picture the browser can't decode is simply left out.
    }
  }
  return out
}

// Transparent areas would turn black in a JPEG.
function whiteCanvas(width, height) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width))
  canvas.height = Math.max(1, Math.round(height))
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return canvas
}
