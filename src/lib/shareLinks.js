import { useEffect, useState } from 'react'

// Sharing StudyPack on X and WhatsApp: links to a Pack library pack
// (/?pack=<id>, opened by App.jsx), the share addresses for X and WhatsApp,
// and the message for sharing a quiz score. Links carry the student's invite
// code (?ref=i-…), so a friend who joins and pays through a share earns them
// free days (server/invites.js); signed out, they carry `fallbackRef`.

const PACK_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// The home page, or a pack in the Pack library, with a ref.
export function shareUrl({ origin = window.location.origin, packId = null, ref = null } = {}) {
  const url = new URL('/', origin)
  if (packId) url.searchParams.set('pack', packId)
  if (ref) url.searchParams.set('ref', ref)
  return url.href
}

// X's "compose a post" page with the text and link filled in. Spaces are
// %20, not "+", which WhatsApp would show as plus signs.
export const xShareUrl = (text, url) => `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`

// WhatsApp's share page (the app on phones); the link goes in the text.
export const whatsappShareUrl = (text, url) => `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`

// A short name for a pack in a message: its course code if it has one
// ("MTH 101"), else its course or title, cut to fit a post.
export function packLabel({ course, title } = {}) {
  const code = /\b([A-Z]{2,4}) ?(\d{3}[A-Z]?)\b/.exec(`${course || ''} ${title || ''}`)
  if (code) return `${code[1]} ${code[2]}`
  const name = (course || '').trim() || (title || '').trim() || 'my lecture'
  return name.length > 48 ? `${name.slice(0, 45).trimEnd()}…` : name
}

// What a student posts after a quiz. A good score is shown off; a low one
// isn't, but the pack still gets shared.
export function scoreMessage({ correct, total, label }) {
  const percent = total ? Math.round((correct / total) * 100) : 0
  if (percent >= 60) {
    const cheer = percent === 100 ? '💯' : percent >= 80 ? '🔥' : '💪'
    return `I scored ${correct}/${total} on the ${label} quiz on StudyPack ${cheer} It turns lecture notes into study guides, flashcards and quizzes. Try it free:`
  }
  return `Studying ${label} with StudyPack: it turns lecture notes into study guides, flashcards and quizzes. Try it free:`
}

export const packMessage = ({ label }) => `Free ${label} study pack on StudyPack: summaries, worked examples, flashcards and a quiz 📚`

// The ?pack= this page was opened with (once per load), removed from the
// address so a reload or a shared screenshot doesn't repeat it.
export function takePackParam() {
  const url = new URL(window.location.href)
  const id = url.searchParams.get('pack')
  if (id === null) return null
  url.searchParams.delete('pack')
  window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
  return PACK_ID.test(id) ? id : null
}

// The signed-in student's invite code, fetched once per sign-in; null when
// signed out or unavailable (shares then use a plain ref).
let inviteCodePromise = null
let inviteCodeUser = null
export function useInviteCode(userId) {
  const [found, setFound] = useState({ userId: null, code: null })
  useEffect(() => {
    if (!userId) return
    if (inviteCodeUser !== userId) {
      inviteCodeUser = userId
      inviteCodePromise = fetch('/api/referrals?mine=1', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => data?.code ?? null)
        .catch(() => null)
    }
    let alive = true
    inviteCodePromise.then((code) => alive && setFound({ userId, code }))
    return () => {
      alive = false
    }
  }, [userId])
  // Only the current account's code: signed out (or switched), none.
  return userId && found.userId === userId ? found.code : null
}
