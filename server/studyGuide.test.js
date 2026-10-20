// Run with: npm test
// Checks that the module calls share one cached prefix and that modules 2+
// are only sent once a cache writer's response has started, using a fake
// Messages stream that mimics prompt caching (an entry is readable only after
// its writer's first stream event).
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

// `firstEventMs(callIndex)` sets how long each call waits before its first
// stream event (call 0 is the plan, 1 is module 1, and so on).
function fakeClient({ firstEventMs = () => 5, durationMs = 30, failBeforeStart = () => false } = {}) {
  const t0 = Date.now()
  const calls = []
  const readable = new Set() // cached prefixes whose writer has started
  const stream = (params) => {
    const index = calls.length
    const call = { params, sentAt: Date.now() - t0, firstEventAt: null }
    calls.push(call)
    const emitter = new EventEmitter()
    const key = prefixOf(params).some((block) => block.cache_control) ? cacheKey(params) : null
    const hit = key !== null && readable.has(key)
    let aborted = false
    const done = (async () => {
      await sleep(firstEventMs(index))
      if (aborted) throw new Error('Request was aborted.')
      if (failBeforeStart(index)) throw new Error('400 bad request')
      call.firstEventAt = Date.now() - t0
      if (key) readable.add(key)
      emitter.emit('streamEvent', { type: 'message_start' })
      await sleep(durationMs)
      if (aborted) throw new Error('Request was aborted.')
      const isPlan = 'modules' in params.output_config.format.schema.properties
      const title = params.messages[0].content.at(-1).text.match(/Module to write: (.*)/)?.[1]
      return {
        model: params.model,
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: JSON.stringify(isPlan ? PLAN : moduleJson(title)) }],
        usage: {
          input_tokens: key ? 200 : PREFIX_TOKENS + 200,
          cache_creation_input_tokens: key && !hit ? PREFIX_TOKENS : 0,
          cache_read_input_tokens: hit ? PREFIX_TOKENS : 0,
          output_tokens: 1000,
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
  return { calls, client: { messages, beta: { messages } } }
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

const run = (fake, timing) =>
  generateStudyGuide({ text: '[[Slide 1]] Ohm’s law.', fileName: 'eee207.pdf', theory: true, client: fake.client, timing })

test('module calls share an identical cached prefix and wait for module 1 to start', async () => {
  const fake = fakeClient({ firstEventMs: (i) => (i === 1 ? 60 : 5) })
  const guide = await run(fake)
  assert.equal(guide.modules.length, 4)
  const [plan, first, ...rest] = fake.calls
  assert.equal(fake.calls.length, 5)

  assert.equal(plan.params.messages[0].content[0].cache_control, undefined)
  for (const call of [first, ...rest]) {
    assert.deepEqual(call.params.messages[0].content[0].cache_control, { type: 'ephemeral' })
    assert.equal(cacheKey(call.params), cacheKey(first.params))
  }
  for (const call of rest) assert.ok(call.sentAt >= first.firstEventAt, `sent at ${call.sentAt}ms, before module 1 started at ${first.firstEventAt}ms`)

  const modules = fake.calls.slice(1).map((c) => c.params)
  assert.equal(new Set(modules.map((p) => p.messages[0].content[1].text)).size, 4, 'each module gets its own instruction after the cached notes')
})

test('only module 1 writes the cache; the others read it', async () => {
  const fake = fakeClient()
  const logs = []
  const log = console.log
  console.log = (line) => logs.push(line)
  try {
    await run(fake)
  } finally {
    console.log = log
  }
  const summary = logs.find((l) => l.startsWith('[study-guide] ok'))
  assert.match(summary, new RegExp(`cache_write=${PREFIX_TOKENS} cache_read=${3 * PREFIX_TOKENS} `))
})

test('a slow module 1 gets module 2 as a second writer, and the rest wait for whichever starts first', async () => {
  const fake = fakeClient({ firstEventMs: (i) => (i === 1 ? 400 : 5) })
  await run(fake, { cacheHedgeMs: 50, cacheWaitMs: 2000 })
  const [, first, second, ...rest] = fake.calls
  assert.ok(second.sentAt >= 50 + first.sentAt - 5 && second.sentAt < first.firstEventAt, 'module 2 is sent at the hedge time')
  for (const call of rest) {
    assert.ok(call.sentAt >= second.firstEventAt, 'later modules wait for module 2 to start')
    assert.ok(call.sentAt < first.firstEventAt, "later modules don't wait for slow module 1")
    assert.equal(cacheKey(call.params), cacheKey(first.params))
  }
})

test('the other modules go anyway once the cache wait runs out', async () => {
  const fake = fakeClient({ firstEventMs: (i) => (i === 1 || i === 2 ? 500 : 5) })
  await run(fake, { cacheHedgeMs: 50, cacheWaitMs: 150 })
  const [, first, , ...rest] = fake.calls
  for (const call of rest) {
    assert.ok(call.sentAt - first.sentAt >= 145 && call.sentAt < first.firstEventAt, `sent at ${call.sentAt}ms`)
  }
})

test('if module 1 fails before starting, the pack fails without sending the rest', async () => {
  const fake = fakeClient({ firstEventMs: () => 5, failBeforeStart: (i) => i === 1 })
  await assert.rejects(run(fake, { cacheHedgeMs: 1000, cacheWaitMs: 2000 }), /400 bad request/)
  assert.equal(fake.calls.length, 2)
})

test('diagram pages go to the module writers inside the cached prefix, not to the plan', async () => {
  const fake = fakeClient()
  const images = [
    { ref: 9, unit: 'Page', mediaType: 'image/jpeg', data: 'AAAA' },
    { ref: 21, unit: 'Page', mediaType: 'image/jpeg', data: 'BBBB' },
  ]
  await generateStudyGuide({ text: '[[Page 9]] Block diagram.', fileName: 'eee207.pdf', images, client: fake.client })
  const [plan, first, ...rest] = fake.calls

  assert.ok(!plan.params.messages[0].content.some((b) => b.type === 'image'), 'the plan is made from the text alone')
  for (const call of [first, ...rest]) {
    const content = call.params.messages[0].content
    const prefix = content.slice(0, -1)
    assert.deepEqual(
      prefix.filter((b) => b.type === 'image').map((b) => b.source.data),
      ['AAAA', 'BBBB'],
    )
    // Each picture is labelled with its marker, right before it.
    const labels = prefix.flatMap((b, i) => (b.type === 'image' ? [prefix[i - 1].text] : []))
    assert.deepEqual(labels, ['[[Page 9]]', '[[Page 21]]'])
    // One cache breakpoint, on the last picture, so the notes and pictures are cached together.
    assert.deepEqual(prefix.map((b) => Boolean(b.cache_control)), prefix.map((_, i) => i === prefix.length - 1))
    assert.match(content.at(-1).text, /^Stage 2 of 2/)
    assert.equal(cacheKey(call.params), cacheKey(first.params))
  }
})
