// Run with: npm test
// Diagram pages (Phase 2 of the source viewer): what the server accepts from
// the device, and how many a plan and its allowance let through.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estimateCostUsd, pictureCostUsd, plansFromEnv } from './plans.js'
import { readImages } from './studyGuideHandler.js'
import { createMeter, memoryStore } from './usageLimits.js'

const page = (ref, bytes = 3000) => ({ ref, unit: 'Page', mediaType: 'image/jpeg', data: 'A'.repeat(Math.ceil((bytes * 4) / 3 / 4) * 4) })

test('only well-formed, small enough diagram pages are accepted', () => {
  assert.deepEqual(readImages(undefined), [])
  assert.equal(readImages([page(9), page(21)]).length, 2)
  assert.ok(readImages([{ ...page(9), mediaType: 'image/svg+xml' }]).error, 'SVG could carry scripts')
  assert.ok(readImages([{ ...page(9), unit: 'Chapter' }]).error)
  assert.ok(readImages([{ ...page(9), ref: 0 }]).error)
  assert.ok(readImages([{ ...page(9), data: 'not base64!' }]).error)
  assert.ok(readImages([page(9, 500 * 1024)]).error, 'one page over 450 KB')
  assert.ok(readImages(Array.from({ length: 10 }, (_, i) => page(i + 1, 400 * 1024))).error, 'over 3.5 MB together')
  assert.ok(readImages(Array.from({ length: 21 }, (_, i) => page(i + 1))).error, 'more than 20')
})

test('diagram pages are a paid-plan feature, capped per pack', () => {
  const plans = plansFromEnv({})
  assert.equal(plans.free.diagramPages, 0)
  assert.equal(plans.pro.diagramPages, 10)
  assert.equal(plans.max.diagramPages, 10)
  const custom = plansFromEnv({ DIAGRAM_PLANS: 'max', MAX_DIAGRAM_PAGES: '6' })
  assert.equal(custom.pro.diagramPages, 0)
  assert.equal(custom.max.diagramPages, 6)
  assert.ok(Math.abs(estimateCostUsd(11000, true, 10) - estimateCostUsd(11000, true) - 10 * pictureCostUsd({})) < 1e-9)
})

const sub = (plan) => ({ plan, periodStart: 0, periodEnd: Date.now() + 864e5 * 30 })

test('the meter lets through as many pages as the plan and allowance allow', async () => {
  const meter = createMeter(memoryStore(), { plans: plansFromEnv({}), env: {} })
  const free = await meter.reserve('u-free', null, 11000, 7)
  assert.equal(free.ok, true)
  assert.equal(free.pictures, 0, 'Free sends none')

  const pro = await meter.reserve('u-pro', sub('pro'), 11000, 14)
  assert.equal(pro.pictures, 10, 'capped at the plan limit')

  // An allowance with room for the notes but only some pictures.
  const plans = plansFromEnv({})
  const notesOnly = Math.ceil(estimateCostUsd(11000, true) * 1600)
  plans.pro.windowNaira = notesOnly + Math.floor(3.5 * pictureCostUsd({}) * 1600)
  const tight = await createMeter(memoryStore(), { plans, env: {} }).reserve('u', sub('pro'), 11000, 10)
  assert.equal(tight.ok, true)
  assert.equal(tight.pictures, 3, 'pictures that would pass the allowance are dropped, not the pack')
})

test('nearly out of allowance: the pack still goes, without its pictures', async () => {
  const plans = plansFromEnv({})
  const store = memoryStore()
  const meter = createMeter(store, { plans, env: {} })
  const notesOnly = Math.ceil(estimateCostUsd(11000, true) * 1600)
  // Use all but one pack's worth of this window.
  const filler = await meter.reserveCost('u', sub('pro'), plans.pro.windowNaira - notesOnly)
  assert.equal(filler.ok, true)
  const slot = await meter.reserve('u', sub('pro'), 11000, 10)
  assert.equal(slot.ok, true)
  assert.equal(slot.pictures, 0)
})
