import { shuffled } from './flashcards.js'

const MAX_OPTIONS = 4

// Options like "All of the above" or "Both A and B" depend on their position,
// so questions containing one keep the author's order.
const POSITIONAL_OPTION = /\b(all|none|both|neither) of (the )?(above|these|them)\b|\b[A-D] (and|or|&) [A-D]\b/i

// Builds quiz questions for every module. A module's own `quiz` questions are
// used when present, with their options shuffled so the right answer isn't
// always in the same position (AI-written quizzes often favour one letter); otherwise questions are generated from its definitions
// ("Which term matches this definition?"), with other terms as distractors.
//
// `optionNotes` runs parallel to `options`: for generated questions it holds
// each wrong term's own definition, so feedback can explain why it's wrong.
export function buildQuiz(guide) {
  const allTerms = guide.modules.flatMap((module, m) => module.definitions.map((d) => ({ ...d, moduleIndex: m })))

  return guide.modules.flatMap((module, m) => {
    if (module.quiz?.length > 0) {
      return module.quiz.map((q, i) => {
        const keepOrder = q.options.some((option) => POSITIONAL_OPTION.test(option))
        const order = keepOrder ? q.options.map((_, j) => j) : shuffled(q.options.map((_, j) => j))
        const options = order.map((j) => q.options[j])
        return {
          id: `m${m}-q${i}`,
          moduleIndex: m,
          moduleTitle: module.title,
          generated: false,
          question: q.question,
          quote: '',
          options,
          correctIndex: order.indexOf(q.correctIndex),
          explanation: q.explanation,
          optionNotes: options.map(() => ''),
        }
      })
    }

    return module.definitions.flatMap((def, i) => {
      const distractors = pickDistractors(def, m, allTerms)
      if (distractors.length === 0) return [] // a lone term can't make a question

      const options = shuffled([def.term, ...distractors.map((d) => d.term)])
      return [
        {
          id: `m${m}-auto${i}`,
          moduleIndex: m,
          moduleTitle: module.title,
          generated: true,
          question: 'Which term matches this definition?',
          quote: def.definition,
          options,
          correctIndex: options.indexOf(def.term),
          explanation: `This is the definition of “${def.term}”. The other options are related terms from your notes that mean something different:`,
          optionNotes: options.map((term) => distractors.find((d) => d.term === term)?.definition ?? ''),
        },
      ]
    })
  })
}

// Prefers terms from the same module (closer, so harder to guess), then fills
// from the rest of the guide. Skips duplicates of the correct term.
function pickDistractors(def, moduleIndex, allTerms) {
  const key = (term) => term.trim().toLowerCase()
  const seen = new Set([key(def.term)])
  const sameModule = shuffled(allTerms.filter((t) => t.moduleIndex === moduleIndex))
  const otherModules = shuffled(allTerms.filter((t) => t.moduleIndex !== moduleIndex))

  const picked = []
  for (const candidate of [...sameModule, ...otherModules]) {
    if (picked.length === MAX_OPTIONS - 1) break
    if (seen.has(key(candidate.term))) continue
    seen.add(key(candidate.term))
    picked.push(candidate)
  }
  return picked
}
