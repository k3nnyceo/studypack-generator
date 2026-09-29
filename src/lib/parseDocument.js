export const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50 MB

const PARSERS = {
  pdf: () => import('./parsePdf.js').then((m) => m.parsePdf),
  pptx: () => import('./parsePptx.js').then((m) => m.parsePptx),
}

export function detectFileType(file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  return ext in PARSERS ? ext : null
}

// Checks a file before parsing. Returns an error message, or null if it's fine.
export function validateFile(file) {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'ppt') {
    return 'Older .ppt files aren’t supported. Save it as .pptx in PowerPoint and try again.'
  }
  if (!detectFileType(file)) {
    return 'Please upload a PDF or PowerPoint (.pptx) file.'
  }
  if (file.size > MAX_FILE_SIZE) {
    return `That file is too large. The limit is ${MAX_FILE_SIZE / 1024 / 1024} MB.`
  }
  if (file.size === 0) {
    return 'That file is empty.'
  }
  return null
}

// Parses a PDF or PPTX entirely in the browser. Parsers are lazy-loaded so the
// landing page doesn't pay for pdf.js up front.
export async function parseDocument(file) {
  const type = detectFileType(file)
  const parse = await PARSERS[type]()
  const rawSections = await parse(file)

  // Count only real content, so a scanned PDF isn't rescued by "Page 1" labels.
  const wordCount = rawSections
    .map((s) => `${s.title} ${s.text} ${s.notes}`)
    .join(' ')
    .split(/\s+/)
    .filter(Boolean).length

  if (wordCount === 0) {
    throw new Error(
      type === 'pdf'
        ? 'No text found. This PDF may be scanned images — try a PDF with selectable text.'
        : 'No text found in these slides.',
    )
  }

  const label = type === 'pdf' ? 'Page' : 'Slide'
  const sections = rawSections.map((s) => ({
    ...s,
    title: s.title || headingFrom(s.text) || `${label} ${s.index}`,
  }))
  // Each section is labelled "[Slide 3] Title" so a reader (human or AI) can
  // cite where material came from. Only real titles are included; a heading
  // derived from the first line would just repeat it.
  const fullText = rawSections
    .map((s) =>
      [`[${label} ${s.index}]${s.title ? ` ${s.title}` : ''}`, s.text, s.notes && `Speaker notes: ${s.notes}`]
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
  }
}

// Use a short first line as a heading when the source has no explicit title.
function headingFrom(text) {
  const firstLine = text.split('\n', 1)[0].trim()
  return firstLine.length > 0 && firstLine.length <= 80 ? firstLine : ''
}
