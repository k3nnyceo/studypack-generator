// Run with: npm test
// Checks how a pack's calls are timed and cached, using a fake Messages stream
// that mimics prompt caching (an entry is readable only after its writer's
// first stream event): a one-token warm-up writes the module calls' cache while
// the plan is made on a fast model, every module reads it, and when the
// warm-up is slow, module 1 (then module 2) write it instead.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { generateStudyGuide } from './studyGuide.js'

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const PREFIX_TOKENS = 4000

const moduleJson = (title) => ({
  title,
  sourceRange: 'Slides 1-2',
  summary: 'A summary.',
  keyPoints: ['A point.'],
  definitions: [{ term: 'Term', definition: 'Meaning.', sourcePages: [1] }],
  workedExamples: [{ title: 'Example', problem: 'Problem.', steps: ['Step.'], answer: 'Answer.', sourcePages: [2] }],
  quiz: [{ question: 'Q?', options: ['A', 'B', 'C', 'D'], correctIndex: 1, explanation: 'Because.', sourcePages: [1] }],
  theory: [{ question: 'Explain.', marks: 5, modelAnswer: 'Answer.', markingPoints: ['Point.'], sourcePages: [2] }],
})

const PLAN = {
  title: 'Guide',
  course: 'EEE 207',
  topic: 'Circuits',
  overview: 'Overview.',
  modules: [1, 2, 3, 4].map((n) => ({ title: `Module ${n}`, sourceRange: `Slides ${n}`, focus: `Focus ${n}.` })),
}

// Each call is { role: 'warm' | 'plan' | 'module', module (1-based), params,
// sentAt, firstEventAt }. `firstEventMs(call)` sets how long it waits before
// its first stream event; `failBeforeStart(call)` makes it fail instead.
function fakeClient({ firstEventMs = () => 5, durationMs = 30, failBeforeStart = () => false } = {}) {
  const t0 = Date.now()
  const calls = []
  const readable = new Set() // cached prefixes whose writer has started
  const stream = (params) => {
    const instruction = params.messages[0].content.at(-1).text
    const role = params.max_tokens === 1 ? 'warm' : 'modules' in params.output_config.format.schema.properties ? 'plan' : 'module'
    const call = { role, module: Number(instruction.match(/write module (\d+) of/)?.[1]) || null, params, sentAt: Date.now() - t0, firstEventAt: null }
    calls.push(call)
    const emitter = new EventEmitter()
    const key = prefixOf(params).some((block) => block.cache_control) ? cacheKey(params) : null
    const hit = key !== null && readable.has(key)
    let aborted = false
    const done = (async () => {
      await sleep(firstEventMs(call))
      if (aborted) throw new Error('Request was aborted.')
      if (failBeforeStart(call)) throw new Error('400 bad request')
      call.firstEventAt = Date.now() - t0
      if (key) readable.add(key)
      emitter.emit('streamEvent', { type: 'message_start' })
      if (role !== 'warm') await sleep(durationMs)
      if (aborted) throw new Error('Request was aborted.')
      const title = instruction.match(/Module to write: (.*)/)?.[1]
      return {
        model: params.model,
        stop_reason: role === 'warm' ? 'max_tokens' : 'end_turn',
        content: role === 'warm' ? [] : [{ type: 'text', text: JSON.stringify(role === 'plan' ? PLAN : moduleJson(title)) }],
        usage: {
          input_tokens: key ? 200 : PREFIX_TOKENS + 200,
          cache_creation_input_tokens: key && !hit ? PREFIX_TOKENS : 0,
          cache_read_input_tokens: hit ? PREFIX_TOKENS : 0,
          output_tokens: role === 'warm' ? 1 : 1000,
        },
      }
    })()
    done.catch(() => {})
    return Object.assign(emitter, {
      finalMessage: () => done,
      abort: () => (aborted = true),
    })
  }
  const messages = { stream }
  const of = (role) => calls.filter((c) => c.role === role)
  return { calls, of, client: { messages, beta: { messages } } }
}

// The notes blocks (text, then any diagram pictures): everything before the
// instruction, which comes last.
const prefixOf = (params) => params.messages[0].content.slice(0, -1)

// Everything that's part of the cached prefix: model, thinking and effort
// settings, output schema, system prompt, and the notes blocks.
function cacheKey(params) {
  const { model, thinking, output_config, system } = params
  return JSON.stringify({ model, thinking, output_config, system, notes: prefixOf(params) })
}

async function run(fake, timing, extra = {}) {
  const logs = []
  const log = console.log
  console.log = (line) => logs.push(line)
  try {
    const guide = await generateStudyGuide({ text: '[[Slide 1]] Ohm’s law.', fileName: 'eee207.pdf', theory: true, client: fake.client, timing, ...extra })
    return { guide, summary: logs.find((l) => l.startsWith('[study-guide] ok')), logs }
  } finally {
    console.log = log
  }
}

test('the warm-up writes the cache while the plan is made; every module starts at once and reads it', async () => {
  const fake = fakeClient({ firstEventMs: (c) => (c.role === 'plan' ? 60 : 5) })
  const { guide, summary } = await run(fake)
  assert.equal(guide.modules.length, 4)
  const [warm] = fake.of('warm')
  const [plan] = fake.of('plan')
  const modules = fake.of('module')
  assert.equal(modules.length, 4)

  assert.ok(warm.sentAt <= plan.sentAt + 5, 'the warm-up goes out with the plan')
  assert.equal(cacheKey(warm.params), cacheKey(modules[0].params), 'it warms exactly the modules’ prefix')
  for (const m of modules) {
    assert.equal(cacheKey(m.params), cacheKey(modules[0].params))
    assert.ok(m.sentAt - modules[0].sentAt < 15, 'no module waits for another to start')
  }
  assert.equal(new Set(modules.map((m) => m.params.messages[0].content.at(-1).text)).size, 4, 'each module gets its own instruction')
  assert.match(summary, new RegExp(`cache_write=${PREFIX_TOKENS} cache_read=${4 * PREFIX_TOKENS} `), 'one write, four reads')
})

test('the plan runs on Haiku without thinking or effort, and isn’t cached', async () => {
  const fake = fakeClient()
  await run(fake)
  const [plan] = fake.of('plan')
  assert.match(plan.params.model, /haiku/)
  assert.equal(plan.params.thinking, undefined)
  assert.equal(plan.params.output_config.effort, undefined)
  assert.ok(!prefixOf(plan.params).some((b) => b.cache_control))
  const [module1] = fake.of('module')
  assert.deepEqual(module1.params.thinking, { type: 'adaptive' })
  assert.ok(module1.params.output_config.effort)
})

test('a slow warm-up and module 1 get module 2 as another writer; the rest wait for whichever starts first', async () => {
  const fake = fakeClient({ firstEventMs: (c) => (c.role === 'warm' || c.module === 1 ? 400 : 5) })
  await run(fake, { cacheHedgeMs: 50, cacheWaitMs: 2000 })
  const [first, second, ...rest] = fake.of('module')
  assert.ok(second.sentAt >= first.sentAt + 45 && second.sentAt < first.firstEventAt, 'module 2 is sent at the hedge time')
  for (const call of rest) {
    assert.ok(call.sentAt >= second.firstEventAt, 'later modules wait for module 2 to start')
    assert.ok(call.sentAt < first.firstEventAt, "later modules don't wait for slow module 1")
  }
})

test('the other modules go anyway once the cache wait runs out', async () => {
  const fake = fakeClient({ firstEventMs: (c) => (c.role === 'warm' || c.module === 1 || c.module === 2 ? 500 : 5) })
  await run(fake, { cacheHedgeMs: 50, cacheWaitMs: 150 })
  const [first, , ...rest] = fake.of('module')
  for (const call of rest) assert.ok(call.sentAt - first.sentAt >= 145 && call.sentAt < first.firstEventAt, `sent at ${call.sentAt}ms`)
})

test('a failed warm-up only costs time: module 1 writes the cache instead', async () => {
  const fake = fakeClient({ failBeforeStart: (c) => c.role === 'warm' })
  const { guide, summary } = await run(fake, { cacheHedgeMs: 1000, cacheWaitMs: 2000 })
  assert.equal(guide.modules.length, 4)
  const [first, ...rest] = fake.of('module')
  for (const call of rest) assert.ok(call.sentAt >= first.firstEventAt, 'the others wait for module 1')
  assert.match(summary, new RegExp(`cache_write=${PREFIX_TOKENS} cache_read=${3 * PREFIX_TOKENS} `))
})

test('if module 1 fails before starting and nothing else wrote the cache, the rest are never sent', async () => {
  const fake = fakeClient({ failBeforeStart: (c) => c.role === 'warm' || c.module === 1 })
  await assert.rejects(run(fake, { cacheHedgeMs: 1000, cacheWaitMs: 2000 }), /400 bad request/)
  assert.equal(fake.of('module').length, 1)
})

test('diagram pages go to the warm-up and module writers inside the cached prefix, not to the plan', async () => {
  const fake = fakeClient()
  const images = [
    { ref: 9, unit: 'Page', mediaType: 'image/jpeg', data: 'AAAA' },
    { ref: 21, unit: 'Page', mediaType: 'image/jpeg', data: 'BBBB' },
  ]
  await run(fake, undefined, { text: '[[Page 9]] Block diagram.', images })
  const [plan] = fake.of('plan')
  assert.ok(!plan.params.messages[0].content.some((b) => b.type === 'image'), 'the plan is made from the text alone')
  const writers = [...fake.of('warm'), ...fake.of('module')]
  for (const call of writers) {
    const prefix = prefixOf(call.params)
    assert.deepEqual(
      prefix.filter((b) => b.type === 'image').map((b) => b.source.data),
      ['AAAA', 'BBBB'],
    )
    // Each picture is labelled with its marker, right before it.
    const labels = prefix.flatMap((b, i) => (b.type === 'image' ? [prefix[i - 1].text] : []))
    assert.deepEqual(labels, ['[[Page 9]]', '[[Page 21]]'])
    // One cache breakpoint, on the last picture, so the notes and pictures are cached together.
    assert.deepEqual(prefix.map((b) => Boolean(b.cache_control)), prefix.map((_, i) => i === prefix.length - 1))
    assert.equal(cacheKey(call.params), cacheKey(writers[0].params))
  }
  for (const m of fake.of('module')) assert.match(m.params.messages[0].content.at(-1).text, /^Stage 2 of 2/)
})
