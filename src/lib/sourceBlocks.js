// The structured content of one slide or page, as shown in the source viewer.
// Parsers (parsePdf.js, parsePptx.js) produce these blocks directly; plain
// text (pasted, scanned or caption notes) is turned into them by textToBlocks.
//
//   { type: 'heading', level: 1 | 2 | 3, text }
//   { type: 'paragraph', text }
//   { type: 'list', ordered, items: [{ text, level }] }
//   { type: 'table', header, rows: [[{ text, span }]] }
//   { type: 'math', tex }                         display equation
//   { type: 'image', path, mime, alt, aspect }    a picture inside the .pptx
//
// Any text may contain inline LaTeX between $…$ or \(…\), rendered with KaTeX.
// Plain JS with no browser APIs, so it can be tested in Node.

const BULLET = /^\s*([-*•●○◦▪■□►▸▶➢➤✓✔‣⁃–]|[-])\s+/
const ORDERED = /^\s*(\(?\d{1,2}[.)]|\(?[a-z][.)])\s+/i
const HEADING = /^(#{1,6})\s+(.+)$/
const TABLE_ROW = /\S.*\s\|\s.*\S|^\s*\|.*\|\s*$/
const TABLE_RULE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

// Lightweight Markdown-ish reading of plain notes: # headings, - / 1. lists,
// " | " tables and $$ display math. Everything else becomes paragraphs that
// keep their line breaks.
export function textToBlocks(text = '') {
  const blocks = []
  let paragraph = []
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join('\n') })
    paragraph = []
  }
  const lines = text.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed) {
      flush()
      continue
    }

    const display = trimmed.match(/^\$\$(.+)\$\$$/) ?? trimmed.match(/^\\\[(.+)\\\]$/)
    if (display) {
      flush()
      blocks.push({ type: 'math', tex: display[1].trim() })
      continue
    }

    const heading = trimmed.match(HEADING)
    if (heading) {
      flush()
      blocks.push({ type: 'heading', level: Math.min(heading[1].length, 3), text: heading[2].trim() })
      continue
    }

    // A table needs at least two rows in a row, so a lone "a | b" stays text.
    if (TABLE_ROW.test(line) && TABLE_ROW.test(lines[i + 1] ?? '')) {
      flush()
      const rows = []
      let header = false
      for (; i < lines.length && (TABLE_ROW.test(lines[i]) || TABLE_RULE.test(lines[i])); i++) {
        if (TABLE_RULE.test(lines[i])) {
          if (rows.length === 1) header = true
          continue
        }
        rows.push(splitRow(lines[i]))
      }
      i--
      blocks.push({ type: 'table', header, rows })
      continue
    }

    const bullet = line.match(BULLET)
    const ordered = !bullet && line.match(ORDERED)
    if (bullet || ordered) {
      flush()
      const marker = bullet ?? ordered
      const level = Math.min(3, Math.floor(line.match(/^\s*/)[0].replace(/\t/g, '  ').length / 2))
      const item = { text: line.slice(marker[0].length).trim(), level }
      const last = blocks.at(-1)
      if (last?.type === 'list' && last.ordered === Boolean(ordered)) last.items.push(item)
      else blocks.push({ type: 'list', ordered: Boolean(ordered), items: [item] })
      continue
    }

    paragraph.push(trimmed)
  }
  flush()
  return blocks
}

function splitRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => ({ text: cell.trim(), span: 1 }))
}

// Plain text for search, word counts and the AI: bullets, table rows and
// equations keep a readable shape.
export function blocksToText(blocks) {
  return blocks
    .map((b) => {
      switch (b.type) {
        case 'heading':
        case 'paragraph':
          return b.text
        case 'list':
          return b.items
            .map((item, i) => `${'  '.repeat(item.level)}${b.ordered ? `${i + 1}.` : '•'} ${item.text}`)
            .join('\n')
        case 'table':
          return b.rows.map((row) => row.map((c) => c.text).join(' | ')).join('\n')
        case 'math':
          return `$$${b.tex}$$`
        case 'image':
          return b.alt ? `[Image: ${b.alt}]` : ''
        default:
          return ''
      }
    })
    .filter(Boolean)
    .join('\n')
}

// Splits text into plain and math segments: [{ text }] / [{ tex, display }].
// Inline $…$ must hug its content ("$x^2$", not "$ 5 and $"), so prices and
// lone dollar signs stay text.
const MATH = /\$\$([^$]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)|\$(?=\S)([^$\n]+?)(?<=\S)\$(?!\d)/g

export function splitMath(text = '') {
  const parts = []
  let last = 0
  for (const m of text.matchAll(MATH)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) })
    const display = m[1] !== undefined || m[2] !== undefined
    parts.push({ tex: (m[1] ?? m[2] ?? m[3] ?? m[4]).trim(), display })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last) })
  return parts
}

// Occurrences of `query` in the parts of `text` the viewer highlights (math
// is skipped). Matches the marks Rich text renders, so "3 of 12" lines up.
export function countMatches(text, query) {
  if (!query || !text) return 0
  const needle = query.toLowerCase()
  let count = 0
  for (const part of splitMath(text)) {
    if (part.text === undefined) continue
    const hay = part.text.toLowerCase()
    for (let at = hay.indexOf(needle); at !== -1; at = hay.indexOf(needle, at + needle.length)) count++
  }
  return count
}

// Every string the viewer shows for a section, in the order it shows them.
export function sectionStrings(title, blocks, notes) {
  const strings = [title]
  for (const b of blocks) {
    if (b.type === 'heading' || b.type === 'paragraph') strings.push(b.text)
    else if (b.type === 'list') strings.push(...b.items.map((item) => item.text))
    else if (b.type === 'table') strings.push(...b.rows.flatMap((row) => row.map((c) => c.text)))
  }
  if (notes) strings.push(notes)
  return strings
}

// A section's title, unless it only repeats its label or its first line
// (titles made up from the first line when a page has none).
export function shownTitle(section, blocks, label) {
  const title = section.title?.trim()
  if (!title || title === label) return ''
  const first = blocks[0]
  const firstText = first?.type === 'list' ? first.items[0]?.text : first?.text
  return firstText?.trim().startsWith(title) ? '' : title
}

// Blocks for a section from any source; older results only have text.
const blockCache = new WeakMap()
export function blocksOf(section) {
  if (section.blocks) return section.blocks
  if (!blockCache.has(section)) blockCache.set(section, textToBlocks(section.text))
  return blockCache.get(section)
}
