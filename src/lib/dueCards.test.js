// Run with: npm test
// Flashcards due across the library (src/lib/dueCards.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { duePacks } from './dueCards.js'
import { buildFlashcards } from './flashcards.js'

const DAY = 864e5
const NOW = Date.UTC(2026, 10, 20, 9)

const guide = (title, terms) => ({
  title,
  overview: '',
  modules: [{ title: 'M1', summary: 's', keyPoints: [], definitions: terms.map((term) => ({ term, definition: `${term} means…` })), workedExamples: [], quiz: [] }],
})
const entry = (title, terms) => ({ fingerprint: `fp-${title}`, guide: guide(title, terms) })

test('counts missed and due cards per pack, most first; new and later cards don’t count', () => {
  const a = entry('A', ['x', 'y', 'z'])
  const b = entry('B', ['p', 'q'])
  const c = entry('C', ['r'])
  const [ax, ay, az] = buildFlashcards(a.guide).map((card) => card.id)
  const [bp, bq] = buildFlashcards(b.guide).map((card) => card.id)
  const memory = {
    'fp-A': { [ax]: { box: 0, due: NOW }, [ay]: { box: 2, due: NOW - DAY }, [az]: { box: 3, due: NOW + 5 * DAY } },
    'fp-B': { [bp]: { box: 1, due: NOW - 1 } },
    // C was never studied: nothing due.
  }
  const { packs, total } = duePacks([b, a, c], memory, NOW)
  assert.equal(total, 3)
  assert.deepEqual(
    packs.map((p) => [p.entry.guide.title, p.due]),
    [
      ['A', 2],
      ['B', 1],
    ],
  )
  assert.equal(bq !== undefined, true)
})

test('cards a pack no longer has are ignored', () => {
  const a = entry('A', ['x'])
  const memory = { 'fp-A': { 'gone-card': { box: 0, due: NOW } } }
  assert.deepEqual(duePacks([a], memory, NOW), { packs: [], total: 0 })
})
