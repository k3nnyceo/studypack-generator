import { useCallback, useEffect, useState } from 'react'
import { GOOGLE_CLIENT_ID, SIGN_IN_ENABLED } from '../config.js'
import { storedReferral } from './referral.js'

// Google sign-in. Google's button gives us an ID token, which /api/auth
// verifies and turns into an HttpOnly session cookie (server/auth.js). The
// browser never sees the session itself, so "who am I" is asked of the server.
//
// On Chrome (including Android) the button uses FedCM: a native account sheet
// over the page, so the page never navigates away and uploaded notes are kept.

let googleReady
let onCredential = () => {}

// Loads Google Identity Services once and resolves to `google.accounts.id`.
export function loadGoogle() {
  if (!googleReady) {
    googleReady = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.onload = () => {
        const id = window.google.accounts.id
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response) => onCredential(response.credential),
          use_fedcm_for_button: true,
          use_fedcm_for_prompt: true,
        })
        resolve(id)
      }
      script.onerror = () => {
        googleReady = null // let a later render try again
        reject(new Error('Couldn’t load Google sign-in. Check your connection and try again.'))
      }
      document.head.append(script)
    })
  }
  return googleReady
}

// { user, ready, signIn, signOut, expire, error }. `user` is { id, email,
// name, picture, isAdmin } or null; `ready` is false until the server has answered.
export function useAuth() {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(!SIGN_IN_ENABLED)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!SIGN_IN_ENABLED) return
    authFetch('GET')
      .then((data) => setUser(data.user ?? null))
      .catch(() => {}) // offline: stay signed out until the next load
      .finally(() => setReady(true))
  }, [])

  const signIn = useCallback(async (credential) => {
    setError('')
    try {
      // The link that brought them, counted if this is their first sign-in.
      const data = await authFetch('POST', { credential, ref: storedReferral() })
      setUser(data.user)
    } catch (err) {
      setError(err.message)
    }
  }, [])

  // Google's button calls back here, wherever it's rendered.
  useEffect(() => {
    onCredential = signIn
  }, [signIn])

  const signOut = useCallback(async () => {
    setUser(null)
    loadGoogle()
      .then((id) => id.disableAutoSelect())
      .catch(() => {})
    await authFetch('DELETE').catch(() => {})
  }, [])

  // The server said the session is gone (expired, or signed out elsewhere).
  const expire = useCallback(() => setUser(null), [])

  return { user, ready, signIn, signOut, expire, error }
}

async function authFetch(method, body) {
  let res
  try {
    res = await fetch('/api/auth', {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw new Error('Couldn’t reach StudyPack. Check your connection and try again.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) throw new Error(data?.error || `Sign-in failed (${res.status}). Please try again.`)
  return data
}
