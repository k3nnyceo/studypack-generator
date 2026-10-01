// Google sign-in, shared by the Vercel function (api/auth.js) and the local
// dev server (server/index.js).
//
//   POST   { credential }  a Google ID token from the "Sign in with Google"
//                          button -> verify it -> set the session cookie -> { user }
//   GET                    { user } for the current session, or { user: null }
//   DELETE                 sign out (clear the cookie)
//
// The session is a signed JWT in an HttpOnly cookie, so there's no session
// store: the server just checks the signature. It holds only the Google
// account id (`sub`), name, email and picture.
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose'
import { sendJson } from './http.js'
import { isDeployed } from './usageLimits.js'

const COOKIE = 'sp_session'
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

export async function handleAuthRequest(req, res, body, { env = process.env, verify = verifyGoogleCredential } = {}) {
  if (req.method === 'GET') return sendJson(res, 200, { user: await getSessionUser(req, env) })

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', cookie('', 0, env))
    return sendJson(res, 200, { user: null })
  }

  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })

  const key = sessionKey(env)
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

  const token = await new SignJWT({ email: user.email, name: user.name, picture: user.picture })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(key)
  res.setHeader('Set-Cookie', cookie(token, SESSION_DAYS * 24 * 60 * 60, env))
  sendJson(res, 200, { user })
}

// SameSite=Lax: the cookie isn't sent on cross-site POSTs, which covers CSRF
// for the API's state-changing requests.
function cookie(value, maxAge, env) {
  return [
    `${COOKIE}=${value}`,
    'Path=/',
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
