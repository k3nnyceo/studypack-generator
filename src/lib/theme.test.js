// Run with: npm test
// Dark mode's choice (src/lib/theme.js).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { isDark, readChoice } from './theme.js'

test('the device setting is followed until the student picks', () => {
  assert.equal(isDark(null, true), true)
  assert.equal(isDark(null, false), false)
  assert.equal(isDark('light', true), false)
  assert.equal(isDark('dark', false), true)
})

test('a saved choice is read safely', () => {
  assert.equal(readChoice({ getItem: () => 'dark' }), 'dark')
  assert.equal(readChoice({ getItem: () => 'purple' }), null)
  assert.equal(readChoice({ getItem: () => { throw new Error('blocked') } }), null)
})
