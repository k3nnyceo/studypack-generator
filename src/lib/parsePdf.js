import { blocksToText } from './sourceBlocks.js'
import { loadPdf } from './pdfjs.js'

// Extracts text page by page. Returns one section per page, with the page's
// structure rebuilt from its layout (src/lib/sourceBlocks.js): bigger text
// becomes headings, bullet glyphs and indents become nested lists, and
// wrapped lines are joined back into paragraphs.
export async function parsePdf(file) {
  const { doc, destroy } = await loadPdf(file)

  try {
    const sections = []
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const content = await page.getTextContent()
      const blocks = pageBlocks(content.items, page.getViewport({ scale: 1 }).height)

      // A heading at the top of the page is its title.
      let title = ''
      const top = blocks.findIndex((b) => b.type === 'heading')
      if (top !== -1 && top < 2) title = blocks.splice(top, 1)[0].text

      sections.push({
        index: pageNum,
        title,
        text: blocksToText(blocks),
        notes: '',
        blocks,
      })
      page.cleanup()
    }
    return sections
  } finally {
    await destroy()
  }
}

// Bullet glyphs: the usual ones, anything from the symbol blocks slide
// templates use (arrows, shapes, dingbats such as ➢ ❖ ✓), and Wingdings-style
// private-use characters. A dash only counts with a space after it.
const BULLET = /^([•‣⁃·←-⇿■-◿☀-➿-]|[-*–](?=\s))\s*/u
const ORDERED = /^(\(?\d{1,2}[.)]|\(?[a-z][.)]|\(?[ivx]{1,4}[.)])\s+/i
const PAGE_NUMBER = /^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i
// Footers (dates, page numbers, course codes) sit in the bottom strip.
const FOOTER_ZONE = 0.07

// Text items -> lines (top to bottom, left to right) -> blocks.
export function pageBlocks(items, pageHeight = 0) {
  const lines = toLines(items).filter((line, i, all) => {
    const text = line.text.trim()
    if (pageHeight && line.y < pageHeight * FOOTER_ZONE && text.length <= 50) return false
    // Running page numbers at the very top or bottom.
    return !(PAGE_NUMBER.test(text) && (i === 0 || i === all.length - 1))
  })
  if (lines.length === 0) return []

  const body = bodySize(lines)
  const blocks = []
  let prev = null

  for (const line of lines) {
    const text = line.text.trim()
    const gap = prev ? prev.y - line.y : 0
    const near = prev && gap < Math.max(prev.size, line.size) * 1.9
    const last = blocks.at(-1)
    const isHeading = line.size >= body * 1.25 && text.length <= 120
    const bullet = text.match(BULLET)
    const ordered = !bullet && text.match(ORDERED)

    if (isHeading) {
      // A title that wraps onto two lines stays one heading.
      if (last?.type === 'heading' && near && Math.abs(prev.size - line.size) < 0.5) last.text += ` ${text}`
      else blocks.push({ type: 'heading', level: line.size >= body * 1.7 ? 1 : 2, text })
    } else if (bullet || ordered) {
      const item = { text: text.slice((bullet ?? ordered)[0].length).trim(), x: line.x }
      if (!item.text) continue // a bullet glyph on its own line
      // Slides space bullets apart, so a bullet after a bullet continues the list.
      if (last?.type === 'list' && last.ordered === Boolean(ordered)) last.items.push(item)
      else blocks.push({ type: 'list', ordered: Boolean(ordered), items: [item] })
    } else if (last?.type === 'list' && near && line.x > last.items.at(-1).x + body * 0.4) {
      // The wrapped second line of a bullet, indented to its text.
      last.items.at(-1).text = joinLines(last.items.at(-1).text, text)
    } else if (last?.type === 'paragraph' && near) {
      last.text = joinLines(last.text, text)
    } else {
      blocks.push({ type: 'paragraph', text })
    }
    prev = line
  }

  for (const [i, b] of blocks.entries()) {
    if (b.type === 'list') b.items = levelled(b.items, body)
    // A short line on its own above a list, or at the top of the page, is a
    // heading even when it's only bold rather than bigger.
    else if (b.type === 'paragraph' && b.text.length <= 70 && !/[.,;]$/.test(b.text) && !b.text.includes('\n')) {
      const next = blocks[i + 1]
      if (next && (next.type === 'list' || (i === 0 && next.type !== 'heading'))) Object.assign(b, { type: 'heading', level: 2 })
    }
  }
  return blocks
}

// Indent levels from where each bullet starts: the distinct left edges on
// the page, smallest first.
function levelled(items, body) {
  const edges = []
  for (const x of [...items.map((it) => it.x)].sort((a, b) => a - b)) {
    if (!edges.length || x - edges.at(-1) > body * 0.6) edges.push(x)
  }
  const levelOf = (x) => Math.min(3, edges.reduce((lvl, edge, i) => (x >= edge - body * 0.3 ? i : lvl), 0))
  return items.map(({ text, x }) => ({ text, level: levelOf(x) }))
}

// Groups items whose baselines line up. pdf.js gives y from the bottom of the page.
function toLines(items) {
  const runs = items
    .filter((it) => 'str' in it && it.str.trim() !== '')
    .map((it) => ({
      str: it.str,
      x: it.transform[4],
      y: it.transform[5],
      width: it.width,
      size: Math.hypot(it.transform[2], it.transform[3]) || it.height || 0,
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x)

  const lines = []
  for (const run of runs) {
    const line = lines.at(-1)
    if (line && Math.abs(line.y - run.y) <= Math.max(line.size, run.size) * 0.45) line.runs.push(run)
    else lines.push({ y: run.y, size: run.size, runs: [run] })
  }

  return lines.map((line) => {
    line.runs.sort((a, b) => a.x - b.x)
    let text = ''
    let end = null
    for (const run of line.runs) {
      // Separate items that sit apart get a space between them.
      if (end !== null && run.x - end > run.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(run.str)) text += ' '
      text += run.str
      end = run.x + run.width
    }
    return {
      y: line.y,
      x: line.runs[0].x,
      size: Math.max(...line.runs.map((r) => r.size)),
      text: text.replace(/\s+/g, ' '),
    }
  })
}

// The most common text size, weighted by how much text uses it.
function bodySize(lines) {
  const weights = new Map()
  for (const line of lines) {
    const size = Math.round(line.size * 2) / 2
    weights.set(size, (weights.get(size) ?? 0) + line.text.length)
  }
  return [...weights.entries()].sort((a, b) => b[1] - a[1])[0][0] || 10
}

// "electro-" + "magnetic" -> "electromagnetic"; otherwise a space.
function joinLines(a, b) {
  return /[a-z]-$/.test(a) && /^[a-z]/.test(b) ? a.slice(0, -1) + b : `${a} ${b}`
}
