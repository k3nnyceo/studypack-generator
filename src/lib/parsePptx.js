import JSZip from 'jszip'

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const NOTES_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide'

// A .pptx is a zip of XML parts. Each slide lives at ppt/slides/slideN.xml;
// speaker notes are linked from the slide's .rels file.
export async function parsePptx(file) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())

  const slidePaths = Object.keys(zip.files)
    .filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
    .sort((a, b) => slideNumber(a) - slideNumber(b))

  if (slidePaths.length === 0) {
    throw new Error('No slides found. Is this a valid PowerPoint file?')
  }

  const sections = []
  for (const [i, path] of slidePaths.entries()) {
    const slideXml = parseXml(await zip.file(path).async('string'))
    const { title, body } = extractSlideText(slideXml)
    const notes = await extractNotes(zip, path)

    sections.push({
      index: i + 1,
      title,
      text: body,
      notes,
    })
  }
  return sections
}

function slideNumber(path) {
  return Number(path.match(/slide(\d+)\.xml$/)[1])
}

function parseXml(xml) {
  return new DOMParser().parseFromString(xml, 'application/xml')
}

function placeholderType(shape) {
  const ph = shape.getElementsByTagNameNS(NS_P, 'ph')[0]
  return ph ? ph.getAttribute('type') || 'body' : null
}

function paragraphsOf(node) {
  return Array.from(node.getElementsByTagNameNS(NS_A, 'p'))
    .map((p) =>
      Array.from(p.getElementsByTagNameNS(NS_A, 't'))
        .map((t) => t.textContent)
        .join(''),
    )
    .map((line) => line.trim())
    .filter(Boolean)
}

function extractSlideText(doc) {
  let title = ''
  const lines = []

  for (const shape of doc.getElementsByTagNameNS(NS_P, 'sp')) {
    const type = placeholderType(shape)
    const paragraphs = paragraphsOf(shape)
    if (paragraphs.length === 0) continue

    if (!title && (type === 'title' || type === 'ctrTitle')) {
      title = paragraphs.join(' ')
    } else if (type !== 'sldNum' && type !== 'dt' && type !== 'ftr') {
      lines.push(...paragraphs)
    }
  }

  // Tables live in graphicFrames rather than shapes.
  for (const cell of doc.getElementsByTagNameNS(NS_A, 'tc')) {
    const text = paragraphsOf(cell).join(' ')
    if (text) lines.push(text)
  }

  return { title, body: lines.join('\n') }
}

async function extractNotes(zip, slidePath) {
  const relsPath = slidePath.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels')
  const relsFile = zip.file(relsPath)
  if (!relsFile) return ''

  const rels = parseXml(await relsFile.async('string'))
  const notesRel = Array.from(rels.getElementsByTagNameNS(NS_REL, 'Relationship')).find(
    (rel) => rel.getAttribute('Type') === NOTES_REL_TYPE,
  )
  if (!notesRel) return ''

  const notesPath = new URL(notesRel.getAttribute('Target'), `file:///${slidePath}`).pathname.slice(1)
  const notesFile = zip.file(notesPath)
  if (!notesFile) return ''

  const notesXml = parseXml(await notesFile.async('string'))
  const lines = []
  for (const shape of notesXml.getElementsByTagNameNS(NS_P, 'sp')) {
    if (placeholderType(shape) === 'body') lines.push(...paragraphsOf(shape))
  }
  return lines.join('\n')
}
