import { BookMarked, Cloud, CloudAlert, FolderOpen, Layers, Library as LibraryIcon, ListChecks, Loader2, Plus, Trash2 } from 'lucide-react'
import { buildFlashcards } from '../lib/flashcards.js'
import { groupByCourse } from '../lib/library.js'
import { buildQuiz } from '../lib/quiz.js'
import GoogleButton from './GoogleButton.jsx'
import { Badge, Button, Eyebrow } from './ui.jsx'

const savedDate = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

// Every saved study pack, grouped by course when there's more than one.
export default function Library({ entries, activeId, onOpen, onDelete, onAddNew, user, showSignIn, sync, onSyncNow }) {
  const groups = groupByCourse(entries)
  const grouped = groups.length > 1

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>{user ? 'Synced to your account' : 'Saved on this device'}</Eyebrow>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900">Your library</h1>
          <p className="mt-1 text-stone-500">
            {entries.length === 0
              ? 'Study packs you load are saved here automatically.'
              : `${entries.length} study pack${entries.length === 1 ? '' : 's'}${
                  grouped ? ` across ${groups.length} courses` : ''
                }. Click one to study it.`}
          </p>
        </div>
        <Button variant="primary" icon={Plus} onClick={onAddNew}>
          Add a study pack
        </Button>
      </div>

      {user ? (
        <SyncStatus user={user} sync={sync} onSyncNow={onSyncNow} />
      ) : (
        showSignIn && (
          <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex min-w-0 items-start gap-3">
              <Cloud className="mt-0.5 size-5 shrink-0 text-brand-600" strokeWidth={2.25} aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold text-stone-900">Keep your library on every device</p>
                <p className="mt-0.5 text-sm text-stone-500">Sign in and your packs sync between your phone and laptop.</p>
              </div>
            </div>
            <GoogleButton text="signin_with" />
          </div>
        )
      )}

      {entries.length === 0 ? (
        <div className="card flex flex-col items-center px-6 py-16 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <LibraryIcon className="size-7" strokeWidth={2} aria-hidden />
          </span>
          <h2 className="mt-5 text-lg font-semibold text-stone-900">No study packs yet</h2>
          <p className="mt-1 max-w-sm text-sm text-stone-500">
            Load a study guide JSON and it will be saved here, ready to open any time, even after you close the tab.
          </p>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.course} aria-label={grouped ? group.course : 'Study packs'}>
            {grouped && (
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-stone-700">
                <FolderOpen className="size-4 text-brand-500" strokeWidth={2.25} aria-hidden />
                {group.course}
                <span className="font-medium text-stone-500">· {group.items.length}</span>
              </h2>
            )}
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {group.items.map((entry) => (
                <PackCard
                  key={entry.id}
                  entry={entry}
                  isOpen={entry.id === activeId}
                  showCourse={!grouped}
                  onOpen={() => onOpen(entry)}
                  onDelete={() => onDelete(entry)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

export function PackCard({ entry, isOpen, showCourse, onOpen, onDelete }) {
  const cards = buildFlashcards(entry.guide).length
  const questions = buildQuiz(entry.guide).length

  return (
    <li className="card group relative flex transition duration-200 hover:-translate-y-0.5 hover:shadow-card-hover">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col rounded-2xl p-5 pr-14 text-left focus-visible:outline-offset-0"
      >
        <span className="flex flex-wrap items-center gap-2">
          {showCourse && <Badge tone="brand">{entry.course}</Badge>}
          {isOpen && <Badge tone="emerald">Open now</Badge>}
        </span>
        <span className="mt-3 flex items-start gap-2.5">
          <BookMarked className="mt-0.5 size-5 shrink-0 text-brand-500" strokeWidth={2} aria-hidden />
          <span className="min-w-0">
            <span className="block font-semibold leading-snug text-stone-900 group-hover:text-brand-700">
              {entry.topic}
            </span>
            {entry.topic !== entry.title && (
              <span className="mt-0.5 block text-sm leading-snug text-stone-500">{entry.title}</span>
            )}
          </span>
        </span>
        <span className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-5 text-xs font-medium text-stone-500">
          <span>
            {entry.guide.modules.length} module{entry.guide.modules.length === 1 ? '' : 's'}
          </span>
          <span className="inline-flex items-center gap-1">
            <Layers className="size-3.5" aria-hidden /> {cards}
          </span>
          <span className="inline-flex items-center gap-1">
            <ListChecks className="size-3.5" aria-hidden /> {questions}
          </span>
          <span className="ml-auto">Saved {savedDate.format(entry.savedAt)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${entry.topic}`}
        title="Delete from library"
        className="absolute top-3 right-3 flex size-9 items-center justify-center rounded-xl text-stone-500 transition hover:bg-rose-50 hover:text-rose-600 focus-visible:text-rose-600"
      >
        <Trash2 className="size-4" strokeWidth={2.25} aria-hidden />
      </button>
    </li>
  )
}

function SyncStatus({ user, sync, onSyncNow }) {
  if (sync.state === 'error') {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-amber-50 p-4 text-sm text-amber-900 ring-1 ring-amber-200" role="alert">
        <CloudAlert className="size-4 shrink-0 text-amber-600" strokeWidth={2.25} aria-hidden />
        <p className="min-w-0 flex-1">{sync.error || 'Couldn’t sync your library.'} Your packs are still saved on this device.</p>
        <Button size="sm" variant="ghost" onClick={onSyncNow}>
          Try again
        </Button>
      </div>
    )
  }
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm text-stone-500" role="status">
      {sync.state === 'syncing' ? (
        <Loader2 className="size-4 shrink-0 animate-spin text-brand-600" aria-hidden />
      ) : (
        <Cloud className="size-4 shrink-0 text-brand-600" strokeWidth={2.25} aria-hidden />
      )}
      <span className="min-w-0 truncate">
        {sync.state === 'syncing' ? 'Syncing with ' : 'Synced with '}
        <span className="font-semibold text-stone-700">{user.email}</span>
      </span>
    </p>
  )
}
