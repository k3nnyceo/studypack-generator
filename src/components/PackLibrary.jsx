import { BadgeCheck, BookMarked, Check, Loader2, Plus, Search, Sparkles, Trash2, TriangleAlert, Users } from 'lucide-react'
import { useMemo, useState } from 'react'
import { formatResetTime } from '../lib/billing.js'
import { groupByCourse } from '../lib/library.js'
import GoogleButton from './GoogleButton.jsx'
import { Badge, Button, Eyebrow } from './ui.jsx'

// The Pack library: ready-made packs from StarterPack (verified) and from
// students who chose to share. Adding one copies it into the student's own
// library, using one of the day's adds (Free 5, Pro 15, Max 40).
export default function PackLibrary({ shared, user, showSignIn, ownPrints, busyId, error, onAdd, onRemove, onOpenPlans, canUpgrade }) {
  const [query, setQuery] = useState('')

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const packs = (shared?.packs ?? []).filter(
      (p) => !q || [p.title, p.course, p.topic].some((field) => field?.toLowerCase().includes(q)),
    )
    return groupByCourse(packs.map((p) => ({ ...p, savedAt: p.sharedAt })))
  }, [shared, query])

  const allowance = shared?.allowance
  const left = allowance ? Math.max(0, allowance.limit - allowance.used) : null

  return (
    <div className="space-y-8">
      <div>
        <Eyebrow>Pack library</Eyebrow>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900">Ready-made study packs</h1>
        <p className="mt-1 max-w-2xl text-stone-500">
          Add a pack to your library and study it straight away: guide, flashcards and quiz. Verified packs are published by
          StarterPack; others were shared by students.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <label className="relative w-full max-w-sm">
          <span className="sr-only">Search packs</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-stone-400" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by course or topic"
            className="h-10 w-full rounded-xl border border-stone-300 bg-white pr-3 pl-9 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
          />
        </label>
        {allowance && (
          <p className="text-sm text-stone-500" role="status">
            <span className="font-semibold text-stone-800 tabular-nums">{left}</span> of {allowance.limit} adds left today
            {allowance.used > 0 && ` · resets ${formatResetTime(allowance.resetsAt)}`}
          </p>
        )}
      </div>

      {!user && showSignIn && (
        <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="font-semibold text-stone-900">Sign in to add packs to your library. It’s free.</p>
          <GoogleButton text="signin_with" />
        </div>
      )}

      {error && (
        <div
          className={`flex gap-3 rounded-xl p-4 text-sm ring-1 ${error.reason ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-rose-50 text-rose-900 ring-rose-200'}`}
          role="alert"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <p>
              {error.message}
              {error.resetsAt && ` More from ${formatResetTime(error.resetsAt)}.`}
            </p>
            {error.reason && canUpgrade && (
              <Button size="sm" variant="primary" icon={Sparkles} onClick={onOpenPlans} className="mt-3">
                Get more with Pro or Max
              </Button>
            )}
          </div>
        </div>
      )}

      {!shared ? (
        <div className="flex justify-center py-16" role="status">
          <Loader2 className="size-6 animate-spin text-brand-600" aria-label="Loading the Pack library" />
        </div>
      ) : groups.length === 0 ? (
        <div className="card px-6 py-14 text-center text-stone-500">
          {query ? 'No packs match that search.' : 'No packs yet. Share one from your library to start it off.'}
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.course} aria-label={group.course}>
            <h2 className="mb-3 text-sm font-semibold text-stone-700">
              {group.course} <span className="font-medium text-stone-500">· {group.items.length}</span>
            </h2>
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((pack) => {
                const owned = ownPrints.has(pack.fingerprint)
                return (
                  <li key={pack.id} className="card flex flex-col p-5">
                    <span className="flex flex-wrap items-center gap-2">
                      {pack.verified ? (
                        <Badge tone="brand">
                          <BadgeCheck className="size-3.5" aria-hidden /> Verified
                        </Badge>
                      ) : (
                        <Badge>
                          <Users className="size-3.5" aria-hidden /> Shared by a student
                        </Badge>
                      )}
                      {pack.mine && <Badge tone="emerald">Shared by you</Badge>}
                    </span>
                    <span className="mt-3 flex items-start gap-2.5">
                      <BookMarked className="mt-0.5 size-5 shrink-0 text-brand-500" strokeWidth={2} aria-hidden />
                      <span className="min-w-0">
                        <span className="block font-semibold leading-snug text-stone-900">{pack.topic}</span>
                        {pack.topic !== pack.title && <span className="mt-0.5 block text-sm leading-snug text-stone-500">{pack.title}</span>}
                      </span>
                    </span>
                    <span className="mt-3 text-xs font-medium text-stone-500">
                      {pack.modules} module{pack.modules === 1 ? '' : 's'}
                    </span>
                    <div className="mt-auto flex items-center gap-2 pt-5">
                      <Button
                        size="sm"
                        variant={owned ? undefined : 'primary'}
                        icon={owned ? Check : busyId === pack.id ? Loader2 : Plus}
                        disabled={(!user && !owned) || busyId !== null}
                        onClick={() => onAdd(pack)}
                      >
                        {owned ? 'In your library · Open' : busyId === pack.id ? 'Adding…' : 'Add to my library'}
                      </Button>
                      {(pack.mine || shared.canModerate) && (
                        <button
                          type="button"
                          onClick={() => onRemove(pack)}
                          disabled={busyId !== null}
                          aria-label={`Remove ${pack.topic} from the Pack library`}
                          title="Remove from the Pack library"
                          className="ml-auto flex size-9 items-center justify-center rounded-xl text-stone-500 transition hover:bg-rose-50 hover:text-rose-600"
                        >
                          <Trash2 className="size-4" strokeWidth={2.25} aria-hidden />
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
