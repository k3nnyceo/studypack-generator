// Run with: npm test
// Weak topics (src/lib/insights.js) from quiz results and flashcard memory.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { practiceQuestions, topicInsights } from './insights.js'
import { nextResult } from './quizResults.js'

const DAY = 864e5
const now = Date.UTC(2026, 9, 21)
const modules = [{ title: 'Standards', sourceRange: 'Pages 6-8' }, { title: 'Elements', sourceRange: 'Pages 9-11' }, { title: 'Classification' }]
const questions = [0, 1, 2].flatMap((m) => [0, 1, 2, 3].map((i) => ({ id: `m${m}-q${i}`, moduleIndex: m, question: `Q${m}.${i}` })))
const cards = [0, 1, 2].flatMap((m) => [0, 1, 2].map((i) => ({ id: `m${m}-d${i}`, moduleIndex: m })))
const answer = (correct, times = 1) => {
  let r
  for (let i = 0; i < times; i++) r = nextResult(r, correct, now - (times - i) * 1000)
  return r
}

test('modules are rated from the latest answers and card memory, weakest first', () => {
  const results = {
    // Standards: 3 of 4 wrong last time -> weak
    'm0-q0': answer(false, 2),
    'm0-q1': answer(false),
    'm0-q2': answer(false),
    'm0-q3': answer(true),
    // Elements: right, plus learned cards -> strong
    'm1-q0': answer(true),
    'm1-q1': answer(true),
  }
  const cardRecords = {
    'm0-d0': { box: 0, due: now },
    'm1-d0': { box: 2, due: now + 3 * DAY },
    'm1-d1': { box: 3, due: now + 7 * DAY },
  }
  const insight = topicInsights({ modules, questions, cards, results, cardRecords, now })
  const [first, second, third] = insight.modules
  assert.equal(first.title, 'Standards')
  assert.equal(first.status, 'weak')
  assert.equal(first.practised, 5)
  assert.equal(Math.round(first.mastery * 100), 20)
  assert.deepEqual(first.missed.map((q) => q.id), ['m0-q0', 'm0-q1', 'm0-q2'], 'the most-missed question leads')
  assert.deepEqual(first.learning.map((c) => c.id), ['m0-d0'])
  assert.equal(second.title, 'Classification')
  assert.equal(second.status, 'new', 'nothing practised yet')
  assert.equal(third.title, 'Elements')
  assert.equal(third.status, 'strong')
  assert.equal(insight.weak, 1)
})

test('a module needs a few practised items before it is rated', () => {
  const insight = topicInsights({ modules, questions, cards, results: { 'm2-q0': answer(false), 'm2-q1': answer(false) }, now })
  assert.equal(insight.modules.find((m) => m.index === 2).status, 'new')
})

test('getting a missed question right moves the topic up', () => {
  const results = { 'm0-q0': answer(false), 'm0-q1': answer(false), 'm0-q2': answer(true) }
  assert.equal(topicInsights({ modules, questions, cards, results, now }).modules[0].status, 'weak')
  results['m0-q0'] = nextResult(results['m0-q0'], true, now)
  results['m0-q1'] = nextResult(results['m0-q1'], true, now)
  const after = topicInsights({ modules, questions, cards, results, now }).modules.find((m) => m.index === 0)
  assert.equal(after.status, 'strong')
  assert.equal(results['m0-q0'].missed, 1, 'the miss is still counted in its history')
})

test('practice puts missed questions first, then new ones', () => {
  const results = { 'm0-q2': answer(false), 'm0-q0': answer(true) }
  assert.deepEqual(practiceQuestions(questions, 0, results).map((q) => q.id), ['m0-q2', 'm0-q1', 'm0-q3', 'm0-q0'])
})
