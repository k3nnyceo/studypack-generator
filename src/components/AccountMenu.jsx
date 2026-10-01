import { Gauge, LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import GoogleButton from './GoogleButton.jsx'
import UsageBars from './UsageBars.jsx'
import { Badge } from './ui.jsx'

// The top bar's account control: Google's sign-in button when signed out (just
// the "G" on phones, where the bar is tight), or the student's avatar, which
// opens a small menu with their plan, usage, and Sign out.
export default function AccountMenu({ user, onSignOut, billing, onOpenPlans }) {
  const wide = useMediaQuery('(min-width: 640px)')
  if (!user) return wide ? <GoogleButton size="medium" text="signin" /> : <GoogleButton size="medium" type="icon" />
  return <SignedIn user={user} onSignOut={onSignOut} billing={billing} onOpenPlans={onOpenPlans} />
}

function SignedIn({ user, onSignOut, billing, onOpenPlans }) {
  const planName = billing?.plans?.find((p) => p.id === billing.plan)?.name
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account: ${user.name || user.email}`}
        className="flex size-8 items-center justify-center overflow-hidden rounded-full bg-brand-100 text-sm font-bold text-brand-700 ring-2 ring-white transition hover:ring-brand-200"
      >
        <Avatar user={user} />
      </button>
      {open && (
        <div
          role="menu"
          className="animate-page-in absolute right-0 z-40 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-white p-2 shadow-elevated ring-1 ring-stone-200"
        >
          <div className="px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              {user.name && <p className="truncate font-semibold text-stone-900">{user.name}</p>}
              {planName && <Badge tone={billing.plan === 'free' ? 'stone' : 'brand'}>{planName}</Badge>}
            </div>
            <p className="truncate text-sm text-stone-500">{user.email}</p>
          </div>
          {billing?.usage && (
            <div className="border-y border-stone-100 px-3 py-3">
              <UsageBars billing={billing} compact />
            </div>
          )}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onOpenPlans()
            }}
            className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            <Gauge className="size-4" strokeWidth={2.25} aria-hidden />
            {billing?.plan === 'free' ? 'Upgrade plan' : 'Plans & usage'}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              onSignOut()
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-stone-700 transition hover:bg-stone-100"
          >
            <LogOut className="size-4" strokeWidth={2.25} aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function Avatar({ user }) {
  const [broken, setBroken] = useState(false)
  if (user.picture && !broken) {
    // Google's avatar host refuses requests that carry a Referer.
    return <img src={user.picture} alt="" referrerPolicy="no-referrer" className="size-full object-cover" onError={() => setBroken(true)} />
  }
  return <span aria-hidden>{(user.name || user.email || '?').trim().charAt(0).toUpperCase()}</span>
}

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const list = window.matchMedia(query)
    const onChange = () => setMatches(list.matches)
    list.addEventListener('change', onChange)
    return () => list.removeEventListener('change', onChange)
  }, [query])
  return matches
}
