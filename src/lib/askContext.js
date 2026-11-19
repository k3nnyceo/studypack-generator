// What "Ask about this pack" sends Claude to answer from (server/ask.js):
// the lecture's notes as saved on this device, each page or slide starting
// with its [[Page N]] marker so answers can cite it; or, for a pack without
// its notes here (e.g. from the Pack library), the study pack itself.
//
// Notes longer than BUDGET (a 262-slide deck is ~157K characters) are cut
// down to the pages that best match the question and the conversation so
// far, with their neighbours, in the lecture's order.

import { unitOf } from './sourceRefs.js'

const BUDGET = 36_000
// Common words that say nothing about which page a question is about.
const STOP = new Set(
  'about above after again also and any are because been before being between both but can could did does doing down during each else every few for from further had has have having her here him his how into its itself just more most much must not now off once only other our out over own same she should some such than that the their them then there these they this those through too under until very was were what when where which while who why will with would you your explain mean means meaning tell give show please define what does whats how why'.split(
    ' ',
  ),
)

// { context, kind: 'notes' | 'pack', partial } for a question, or null when
// there's nothing to ask about.
export function buildAskContext({ source, guide, question, history = [] }) {
  if (source?.sections?.length) return notesContext(source, question, history)
  if (guide) return { context: packText(guide).slice(0, BUDGET), kind: 'pack', partial: false }
  return null
}

function notesContext(source, question, history) {
  const unit = unitOf(source)
  const sections = source.sections.map((s) => ({
    index: s.index,
    text: [`[[${unit} ${s.index}]]${s.title ? ` ${s.title}` : ''}`, s.text, s.notes && `Speaker notes: ${s.notes}`].filter(Boolean).join('\n'),
  }))
  const whole = sections.map((s) => s.text).join('\n\n')
  if (whole.length <= BUDGET) return { context: whole, kind: 'notes', partial: false }

  // Too long: score each page by the question's words (and, less, the recent
  // conversation's), then take the best pages with a neighbour on each side.
  const recent = history.slice(-4).map((m) => m.text).join(' ')
  const terms = weightedTerms(question, 3)
  for (const [term, w] of weightedTerms(recent, 1)) terms.set(term, (terms.get(term) ?? 0) + w)
  const scored = sections.map((s, i) => {
    const words = s.text.toLowerCase()
    let score = 0
    for (const [term, w] of terms) if (words.includes(term)) score += w
    return { i, score }
  })
  const chosen = new Set()
  let size = 0
  const take = (i) => {
    if (i < 0 || i >= sections.length || chosen.has(i)) return
    if (size + sections[i].text.length + 2 > BUDGET) return
    chosen.add(i)
    size += sections[i].text.length + 2
  }
  for (const { i } of scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score)) {
    take(i)
    take(i - 1)
    take(i + 1)
    if (size > BUDGET * 0.95) break
  }
  // Nothing matched (e.g. "summarise this"): the start of the lecture.
  for (let i = 0; chosen.size === 0 && i < sections.length; i++) take(i)
  for (let i = 0; size < BUDGET * 0.5 && i < sections.length; i++) take(i)
  const context = [...chosen]
    .sort((a, b) => a - b)
    .map((i) => sections[i].text)
    .join('\n\n')
  return {
    context: `(This lecture is long: these are the ${unit.toLowerCase()}s most related to the question, out of ${sections.length}.)\n\n${context}`,
    kind: 'notes',
    partial: true,
  }
}

function weightedTerms(text, weight) {
  const terms = new Map()
  for (const word of (text ?? '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []) {
    if (STOP.has(word)) continue
    // A rough stem, so "standards" finds "standard".
    const stem = word.length > 5 ? word.replace(/(ings?|ions?|ies|es|s|ed|ly)$/, '') : word
    terms.set(stem, Math.max(terms.get(stem) ?? 0, weight))
  }
  return terms
}

// One module of a study pack as plain text.
const moduleText = (m, i) =>
  [
    `Module ${i + 1}: ${m.title}${m.sourceRange ? ` [${m.sourceRange}]` : ''}`,
    m.summary,
    m.keyPoints?.length ? `Key points:\n${m.keyPoints.map((p) => `- ${p}`).join('\n')}` : '',
    m.definitions?.length ? `Definitions:\n${m.definitions.map((d) => `- ${d.term}: ${d.definition}`).join('\n')}` : '',
    m.workedExamples?.length ? `Worked examples:\n${m.workedExamples.map((e) => `- ${e.title}: ${e.problem} Answer: ${e.answer}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n')

// The study pack as plain text, module by module.
export function packText(guide) {
  const parts = [`${guide.title}${guide.course ? ` (${guide.course})` : ''}`, guide.overview, ...guide.modules.map(moduleText)]
  return parts.filter(Boolean).join('\n\n')
}

// "Ask your library": what to answer from when the question could be about
// any of the student's packs. Every module of every pack is scored by the
// question's words (and the recent conversation's; a match in the pack's
// course or title counts too), and the best modules fill the budget, grouped
// by pack. Each pack starts with a [[Pack N]] marker for answers to cite.
//
// { context, kind: 'library', packs: { [N]: entry id }, partial } or null.
const LIBRARY_BUDGET = 48_000
export function buildLibraryContext({ entries, question, history = [] }) {
  const usable = entries.filter((e) => e.guide?.modules?.length)
  if (usable.length === 0) return null
  const terms = weightedTerms(question, 3)
  for (const [term, w] of weightedTerms(history.slice(-4).map((m) => m.text).join(' '), 1)) terms.set(term, (terms.get(term) ?? 0) + w)
  const score = (text) => {
    const words = text.toLowerCase()
    let n = 0
    for (const [term, w] of terms) if (words.includes(term)) n += w
    return n
  }

  const modules = []
  for (const [p, entry] of usable.entries()) {
    const head = score(`${entry.course} ${entry.title} ${entry.topic}`)
    for (const [i, m] of entry.guide.modules.entries()) {
      const text = moduleText(m, i)
      modules.push({ p, i, text, score: score(text) + head * 2 })
    }
  }
  const all = modules.reduce((n, m) => n + m.text.length + 2, 0)
  // Best first; nothing matched ("what should I revise?"): newest packs first.
  const ranked = modules.some((m) => m.score > 0) ? modules.filter((m) => m.score > 0).sort((a, b) => b.score - a.score || a.p - b.p) : modules
  const chosen = []
  let size = 0
  for (const m of ranked) {
    if (size + m.text.length + 2 > LIBRARY_BUDGET) continue
    chosen.push(m)
    size += m.text.length + 2
    if (size > LIBRARY_BUDGET * 0.95) break
  }

  // Grouped by pack, the best pack first, modules in their pack's order.
  const order = [...new Set(chosen.map((m) => m.p))]
  const packs = {}
  const sections = order.map((p, n) => {
    const entry = usable[p]
    packs[n + 1] = entry.id
    const body = chosen
      .filter((m) => m.p === p)
      .sort((a, b) => a.i - b.i)
      .map((m) => m.text)
    return [`[[Pack ${n + 1}]] ${entry.title}${entry.course ? ` (${entry.course})` : ''}`, ...body].join('\n\n')
  })
  const partial = size < all
  const note = `(The student's library has ${usable.length} study pack${usable.length === 1 ? '' : 's'}${partial ? '; these are the parts most related to the question' : ''}.)`
  return { context: `${note}\n\n${sections.join('\n\n')}`, kind: 'library', packs, partial }
}

// Earlier answers cite packs by their number at the time, which changes from
// question to question: in the history sent back, they become pack names.
export function withPackNames(text, packs, entries) {
  return text.replace(/\[\[Pack (\d+)(?:,[^\]]{0,40})?\]\]/g, (marker, n) => {
    const entry = entries.find((e) => e.id === packs?.[n])
    return entry ? `(${entry.title})` : ''
  })
}
