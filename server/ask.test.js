// Run with: npm test
// "Ask about this pack" (server/ask.js) with a fake Claude stream: answers
// stream as JSON lines and are charged at their real cost; the notes open the
// conversation and are cached; bad input, signed-out students and spent
// allowances are refused before anything is generated.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { handleAskRequest, readInput, streamAnswer } from './ask.js'
import { plansFromEnv } from './plans.js'
import { createMeter, memoryStore } from './usageLimits.js'

const env = {}
const user = { id: 'u1' }
const notes = '[[Page 1]] Measurement\nComparing a quantity with a standard.\n\n[[Page 4]] Standards\nPrimary and secondary standards.'

function fakeClient({ pieces = ['A standard ', 'is a reference [[Page 4]].'], fail = false } = {}) {
  const calls = []
  const stream = (params) => {
    calls.push(params)
    const emitter = new EventEmitter()
    const done = (async () => {
      await new Promise((r) => setTimeout(r, 5))
      if (fail) throw new Error('bedrock down')
      for (const p of pieces) emitter.emit('text', p)
      return { model: params.model, usage: { input_tokens: 40, cache_creation_input_tokens: 2000, cache_read_input_tokens: 0, output_tokens: 120 } }
    })()
    done.catch(() => {})
    return Object.assign(emitter, { finalMessage: () => done })
  }
  return { calls, client: { messages: { stream } } }
}

function response() {
  return {
    statusCode: 0,
    chunks: [],
    writableEnded: false,
    on() {},
    setHeader() {},
    writeHead(code) {
      this.statusCode = code
    },
    write(text) {
      this.chunks.push(text)
    },
    end(text) {
      if (text) this.chunks.push(text)
      this.writableEnded = true
    },
    lines() {
      return this.chunks.join('').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    },
  }
}

const setup = () => {
  const store = memoryStore()
  return { store, meter: createMeter(store, { plans: plansFromEnv(env), env }) }
}

async function ask(deps, body, client = fakeClient().client) {
  const res = response()
  await handleAskRequest({ method: 'POST', headers: {} }, res, body, {
    ...deps,
    env,
    getUser: async () => deps.user ?? user,
    answer: (input) => streamAnswer({ ...input, client }),
  })
  return res
}

test('an answer streams as JSON lines and is charged at its real cost', async () => {
  const deps = setup()
  const fake = fakeClient()
  const res = await ask(deps, { question: 'What is a standard?', context: notes, kind: 'notes', title: 'EEE 207' }, fake.client)
  assert.equal(res.statusCode, 200)
  const lines = res.lines()
  assert.equal(lines.filter((l) => l.text).map((l) => l.text).join(''), 'A standard is a reference [[Page 4]].')
  assert.deepEqual(lines.at(-1), { done: true })
  const status = await deps.meter.status(user.id, null)
  assert.ok(status.period.used > 0 && status.period.used < 20, `charged ₦${status.period.used}, the real cost (Haiku on Free)`)
  assert.match(fake.calls[0].model, /haiku/, 'Free is answered by the fast model')
})

test('the notes open the conversation, cached; earlier turns follow in order', async () => {
  const deps = setup()
  const fake = fakeClient()
  const history = [
    { role: 'assistant', text: 'stray reply first' },
    { role: 'user', text: 'What is measurement?' },
    { role: 'assistant', text: 'Comparing with a standard [[Page 1]].' },
  ]
  await ask(deps, { question: 'And a primary standard?', history, context: notes, title: 'EEE 207' }, fake.client)
  const { messages, system } = fake.calls[0]
  assert.match(system, /\[\[Page 4\]\]/, 'the system prompt explains the page markers')
  assert.deepEqual(messages.map((m) => m.role), ['user', 'assistant', 'user'])
  assert.equal(messages[0].content[0].cache_control.type, 'ephemeral')
  assert.match(messages[0].content[0].text, /<lecture_notes title="EEE 207">[\s\S]*Primary and secondary/)
  assert.equal(messages[0].content[1].text, 'What is measurement?')
  assert.equal(messages[2].content, 'And a primary standard?')
})

test('signed-out students, empty questions and oversized lectures are refused', async () => {
  const deps = setup()
  const signedOut = response()
  await handleAskRequest({ method: 'POST', headers: {} }, signedOut, { question: 'Hi', context: notes }, { ...deps, env, getUser: async () => null })
  assert.equal(signedOut.statusCode, 401)
  assert.ok(readInput({ question: '  ', context: notes }).error)
  assert.ok(readInput({ question: 'x'.repeat(1001), context: notes }).error)
  assert.ok(readInput({ question: 'Hi', context: '' }).error)
  assert.ok(readInput({ question: 'Hi', context: 'x'.repeat(60_001) }).error)
})

test('a spent allowance is refused before anything is generated', async () => {
  const deps = setup()
  const plans = plansFromEnv(env)
  await deps.meter.reserveCost(user.id, null, plans.free.periodNaira)
  const fake = fakeClient()
  const res = await ask(deps, { question: 'What is a standard?', context: notes }, fake.client)
  assert.equal(res.statusCode, 429)
  assert.equal(fake.calls.length, 0)
})

test('a failed answer says so and charges nothing', async () => {
  const deps = setup()
  const res = await ask(deps, { question: 'What is a standard?', context: notes }, fakeClient({ fail: true }).client)
  assert.match(res.lines().at(-1).error, /try again/i)
  const status = await deps.meter.status(user.id, null)
  assert.equal(status.period.used, 0)
})
