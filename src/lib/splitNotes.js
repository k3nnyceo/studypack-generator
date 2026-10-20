// Notes too long for one study pack are split into parts that each fit the
// plan's limit, and each part becomes its own pack. Parts are cut between
// pages or slides (never inside one), at a new lecture or chapter where one
// starts close enough to an even split, and keep the original [[Slide N]]
// markers, so every part's "View in source" links still open the right slide
// of the whole file.
//
//   splitIntoParts(fullText, maxChars) ->
//     [{ number, text, from, to }]   from/to: first and last page or slide
//                                    number (null for notes without markers)

// Each page, slide or video section starts a paragraph with its marker.
const SECTION_START = /\n\n(?=\[\[(?:Page|Slide) \d+\]\]|\[\d+:\d{2})/
const MARKER = /^\[\[(?:Page|Slide) (\d+)\]\]/
// A new lecture, chapter or week: the best place to start a new part.
const NEW_TOPIC = /\b(lecture|chapter|week|unit|topic|module|part)\s+(\d+|[ivx]+)\b/i
// Cut at a new topic once the part is at least this full.
const MIN_FILL_FOR_TOPIC_CUT = 0.5
const JOINER = '\n\n'

export function splitIntoParts(fullText, maxChars) {
  const chunks = toChunks(fullText, maxChars)
  const total = chunks.reduce((n, c) => n + c.text.length + JOINER.length, 0)
  // Even parts, a little under the limit so the markers and joins fit.
  const count = Math.max(1, Math.ceil(total / (maxChars * 0.95)))
  const target = total / count

  const parts = []
  let current = []
  let size = 0
  const close = () => {
    if (current.length) parts.push(current)
    current = []
    size = 0
  }
  for (const chunk of chunks) {
    const add = chunk.text.length + (current.length ? JOINER.length : 0)
    const wouldOverflow = size + add > maxChars
    const atTopic = chunk.newTopic && size >= target * MIN_FILL_FOR_TOPIC_CUT
    const reachedTarget = size >= target && parts.length < count - 1
    if (current.length && (wouldOverflow || atTopic || reachedTarget)) close()
    current.push(chunk)
    size += chunk.text.length + (current.length > 1 ? JOINER.length : 0)
  }
  close()

  return parts.map((part, i) => {
    const refs = part.map((c) => c.ref).filter((r) => r !== null)
    return {
      number: i + 1,
      text: part.map((c) => c.text).join(JOINER),
      from: refs.length ? Math.min(...refs) : null,
      to: refs.length ? Math.max(...refs) : null,
    }
  })
}

// Sections, each { text, ref, newTopic }. A single section longer than a
// part (a huge page, or pasted text with no markers) is split by paragraph,
// and as a last resort by length.
function toChunks(fullText, maxChars) {
  const limit = Math.floor(maxChars * 0.9)
  const chunks = []
  for (const section of fullText.split(SECTION_START)) {
    const ref = Number(section.match(MARKER)?.[1]) || null
    const newTopic = NEW_TOPIC.test(section.slice(0, 300))
    if (section.length <= limit) {
      chunks.push({ text: section, ref, newTopic })
      continue
    }
    // Only the section's first piece can start a new topic.
    let piece = ''
    let first = true
    const push = () => {
      chunks.push({ text: piece, ref, newTopic: first && newTopic })
      first = false
      piece = ''
    }
    for (const paragraph of section.split(/\n\n+/).flatMap((p) => splitLong(p, limit))) {
      if (piece && piece.length + JOINER.length + paragraph.length > limit) push()
      piece = piece ? piece + JOINER + paragraph : paragraph
    }
    if (piece) push()
  }
  return chunks
}

function splitLong(text, limit) {
  if (text.length <= limit) return [text]
  const out = []
  for (let at = 0; at < text.length; at += limit) out.push(text.slice(at, at + limit))
  return out
}
