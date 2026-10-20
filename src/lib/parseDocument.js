// Scanned PDFs are large (every page is a picture). Files are read on the
// device, so this only guards against running out of memory.
export const MAX_FILE_SIZE = 100 * 1024 * 1024 // 100 MB

const PARSERS = {
  pdf: () => import('./parsePdf.js').then((m) => m.parsePdf),
  pptx: () => import('./parsePptx.js').then((m) => m.parsePptx),
}

const TYPES_BY_MIME = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
}

// By extension, falling back to the MIME type: files shared from other apps
// (e.g. WhatsApp) sometimes arrive without one.
export function detectFileType(file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext in PARSERS ? ext : (TYPES_BY_MIME[file.type] ?? null)
}

// Checks a file before parsing. Returns an error message, or null if it's fine.
export function validateFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'ppt') {
    return 'Older .ppt files aren’t supported. Save it as .pptx in PowerPoint and try again.'
  }
  if (!detectFileType(file)) {
    return 'Please upload a PDF or PowerPoint (.pptx) file, or photos of your notes.'
  }
  if (file.size > MAX_FILE_SIZE) {
    return `That file is too large. The limit is ${MAX_FILE_SIZE / 1024 / 1024} MB.`
  }
  if (file.size === 0) {
    return 'That file is empty.'
  }
  return null
}

// A PDF that's mostly pictures of pages (a scan or phone photos saved as PDF):
// there's no text to extract, but it can be read (src/lib/scanPages.js).
export class ScannedPdfError extends Error {
  constructor(pageCount) {
    super('This PDF is scanned: its pages are pictures, with no text to copy.')
    this.pageCount = pageCount
  }
}

// Parses a PDF or PPTX entirely in the browser. Parsers are lazy-loaded so the
// landing page doesn't pay for pdf.js up front.
export async function parseDocument(file) {
  const type = detectFileType(file)
  const parse = await PARSERS[type]()
  const rawSections = await parse(file)

  // Count only real content, so a scanned PDF isn't rescued by "Page 1" labels
  // (or bullet markers).
  const wordCount = countWords(rawSections.map((s) => `${s.title} ${s.text} ${s.notes}`).join(' '))

  // Scanned: no text at all, or most pages have next to none (a typed cover
  // page in front of scanned handouts is common).
  const wordsOn = (s) => countWords(`${s.title} ${s.text}`)
  const pictureOnly = rawSections.filter((s) => wordsOn(s) < 8).length
  if (type === 'pdf' && (wordCount === 0 || pictureOnly / rawSections.length >= 0.6)) {
    throw new ScannedPdfError(rawSections.length)
  }
  if (wordCount === 0) throw new Error('No text found in these slides.')

  const label = type === 'pdf' ? 'Page' : 'Slide'
  const sections = rawSections.map((s) => ({
    ...s,
    title: s.title || headingFrom(s.text) || `${label} ${s.index}`,
  }))
  // Each section starts with a marker, "[[Slide 3]] Title", so a reader (human
  // or AI) can cite exactly where material came from: the model copies these
  // numbers into sourceRange and sourcePages, which open the source viewer. Only real titles are included; a heading
  // derived from the first line would just repeat it.
  const fullText = rawSections
    .map((s) =>
      [`[[${label} ${s.index}]]${s.title ? ` ${s.title}` : ''}`, s.text, s.notes && `Speaker notes: ${s.notes}`]
        .filter(Boolean)
        .join('\n'),
    )
    .join('\n\n')

  return {
    fileName: file.name,
    type,
    sections,
    fullText,
    wordCount,
    // Kept for the source viewer, which renders the pages (PDF) or reads the
    // pictures (PowerPoint) from it. It never leaves the device.
    file,
  }
}

export const countWords = (text) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length

// Use a short first line as a heading when the source has no explicit title.
// A picture's description ("[Image: …]") isn't a heading.
function headingFrom(text) {
  const firstLine = text.split('\n').find((line) => line.trim() && !line.startsWith('[Image:'))?.trim() ?? ''
  return firstLine.length > 0 && firstLine.length <= 80 ? firstLine : ''
}
