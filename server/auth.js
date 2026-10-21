// Sign-in, shared by the Vercel function (api/auth.js) and the local dev
// server (server/index.js).
//
//   POST   { credential, ref? }  a Google ID token from the "Sign in with
//                          Google" button -> verify it -> set the session cookie
//                          -> { user }. `ref` is the link that brought a new
//                          student (server/referrals.js).
//   POST   { action: 'email-code', email }  email a sign-in code -> { sent }
//   POST   { action: 'email-verify', email, code, ref? }  check it -> { user }
//                          (server/emailSignIn.js)
//   GET                    { user, emailSignIn } for the current session;
//                          `emailSignIn` says whether codes can be sent
//   DELETE                 sign out (clear the cookie)
//
// The session is a signed JWT in an HttpOnly cookie, so there's no session
// store: the server just checks the signature. It holds only the account id,
// name, email and picture.
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'
import { emailProvider, sendEmail } from './email.js'
import { accountForEmail, accountForGoogle, CODE_MINUTES, checkEmailCode, normalizeEmail, startEmailSignIn } from './emailSignIn.js'
import { sendJson } from './http.js'
import { isAdmin, recordSignup } from './referrals.js'
import { isDeployed, storeFromEnv } from './usageLimits.js'

const COOKIE = 'sp_session'
const CHALLENGE_COOKIE = 'sp_email_code'
const SESSION_DAYS = 30
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com']
const googleKeys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'))

// The OAuth client id is public (the browser needs it too), so the frontend's
// build variable is reused rather than setting it twice.
export const googleClientId = (env = process.env) => env.GOOGLE_CLIENT_ID || env.VITE_GOOGLE_CLIENT_ID || ''

// null in production without SESSION_SECRET: sign-in is then unavailable
// rather than signed with a guessable key.
function sessionKey(env = process.env) {
  const secret = env.SESSION_SECRET || (isDeployed(env) ? '' : 'studypack-local-dev-only')
  return secret ? new TextEncoder().encode(secret) : null
}

// Resolves to the user for a Google ID token, or throws.
export async function verifyGoogleCredential(credential, clientId = googleClientId()) {
  const { payload } = await jwtVerify(credential, googleKeys, { issuer: GOOGLE_ISSUERS, audience: clientId })
  if (!payload.sub || payload.email_verified === false) throw new Error('Unverified Google account')
  return {
    id: payload.sub,
    email: typeof payload.email === 'string' ? payload.email : '',
    name: typeof payload.name === 'string' ? payload.name : '',
    picture: typeof payload.picture === 'string' ? payload.picture : '',
  }
}

// The signed-in user for this request, or null.
export async function getSessionUser(req, env = process.env) {
  const key = sessionKey(env)
  const token = readCookie(req, COOKIE)
  if (!key || !token) return null
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'] })
    return payload.sub ? { id: payload.sub, email: payload.email ?? '', name: payload.name ?? '', picture: payload.picture ?? '' } : null
  } catch {
    return null // expired, or signed with an old secret
  }
}

let defaultStore
const getStore = () => (defaultStore === undefined ? (defaultStore = storeFromEnv()) : defaultStore)

// What the browser is told about the user; `isAdmin` shows the referral stats.
const forClient = (user, env) => (user ? { ...user, isAdmin: isAdmin(user, env) } : null)

export async function handleAuthRequest(
  req,
  res,
  body,
  {
    env = process.env,
    verify = verifyGoogleCredential,
    store = getStore(),
    send = (message) => sendEmail(message, { env }),
    onSignIn = (user, ref) => recordSignup(store, user.id, ref),
  } = {},
) {
  const key = sessionKey(env)
  const emailSignIn = Boolean(key && store && emailProvider(env))

  if (req.method === 'GET') {
    const user = await getSessionUser(req, env)
    // Sessions from before email sign-in: link their address to their account.
    if (user?.email && store && !user.id.startsWith('em_')) await accountForGoogle(store, user).catch(() => {})
    return sendJson(res, 200, { user: forClient(user, env), emailSignIn })
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', cookie('', 0, env))
    return sendJson(res, 200, { user: null })
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  if (body?.action === 'email-code' || body?.action === 'email-verify') {
    if (!emailSignIn) {
      console.error('[auth] Email sign-in isn’t configured: set SESSION_SECRET, Upstash, EMAIL_FROM and RESEND_API_KEY or BREVO_API_KEY.')
      return sendJson(res, 503, { error: 'Email sign-in isn’t available right now. Please sign in with Google.' })
    }
    const email = normalizeEmail(body.email)
    if (!email) return sendJson(res, 400, { error: 'Enter a valid email address.' })

    if (body.action === 'email-code') {
      let result
      try {
        result = await startEmailSignIn({ req, email, store, key, send, env })
      } catch (err) {
        console.error('[auth] Could not send a sign-in code:', err.message)
        return sendJson(res, 502, { error: 'We couldn’t send the email. Check the address, or sign in with Google.' })
      }
      if (result.error) return sendJson(res, result.status, { error: result.error })
      res.setHeader('Set-Cookie', cookie(result.challenge, CODE_MINUTES * 60, env, CHALLENGE_COOKIE, '/api/auth'))
      return sendJson(res, 200, { sent: true })
    }

    const checked = await checkEmailCode({ challenge: readCookie(req, CHALLENGE_COOKIE), email, code: body.code, store, key })
    if (checked.error) return sendJson(res, checked.status, { error: checked.error })
    const user = { id: await accountForEmail(store, email), email, name: '', picture: '' }
    return startSession(res, user, body.ref, { key, env, onSignIn, clearChallenge: true })
  }

  const clientId = googleClientId(env)
  if (!key || !clientId) {
    console.error('[auth] Sign-in isn’t configured: set VITE_GOOGLE_CLIENT_ID and SESSION_SECRET.')
    return sendJson(res, 503, { error: 'Sign-in isn’t available right now. Please try again later.' })
  }
  const credential = typeof body?.credential === 'string' ? body.credential : ''
  if (!credential) return sendJson(res, 400, { error: 'Missing Google credential.' })

  let user
  try {
    user = await verify(credential, clientId)
  } catch (err) {
    console.error('[auth] Google sign-in rejected:', err.message)
    return sendJson(res, 401, { error: 'Google sign-in didn’t work. Please try again.' })
  }

  // Same address as an email account: the same account.
  if (store) user = { ...user, id: await accountForGoogle(store, user).catch(() => user.id) }
  return startSession(res, user, body?.ref, { key, env, onSignIn })
}

async function startSession(res, user, ref, { key, env, onSignIn, clearChallenge = false }) {
  const token = await new SignJWT({ email: user.email, name: user.name, picture: user.picture })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key)
  const session = cookie(token, SESSION_DAYS * 24 * 60 * 60, env)
  res.setHeader('Set-Cookie', clearChallenge ? [session, cookie('', 0, env, CHALLENGE_COOKIE, '/api/auth')] : session)
  // Tracking never gets in the way of signing in.
  await Promise.resolve(onSignIn(user, ref)).catch((err) => console.error('[auth] Could not record sign-up:', err.message))
  sendJson(res, 200, { user: forClient(user, env) })
}

// SameSite=Lax: the cookie isn't sent on cross-site POSTs, which covers CSRF
// for the API's state-changing requests.
function cookie(value, maxAge, env, name = COOKIE, path = '/') {
  return [
    `${name}=${value}`,
    `Path=${path}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    isDeployed(env) && 'Secure',
  ]
    .filter(Boolean)
    .join('; ')
}

function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return ''
}
