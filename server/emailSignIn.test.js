// Run with: npm test
// Email sign-in (server/emailSignIn.js through server/auth.js): a code is
// emailed and signs in once; wrong, reused, expired and over-asked codes are
// refused; and an address reaches the same account by Google or by code.
import { createHash } from 'node:crypto'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { handleAuthRequest } from './auth.js'
import { normalizeEmail } from './emailSignIn.js'
import { memoryStore } from './usageLimits.js'

// The test store never expires keys: lift an address's one-minute wait by hand.
const endCooldown = (store, email) => store.unclaim(`studypack:otp:cool:${createHash('sha256').update(email).digest('hex').slice(0, 32)}`)

const env = { SESSION_SECRET: 'test-secret', GOOGLE_CLIENT_ID: 'client' }

// A browser: keeps cookies between calls, like the real one.
function browser({ store = memoryStore(), ip = '1.2.3.4', verify } = {}) {
  const jar = new Map()
  const sent = []
  const signups = []
  async function call(method, body = null) {
    const headers = {}
    const res = {
      setHeader(name, value) {
        headers[name.toLowerCase()] = value
      },
      writeHead(status) {
        this.status = status
      },
      end(text) {
        this.body = JSON.parse(text)
      },
    }
    const cookie = [...jar].map(([k, v]) => `${k}=${v}`).join('; ')
    const req = { method, headers: { cookie, 'x-forwarded-for': ip }, socket: {} }
    await handleAuthRequest(req, res, body, {
      env,
      store,
      verify,
      send: async (message) => sent.push(message),
      onSignIn: (user, ref) => signups.push({ id: user.id, ref }),
    })
    for (const line of [headers['set-cookie'] ?? []].flat()) {
      const [pair, ...attrs] = line.split('; ')
      const [k, ...v] = pair.split('=')
      if (attrs.includes('Max-Age=0')) jar.delete(k)
      else jar.set(k, v.join('='))
    }
    return res
  }
  const lastCode = () => /\d{6}/.exec(sent.at(-1).subject)[0]
  return { call, sent, signups, jar, lastCode, store }
}

test('a code sent by email signs in, once', async () => {
  const b = browser()
  assert.equal((await b.call('GET')).body.emailSignIn, true)
  const asked = await b.call('POST', { action: 'email-code', email: '  Ada@Example.com ' })
  assert.equal(asked.status, 200)
  assert.equal(b.sent[0].to, 'ada@example.com')
  assert.match(b.sent[0].text, /\d{6}/)
  assert.ok(b.jar.has('sp_email_code'))

  const code = b.lastCode()
  const wrong = await b.call('POST', { action: 'email-verify', email: 'ada@example.com', code: code === '000000' ? '111111' : '000000' })
  assert.equal(wrong.status, 400)
  const ok = await b.call('POST', { action: 'email-verify', email: 'ada@example.com', code, ref: 'tiktok' })
  assert.equal(ok.status, 200)
  assert.equal(ok.body.user.email, 'ada@example.com')
  assert.match(ok.body.user.id, /^em_/)
  assert.deepEqual(b.signups, [{ id: ok.body.user.id, ref: 'tiktok' }])
  assert.ok(b.jar.has('sp_session'))
  assert.ok(!b.jar.has('sp_email_code'), 'the code is cleared after use')
  assert.equal((await b.call('GET')).body.user.id, ok.body.user.id)

  // The same address later is the same account.
  const again = browser({ store: b.store })
  await endCooldown(b.store, 'ada@example.com')
  await again.call('POST', { action: 'email-code', email: 'ada@example.com' })
  const second = await again.call('POST', { action: 'email-verify', email: 'ada@example.com', code: again.lastCode() })
  assert.equal(second.body.user.id, ok.body.user.id)
})

test('a code only works in the browser that asked, for that address, five tries at most', async () => {
  const b = browser()
  await b.call('POST', { action: 'email-code', email: 'ada@example.com' })
  const code = b.lastCode()
  const other = browser({ store: b.store, ip: '5.6.7.8' })
  assert.equal((await other.call('POST', { action: 'email-verify', email: 'ada@example.com', code })).status, 400)
  assert.equal((await b.call('POST', { action: 'email-verify', email: 'bob@example.com', code })).status, 400)
  const bad = code === '000000' ? '111111' : '000000'
  for (let i = 0; i < 5; i++) assert.equal((await b.call('POST', { action: 'email-verify', email: 'ada@example.com', code: bad })).status, 400)
  const locked = await b.call('POST', { action: 'email-verify', email: 'ada@example.com', code })
  assert.equal(locked.status, 429, 'the right code after five wrong tries is refused')
})

test('asking for codes is rate limited', async () => {
  const b = browser()
  assert.equal((await b.call('POST', { action: 'email-code', email: 'ada@example.com' })).status, 200)
  const soon = await b.call('POST', { action: 'email-code', email: 'ada@example.com' })
  assert.equal(soon.status, 429, 'one code a minute per address')
  for (let i = 0; i < 9; i++) await b.call('POST', { action: 'email-code', email: `s${i}@example.com` })
  assert.equal((await b.call('POST', { action: 'email-code', email: 'zed@example.com' })).status, 429, 'ten an hour per connection')
  assert.equal(b.sent.length, 10)
  assert.equal((await b.call('POST', { action: 'email-code', email: 'not-an-email' })).status, 400)
})

test('Google and email codes reach the same account for the same address', async () => {
  const google = (sub, email) => async () => ({ id: sub, email, name: 'Ada', picture: '' })
  // Email first, then Google: Google joins the email account.
  const b = browser({ verify: google('g-1', 'ada@example.com') })
  await b.call('POST', { action: 'email-code', email: 'ada@example.com' })
  const byEmail = (await b.call('POST', { action: 'email-verify', email: 'ada@example.com', code: b.lastCode() })).body.user
  const byGoogle = (await b.call('POST', { credential: 'token' })).body.user
  assert.equal(byGoogle.id, byEmail.id)

  // Google first (an existing account), then email: email joins the Google account.
  const store = memoryStore()
  const g = browser({ store, verify: google('g-2', 'bola@example.com') })
  await store.claim('studypack:account:g-2:new')
  assert.equal((await g.call('POST', { credential: 'token' })).body.user.id, 'g-2')
  const e = browser({ store })
  await e.call('POST', { action: 'email-code', email: 'Bola@example.com' })
  assert.equal((await e.call('POST', { action: 'email-verify', email: 'bola@example.com', code: e.lastCode() })).body.user.id, 'g-2')
})

test('without an email service in production, email sign-in is off', async () => {
  const req = { method: 'GET', headers: {}, socket: {} }
  const res = { setHeader() {}, writeHead(s) { this.status = s }, end(t) { this.body = JSON.parse(t) } }
  await handleAuthRequest(req, res, null, { env: { ...env, VERCEL: '1' }, store: memoryStore() })
  assert.equal(res.body.emailSignIn, false)
  assert.equal(normalizeEmail('a@b'), '', 'needs a domain with a dot')
  assert.equal(normalizeEmail(' A.B@Mail.COM '), 'a.b@mail.com')
})
