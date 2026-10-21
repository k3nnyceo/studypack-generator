// Sign-in with an emailed code, and which account a sign-in belongs to.
//
// 1. POST /api/auth { action: 'email-code', email } emails a 6-digit code. The
//    code isn't stored: a signed "challenge" (email, when it expires, and an
//    HMAC of the code) goes back in an HttpOnly cookie on this browser.
// 2. POST /api/auth { action: 'email-verify', email, code } checks the code
//    against that cookie: 5 tries per code, each code used once, 10 minutes.
//
// Accounts are keyed by an id (`user.id`) that subscriptions, the library and
// usage hang off. A Google account's id is its Google `sub`; an email-only
// account's is "em_" plus a hash of the address. studypack:login:<email>
// links an address to its account, so signing in with Google or with a code
// to the same address reaches the same account.
import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto'
import { jwtVerify, SignJWT } from 'jose'

export const CODE_MINUTES = 10
const MAX_TRIES = 5
const COOLDOWN_SECONDS = 60
const PER_EMAIL_PER_HOUR = 5
const PER_IP_PER_HOUR = 10

const sha = (s) => createHash('sha256').update(s).digest('hex')
const loginKey = (email) => `studypack:login:${email}`

// A lower-cased address, or '' if it doesn't look like one.
export function normalizeEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : ''
}

const codeHash = (key, jti, code) => createHmac('sha256', Buffer.from(key)).update(`${jti}:${code}`).digest('base64url')

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for']
  return (typeof forwarded === 'string' && forwarded.split(',')[0].trim()) || req.socket?.remoteAddress || 'unknown'
}

// Resolves to { challenge } (the cookie's value) or { status, error }.
export async function startEmailSignIn({ req, email, store, key, send, env = process.env, now = Date.now() }) {
  const id = sha(email).slice(0, 32)
  const hour = Math.floor(now / 3600e3)
  if (!(await store.claim(`studypack:otp:cool:${id}`, COOLDOWN_SECONDS)))
    return { status: 429, error: 'We just sent a code to that address. Wait a minute before asking for another.' }
  const ip = sha(`${env.IP_HASH_SALT ?? ''}:${clientIp(req)}`).slice(0, 32)
  const [perEmail, perIp] = await Promise.all([
    store.add(`studypack:otp:email:${id}:${hour}`, 1, 3600),
    store.add(`studypack:otp:ip:${ip}:${hour}`, 1, 3600),
  ])
  if (perEmail > PER_EMAIL_PER_HOUR || perIp > PER_IP_PER_HOUR)
    return { status: 429, error: 'Too many codes asked for. Please try again in an hour, or sign in with Google.' }
  // The email service's free allowance is shared by everyone.
  const daily = Number(env.EMAIL_CODES_PER_DAY) || 250
  if ((await store.add(`studypack:otp:day:${new Date(now).toISOString().slice(0, 10)}`, 1, 2 * 86400)) > daily)
    return { status: 503, error: 'Email sign-in is busy today. Please sign in with Google, or try again tomorrow.' }

  const code = String(randomInt(0, 1e6)).padStart(6, '0')
  const jti = randomUUID()
  const challenge = await new SignJWT({ email, h: codeHash(key, jti, code) })
    .setProtectedHeader({ alg: 'HS256' })
    .setJti(jti)
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + CODE_MINUTES * 60)
    .sign(key)
  await send({
    to: email,
    subject: `${code} is your StudyPack code`,
    text: `Your StudyPack sign-in code is ${code}\n\nIt works for ${CODE_MINUTES} minutes. If you didn't ask for it, you can ignore this email.`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:420px;margin:auto;padding:24px;color:#1c1917">
<p style="font-size:16px;margin:0 0 16px">Your StudyPack sign-in code:</p>
<p style="font-size:34px;font-weight:700;letter-spacing:8px;margin:0 0 16px">${code}</p>
<p style="font-size:14px;color:#57534e;margin:0">It works for ${CODE_MINUTES} minutes. If you didn't ask for it, you can ignore this email.</p>
</div>`,
  })
  return { challenge }
}

// Resolves to { email } or { status, error }.
export async function checkEmailCode({ challenge, email, code, store, key }) {
  const expired = { status: 400, error: 'That code has expired. Ask for a new one.' }
  if (!challenge) return expired
  let payload
  try {
    ;({ payload } = await jwtVerify(challenge, key, { algorithms: ['HS256'] }))
  } catch {
    return expired
  }
  if (payload.email !== email || !payload.jti) return { status: 400, error: 'Ask for a code for this address first.' }
  if ((await store.add(`studypack:otp:try:${payload.jti}`, 1, CODE_MINUTES * 60 + 60)) > MAX_TRIES)
    return { status: 429, error: 'Too many wrong codes. Ask for a new one.' }
  const given = Buffer.from(codeHash(key, payload.jti, String(code ?? '').replace(/\D/g, '')))
  const expected = Buffer.from(String(payload.h))
  if (given.length !== expected.length || !timingSafeEqual(given, expected))
    return { status: 400, error: 'That code isn’t right. Check the email and try again.' }
  if (!(await store.claim(`studypack:otp:used:${payload.jti}`, CODE_MINUTES * 60 + 60)))
    return { status: 400, error: 'That code was already used. Ask for a new one.' }
  return { email }
}

// The account for a code sign-in: the one already linked to the address (a
// Google account, or one that paid with this email), or a new email account.
export async function accountForEmail(store, email) {
  const linked = (await store.getJson(loginKey(email))) || (await store.getJson(`studypack:email:${email}`))
  const id = linked ? String(linked) : `em_${sha(email).slice(0, 24)}`
  if (!linked || !(await store.getJson(loginKey(email)))) await store.setJson(loginKey(email), id)
  return id
}

// The account for a Google sign-in. A Google account that already exists
// keeps its id; a new one joins an email account with the same address.
export async function accountForGoogle(store, user) {
  const email = normalizeEmail(user.email)
  if (!email) return user.id
  const linked = await store.getJson(loginKey(email))
  if (linked && String(linked) !== user.id && !(await store.get(`studypack:account:${user.id}:new`))) return String(linked)
  if (!linked) await store.setJson(loginKey(email), user.id)
  return user.id
}
