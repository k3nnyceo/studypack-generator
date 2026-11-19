// Run with: npm test
// "Ask your library": choosing which packs to answer from (src/lib/askContext.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildLibraryContext, withPackNames } from './askContext.js'

const mod = (title, summary) => ({ title, summary, keyPoints: [], definitions: [], workedExamples: [] })
const entry = (id, course, topic, modules) => ({ id, course, topic, title: topic, guide: { title: topic, course, modules } })

const library = [
  entry('chm', 'CHM 101', 'Atomic structure', [mod('Electrons', 'Shells, orbitals and electron configuration.'), mod('Isotopes', 'Same protons, different neutrons.')]),
  entry('phy', 'PHY 101', 'Motion', [mod('Kinematics', 'Velocity and acceleration in a straight line.'), mod('Projectiles', 'Motion in two dimensions.')]),
  entry('mth', 'MTH 101', 'Algebra', [mod('Quadratics', 'Solving quadratic equations by formula.')]),
]

test('the packs that match the question come first, with numbered markers', () => {
  const built = buildLibraryContext({ entries: library, question: 'How do I find acceleration from velocity?' })
  assert.equal(built.kind, 'library')
  assert.equal(built.packs[1], 'phy')
  assert.match(built.context, /\[\[Pack 1\]\] Motion \(PHY 101\)[\s\S]*Kinematics/)
  assert.ok(!built.context.includes('Quadratics'), 'unrelated packs are left out')
})

test('a general question takes from every pack; a course code picks that course', () => {
  const general = buildLibraryContext({ entries: library, question: 'What should I revise first?' })
  assert.equal(Object.keys(general.packs).length, 3)
  const byCourse = buildLibraryContext({ entries: library, question: 'Summarise CHM 101 for me' })
  assert.equal(byCourse.packs[1], 'chm')
})

test('a big library is cut to the budget', () => {
  const long = 'x'.repeat(5000)
  const big = Array.from({ length: 30 }, (_, i) => entry(`p${i}`, 'GST 111', `Topic ${i}`, [mod(`Part ${i}`, `velocity ${long}`)]))
  const built = buildLibraryContext({ entries: big, question: 'velocity' })
  assert.ok(built.partial)
  assert.ok(built.context.length < 50_000)
  assert.equal(buildLibraryContext({ entries: [], question: 'hi' }), null)
})

test('earlier answers name packs instead of old numbers', () => {
  assert.equal(withPackNames('See [[Pack 2]] and [[Pack 9]].', { 2: 'mth' }, library), 'See (Algebra) and .')
  assert.equal(withPackNames('See [[Pack 2, Module 1]].', { 2: 'mth' }, library), 'See (Algebra).')
})
