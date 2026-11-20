// Run with: npm test
// Background sound for focus sessions (src/lib/studySound.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { noise, readSound } from './studySound.js'

test('the saved choice is read safely', () => {
  assert.deepEqual(readSound({ getItem: () => JSON.stringify({ sound: 'rain', volume: 0.3 }) }), { sound: 'rain', volume: 0.3 })
  assert.deepEqual(readSound({ getItem: () => JSON.stringify({ sound: 'jazz', volume: 1 }) }), { sound: 'off', volume: 0.5 })
  assert.equal(readSound({ getItem: () => JSON.stringify({ sound: 'waves', volume: 9 }) }).volume, 1)
  assert.deepEqual(readSound({ getItem: () => 'oops' }), { sound: 'off', volume: 0.5 })
})

test('the noise stays within range, so it never clips', () => {
  let seed = 7
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
  for (const kind of ['pink', 'brown']) {
    const samples = noise(kind, 48000 * 8, random)
    const peak = samples.reduce((m, x) => Math.max(m, Math.abs(x)), 0)
    assert.ok(peak > 0.05 && peak <= 1, `${kind} peak ${peak}`)
  }
})
