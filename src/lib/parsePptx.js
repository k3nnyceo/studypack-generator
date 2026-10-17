import JSZip from 'jszip'
import { NS_M, ommlToLatex } from './omml.js'
import { blocksToText } from './sourceBlocks.js'

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main'
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main'
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const NS_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'
const NS_MC = 'http://schemas.openxmlformats.org/markup-compatibility/2006'
const NS_A14 = 'http://schemas.microsoft.com/office/drawing/2010/main'
const REL_TYPES = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/'

// Image types a browser can show. EMF/WMF (old Office clip art) and TIFF can't
// be drawn in an <img>, so they're listed but not shown.
export const IMAGE_MIME = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  emf: 'image/x-emf',
  wmf: 'image/x-wmf',
  tif: 'image/tiff',
  tiff: 'image/tiff',
}
export const SHOWABLE_IMAGE = (mime) => !/emf|wmf|tiff/.test(mime)

// A .pptx is a zip of XML parts. Each slide lives at ppt/slides/slideN.xml;
// its .rels file (ppt/slides/_rels/slideN.xml.rels) maps the r:embed ids used
// by pictures to files in ppt/media/, and links the speaker notes.
//
// Each slide becomes { index, title, text, notes, blocks }: blocks keep the
// slide's headings, bullet levels, tables, equations and pictures in order
// (src/lib/sourceBlocks.js). Image bytes stay in the zip; the viewer reads
// them on demand by path.
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
    const rels = await readRels(zip, path)
    const { title, blocks } = extractSlide(slideXml, rels)
    const notes = await extractNotes(zip, rels)

    sections.push({
      index: i + 1,
      title,
      text: blocksToText(blocks),
      notes,
      blocks,
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

const elements = (node) => Array.from(node?.children ?? [])
const first = (node, ns, name) => node?.getElementsByTagNameNS(ns, name)[0] ?? null

// Relationship id -> resolved part path ("rId3" -> "ppt/media/image2.png").
async function readRels(zip, slidePath) {
  const relsPath = slidePath.replace(/slides\/(slide\d+\.xml)$/, 'slides/_rels/$1.rels')
  const relsFile = zip.file(relsPath)
  const rels = new Map()
  if (!relsFile) return rels
  const doc = parseXml(await relsFile.async('string'))
  for (const rel of doc.getElementsByTagNameNS(NS_REL, 'Relationship')) {
    if (rel.getAttribute('TargetMode') === 'External') continue
    const target = new URL(rel.getAttribute('Target'), `file:///${slidePath}`).pathname.slice(1)
    rels.set(rel.getAttribute('Id'), { type: rel.getAttribute('Type').replace(REL_TYPES, ''), path: decodeURIComponent(target) })
  }
  return rels
}

function placeholderType(shape) {
  const ph = first(shape, NS_P, 'ph')
  if (!ph) return null
  return ph.getAttribute('type') || 'body'
}

// Walks the slide's shape tree in order. The title comes out separately; the
// rest become blocks.
function extractSlide(doc, rels) {
  let title = ''
  const blocks = []
  const seenImages = new Set()

  const walk = (tree) => {
    for (const node of elements(tree)) {
      if (node.namespaceURI === NS_MC && node.localName === 'AlternateContent') {
        walk(alternative(node))
        continue
      }
      if (node.namespaceURI !== NS_P) continue
      switch (node.localName) {
        case 'sp': {
          const type = placeholderType(node)
          if (type === 'sldNum' || type === 'dt' || type === 'ftr') break
          const body = first(node, NS_P, 'txBody')
          if (!body) break
          if (!title && (type === 'title' || type === 'ctrTitle')) {
            title = paragraphs(body)
              .map((p) => p.text)
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim()
            break
          }
          // Body placeholders are bulleted unless a paragraph says otherwise;
          // free text boxes aren't.
          blocks.push(...textBlocks(body, { bulletedByDefault: type === 'body' || type === 'obj' }))
          break
        }
        case 'graphicFrame': {
          const table = first(node, NS_A, 'tbl')
          if (table) blocks.push(tableBlock(table))
          break
        }
        case 'pic': {
          const image = imageBlock(node, rels)
          if (image && !seenImages.has(image.path)) {
            seenImages.add(image.path)
            blocks.push(image)
          }
          break
        }
        case 'grpSp':
          walk(node)
          break
      }
    }
  }
  walk(first(doc, NS_P, 'spTree'))
  return { title, blocks }
}

// Newer content with an older fallback. Equations come as an a14 choice
// (Office Math) with a picture of the equation as the fallback: read the
// maths. Anything else newer (3D models, …) falls back.
function alternative(node) {
  const choice = elements(node).find((c) => c.localName === 'Choice')
  if (choice?.getAttribute('Requires') === 'a14') return choice
  return elements(node).find((c) => c.localName === 'Fallback') ?? null
}

// One entry per <a:p>: its text (inline equations as $…$), outline level,
// and bullet kind. A paragraph that is only an equation is display math.
function paragraphs(txBody) {
  return elements(txBody)
    .filter((p) => p.namespaceURI === NS_A && p.localName === 'p')
    .map((p) => {
      const pPr = first(p, NS_A, 'pPr')
      const level = Math.min(Number(pPr?.getAttribute('lvl') ?? 0) || 0, 3)
      const bullet = pPr
        ? first(pPr, NS_A, 'buNone')
          ? 'none'
          : first(pPr, NS_A, 'buAutoNum')
            ? 'ordered'
            : first(pPr, NS_A, 'buChar') || first(pPr, NS_A, 'buBlip')
              ? 'bullet'
              : null
        : null

      let text = ''
      let math = null
      let otherText = false
      const visit = (node) => {
        for (const c of elements(node)) {
          if (c.namespaceURI === NS_MC && c.localName === 'AlternateContent') {
            const alt = alternative(c)
            if (alt) visit(alt)
          } else if (c.namespaceURI === NS_A14 && c.localName === 'm') {
            const omath = first(c, NS_M, 'oMathPara') ?? first(c, NS_M, 'oMath')
            const tex = omath ? ommlToLatex(omath) : ''
            if (tex) {
              math = math === null && !text.trim() ? tex : null
              text += ` $${tex}$ `
            }
          } else if (c.namespaceURI === NS_A && (c.localName === 'r' || c.localName === 'fld')) {
            const t = first(c, NS_A, 't')?.textContent ?? ''
            if (t.trim()) otherText = true
            text += t
          } else if (c.namespaceURI === NS_A && c.localName === 'br') {
            text += '\n'
          }
        }
      }
      visit(p)
      text = text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim()
      return { text, level, bullet, displayMath: math !== null && !otherText ? math : null }
    })
    .filter((p) => p.text)
}

function textBlocks(txBody, { bulletedByDefault }) {
  const blocks = []
  for (const p of paragraphs(txBody)) {
    if (p.displayMath) {
      blocks.push({ type: 'math', tex: p.displayMath })
      continue
    }
    const kind = p.bullet ?? (bulletedByDefault ? 'bullet' : 'none')
    if (kind === 'none') {
      const last = blocks.at(-1)
      // Lines of one text box run together as one paragraph, as on the slide.
      if (last?.type === 'paragraph') last.text += `\n${p.text}`
      else blocks.push({ type: 'paragraph', text: p.text })
      continue
    }
    const ordered = kind === 'ordered'
    const last = blocks.at(-1)
    const item = { text: p.text, level: p.level }
    if (last?.type === 'list' && last.ordered === ordered) last.items.push(item)
    else blocks.push({ type: 'list', ordered, items: [item] })
  }
  return blocks
}

function tableBlock(tbl) {
  const header = first(tbl, NS_A, 'tblPr')?.getAttribute('firstRow') === '1'
  const rows = elements(tbl)
    .filter((tr) => tr.localName === 'tr')
    .map((tr) =>
      elements(tr)
        .filter((tc) => tc.localName === 'tc' && tc.getAttribute('hMerge') !== '1')
        .map((tc) => ({
          text: tc.getAttribute('vMerge') === '1' ? '' : paragraphs(first(tc, NS_A, 'txBody')).map((p) => p.text).join('\n'),
          span: Number(tc.getAttribute('gridSpan')) || 1,
        })),
    )
    .filter((row) => row.length)
  return { type: 'table', header, rows }
}

// A picture: its r:embed id resolved through the slide's .rels to a file in
// ppt/media/. The aspect ratio comes from the shape's size on the slide, so
// the viewer can reserve the space before the image loads.
function imageBlock(pic, rels) {
  const blip = first(pic, NS_A, 'blip')
  const id = blip?.getAttributeNS(NS_R, 'embed')
  const rel = id && rels.get(id)
  if (!rel || rel.type !== 'image') return null
  const ext = rel.path.split('.').pop().toLowerCase()
  const mime = IMAGE_MIME[ext]
  if (!mime) return null
  const size = first(first(pic, NS_P, 'spPr'), NS_A, 'ext')
  const cx = Number(size?.getAttribute('cx'))
  const cy = Number(size?.getAttribute('cy'))
  const nvPr = first(pic, NS_P, 'cNvPr')
  // Office's automatic captions end with "Description automatically generated",
  // or are just "Generated image": neither describes anything.
  const alt = (nvPr?.getAttribute('descr') || nvPr?.getAttribute('title') || '')
    .replace(/\s*Description automatically generated\s*/i, '')
    .replace(/^(AI-)?generated image$/i, '')
    .trim()
  return { type: 'image', path: rel.path, mime, alt, aspect: cx > 0 && cy > 0 ? cx / cy : null }
}

async function extractNotes(zip, rels) {
  const notesRel = [...rels.values()].find((rel) => rel.type === 'notesSlide')
  const notesFile = notesRel && zip.file(notesRel.path)
  if (!notesFile) return ''

  const notesXml = parseXml(await notesFile.async('string'))
  const lines = []
  for (const shape of notesXml.getElementsByTagNameNS(NS_P, 'sp')) {
    if (placeholderType(shape) !== 'body') continue
    const body = first(shape, NS_P, 'txBody')
    if (body) lines.push(...paragraphs(body).map((p) => p.text))
  }
  return lines.join('\n')
}
