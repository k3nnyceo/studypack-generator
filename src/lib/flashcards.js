// Turns a generated study guide into flashcards: one card per definition
// (term -> definition) and one per worked example (problem -> answer).
export function buildFlashcards(guide) {
  return guide.modules.flatMap((module, m) => [
    ...module.definitions.map((def, i) => ({
      id: `m${m}-d${i}`,
      moduleIndex: m,
      moduleTitle: module.title,
      kind: 'definition',
      front: def.term,
      back: def.definition,
    })),
    ...module.workedExamples.map((example, i) => ({
      id: `m${m}-e${i}`,
      moduleIndex: m,
      moduleTitle: module.title,
      kind: 'example',
      front: example.problem,
      back: example.answer,
    })),
  ])
}

// Fisher-Yates shuffle; returns a new array.
export function shuffled(items) {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}
