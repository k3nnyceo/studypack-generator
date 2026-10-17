// Where guide content came from in the lecture. Generated items carry
// `sourcePages` (slide or page numbers); each module has its sourceRange text
// ("Slides 7-12", "Pages 3–5 and 9", "[10:00–15:00]"), which is read here.

const MAX_SPAN = 200

// "Slides 7-12, 14" -> [7, 8, …, 12, 14]. Time ranges ("10:00–15:00") match
// the video sections whose start time falls inside them.
export function parseSourceRange(range, sections = []) {
  if (!range) return []
  const times = [...range.matchAll(/(\d+(?::\d{2}){1,2})\s*[-–—]\s*(\d+(?::\d{2}){1,2})/g)]
  if (times.length) {
    const refs = new Set()
    for (const [, from, to] of times) {
      const start = seconds(from)
      const end = seconds(to)
      for (const s of sections) {
        const at = seconds(s.title.split(/[-–—]/)[0].trim())
        if (at !== null && at >= start && at < end) refs.add(s.index)
      }
    }
    return [...refs].sort((a, b) => a - b)
  }

  const refs = new Set()
  for (const [, a, b] of range.matchAll(/(\d+)(?:\s*(?:[-–—]|to)\s*(\d+))?/g)) {
    const from = Number(a)
    const to = b ? Number(b) : from
    if (!from || to < from || to - from > MAX_SPAN) continue
    for (let n = from; n <= to; n++) refs.add(n)
  }
  return [...refs].sort((a, b) => a - b)
}

function seconds(clock) {
  if (!/^\d+(:\d{2}){1,2}$/.test(clock)) return null
  return clock.split(':').reduce((total, part) => total * 60 + Number(part), 0)
}

// [4, 5, 6, 9] -> "Slides 4–6, 9". Video sections are labelled by time.
export function refLabel(refs, source) {
  if (!refs.length) return ''
  if (source?.type === 'video') {
    const first = source.sections.find((s) => s.index === refs[0])
    return first ? `${first.title}${refs.length > 1 ? ` +${refs.length - 1}` : ''}` : ''
  }
  const unit = source?.type === 'pptx' ? 'Slide' : 'Page'
  const runs = []
  for (const n of refs) {
    const run = runs.at(-1)
    if (run && n === run[1] + 1) run[1] = n
    else runs.push([n, n])
  }
  const text = runs.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`)).join(', ')
  return `${unit}${refs.length > 1 ? 's' : ''} ${text}`
}

// The unit a source is divided into, for labels like "Slide 4".
export const unitOf = (source) => (source?.type === 'pptx' ? 'Slide' : source?.type === 'video' ? 'Section' : 'Page')
