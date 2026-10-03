// Scanned and photographed notes (a Max feature). Pages are turned into
// compressed JPEGs in the browser, sent a few at a time to /api/transcribe
// (server/transcribe.js), and the transcription becomes ordinary notes for the
// Notes → Generate flow.

export const MAX_SCAN_PAGES = 40
const PAGES_PER_REQUEST = 5
// Large enough for handwriting to stay legible, small enough for mobile data:
// a page is typically 150-300 KB.
const MAX_SIDE = 1600
const QUALITY = 0.72

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const isImageFile = (file) => IMAGE_TYPES.includes(file.type) || /\.(jpe?g|png|webp)$/i.test(file.name)

// A scan to read: { kind: 'pdf' | 'photos', fileName, pageCount, getPage(i) }
// where getPage(i) (1-based) resolves to { mediaType, data } in base64.
export async function scannedPdf(file) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { default: workerUrl } = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  return {
    kind: 'pdf',
    fileName: file.name,
    pageCount: doc.numPages,
    async getPage(i) {
      const page = await doc.getPage(i)
      const base = page.getViewport({ scale: 1 })
      const viewport = page.getViewport({ scale: MAX_SIDE / Math.max(base.width, base.height) })
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(viewport.width)
      canvas.height = Math.round(viewport.height)
      const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fff' // transparent PDF backgrounds would turn black in a JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport }).promise
      page.cleanup()
      return toJpeg(canvas)
    },
    close: () => task.destroy(),
  }
}

export function photos(files) {
  const sorted = [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  return {
    kind: 'photos',
    fileName: sorted.length === 1 ? sorted[0].name : `${sorted.length} photos of notes`,
    pageCount: sorted.length,
    async getPage(i) {
      // from-image applies the phone's rotation, so photos aren't sideways.
      const bitmap = await createImageBitmap(sorted[i - 1], { imageOrientation: 'from-image' })
      const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      bitmap.close()
      return toJpeg(canvas)
    },
    close() {},
  }
}

async function toJpeg(canvas) {
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
  canvas.width = canvas.height = 0 // free the memory now; phones run out quickly
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return { mediaType: 'image/jpeg', data: btoa(binary) }
}

// Reads the first `pageCount` pages, PAGES_PER_REQUEST at a time, rendering
// each batch just before sending it so only a few images are in memory.
// Resolves to the notes result (like parseDocument's).
export async function readScan(scan, { pageCount = Math.min(scan.pageCount, MAX_SCAN_PAGES), onProgress, signal } = {}) {
  const pages = []
  try {
    for (let start = 1; start <= pageCount; start += PAGES_PER_REQUEST) {
      const numbers = Array.from({ length: Math.min(PAGES_PER_REQUEST, pageCount - start + 1) }, (_, k) => start + k)
      const images = []
      for (const page of numbers) {
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        images.push({ page, ...(await scan.getPage(page)) })
      }
      onProgress?.({ done: start - 1, total: pageCount })
      const { pages: read } = await transcribe(images, signal)
      pages.push(...read)
      onProgress?.({ done: start - 1 + numbers.length, total: pageCount })
    }
  } finally {
    // Frees the PDF's memory; a failure here mustn't lose the pages read.
    Promise.resolve()
      .then(() => scan.close())
      .catch(() => {})
  }
  return scanResult(scan.fileName, pages)
}

async function transcribe(pages, signal) {
  let res
  try {
    res = await fetch('/api/transcribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pages }),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new Error('Couldn’t reach StudyPack. Check your connection and try again.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) {
    const err = new Error(data?.error || `Something went wrong (${res.status}). Please try again.`)
    Object.assign(err, { status: res.status, reason: data?.reason, resetsAt: data?.resetsAt })
    throw err
  }
  return data
}

// Notes in the same shape as parseDocument's result, labelled by page.
export function scanResult(fileName, pages) {
  const sections = pages
    .filter((p) => p.text && p.text !== '[Unreadable]')
    .map((p) => ({ index: p.page, title: firstLine(p.text) || `Page ${p.page}`, text: p.text, notes: '' }))
  if (sections.length === 0) throw new Error('No readable text was found on these pages. Try clearer photos.')
  const fullText = sections.map((s) => `[Page ${s.index}]\n${s.text}`).join('\n\n')
  return { fileName, type: 'pdf', scanned: true, sections, fullText, wordCount: fullText.split(/\s+/).filter(Boolean).length }
}

// Notes typed or pasted in (a Max feature).
export function pastedResult(text) {
  const trimmed = text.trim()
  return {
    fileName: 'Pasted notes',
    type: 'pdf',
    pasted: true,
    sections: [{ index: 1, title: firstLine(trimmed) || 'Pasted notes', text: trimmed, notes: '' }],
    fullText: trimmed,
    wordCount: trimmed.split(/\s+/).filter(Boolean).length,
  }
}

function firstLine(text) {
  const line = text.split('\n', 1)[0].replace(/^#+\s*/, '').trim()
  return line.length > 0 && line.length <= 80 ? line : ''
}
