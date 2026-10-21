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

// The study pack as plain text, module by module.
export function packText(guide) {
  const parts = [`${guide.title}${guide.course ? ` (${guide.course})` : ''}`, guide.overview]
  for (const [i, m] of guide.modules.entries()) {
    parts.push(
      [
        `Module ${i + 1}: ${m.title}${m.sourceRange ? ` [${m.sourceRange}]` : ''}`,
        m.summary,
        m.keyPoints?.length ? `Key points:\n${m.keyPoints.map((p) => `- ${p}`).join('\n')}` : '',
        m.definitions?.length ? `Definitions:\n${m.definitions.map((d) => `- ${d.term}: ${d.definition}`).join('\n')}` : '',
        m.workedExamples?.length
          ? `Worked examples:\n${m.workedExamples.map((e) => `- ${e.title}: ${e.problem} Answer: ${e.answer}`).join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
  }
  return parts.filter(Boolean).join('\n\n')
}
