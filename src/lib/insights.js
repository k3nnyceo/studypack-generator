// Weak topics: how well a student knows each module of a pack, from their
// latest quiz and exam answers (src/lib/quizResults.js) and their flashcard
// memory (src/lib/cardMemory.js). Plain JS, no React, so it can be tested.
//
// Each practised item scores 0-1: a quiz question answered right last time
// is 1, wrong 0; a flashcard learned and not due is 1, due again 0.6, still
// learning 0. A module's mastery is the average over what's been practised,
// and its status:
//   'new'       fewer than MIN_PRACTISED items practised
//   'weak'      mastery under 60%
//   'improving' 60-84%
//   'strong'    85% or more

import { cardStatus } from './cardMemory.js'

export const MIN_PRACTISED = 3
const CARD_SCORE = { learned: 1, due: 0.6, learning: 0 }
const RANK = { weak: 0, improving: 1, new: 2, strong: 3 }

// { modules: [...], weak, practised, mastery } where each module is
// { index, title, sourceRange, status, mastery, practised, quiz: { total,
// answered, right }, cards: { total, marked, learning }, missed: [question],
// learning: [card] }, weakest first.
export function topicInsights({ modules, questions, cards, results = {}, cardRecords = {}, now = Date.now() }) {
  const list = modules.map((module, index) => {
    const qs = questions.filter((q) => q.moduleIndex === index)
    const cs = cards.filter((c) => c.moduleIndex === index)
    const answered = qs.filter((q) => results[q.id])
    const right = answered.filter((q) => results[q.id].last)
    const marked = cs.map((c) => ({ card: c, status: cardStatus(cardRecords[c.id], now) })).filter((c) => c.status !== 'new')
    const scores = [...answered.map((q) => (results[q.id].last ? 1 : 0)), ...marked.map((c) => CARD_SCORE[c.status])]
    const practised = scores.length
    const mastery = practised ? scores.reduce((a, b) => a + b, 0) / practised : 0
    const status = practised < MIN_PRACTISED ? 'new' : mastery < 0.6 ? 'weak' : mastery < 0.85 ? 'improving' : 'strong'
    // Most-missed first, so the worst questions lead the practice.
    const missed = answered
      .filter((q) => !results[q.id].last)
      .sort((a, b) => results[b.id].missed - results[a.id].missed || results[b.id].at - results[a.id].at)
    return {
      index,
      title: module.title,
      sourceRange: module.sourceRange,
      status,
      mastery,
      practised,
      quiz: { total: qs.length, answered: answered.length, right: right.length },
      cards: { total: cs.length, marked: marked.length, learning: marked.filter((c) => c.status === 'learning').length },
      missed,
      learning: marked.filter((c) => c.status === 'learning').map((c) => c.card),
    }
  })
  const practised = list.reduce((n, m) => n + m.practised, 0)
  const scored = list.filter((m) => m.practised)
  return {
    modules: [...list].sort((a, b) => RANK[a.status] - RANK[b.status] || a.mastery - b.mastery || a.index - b.index),
    weak: list.filter((m) => m.status === 'weak').length,
    practised,
    mastery: practised ? scored.reduce((n, m) => n + m.mastery * m.practised, 0) / practised : 0,
  }
}

// The questions to practise for a module: the ones missed last time first,
// then ones never answered, then the rest; a dozen at most.
export function practiceQuestions(questions, moduleIndex, results = {}, limit = 12) {
  const qs = questions.filter((q) => q.moduleIndex === moduleIndex)
  const missed = qs.filter((q) => results[q.id] && !results[q.id].last)
  const fresh = qs.filter((q) => !results[q.id])
  const rest = qs.filter((q) => results[q.id]?.last)
  return [...missed, ...fresh, ...rest].slice(0, limit)
}
