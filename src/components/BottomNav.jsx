import { House, Library, LibraryBig, Timer, UserRound } from 'lucide-react'
import { clock } from '../lib/focus.js'

// The tab bar along the bottom of the screen on phones, like an installed
// app: Home · Today · Library · Packs · Me. On wider screens the header has
// these instead. Today shows the focus timer's countdown while one runs, and
// otherwise a badge with how many flashcards are due (src/lib/dueCards.js).
const TABS = [
  { view: 'home', label: 'Home', icon: House },
  { view: 'today', label: 'Today', icon: Timer },
  { view: 'library', label: 'Library', icon: Library },
  { view: 'explore', label: 'Packs', icon: LibraryBig },
  { view: 'plans', label: 'Me', icon: UserRound },
]

export default function BottomNav({ view, onNavigate, focusTimer, dueTotal = 0 }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200/80 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {TABS.map(({ view: id, label, icon: Icon }) => {
          const active = view === id
          const timing = id === 'today' && focusTimer
          return (
            <li key={id}>
              <button
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={active ? 'page' : undefined}
                className="flex w-full flex-col items-center gap-0.5 pt-2 pb-1.5 text-[11px] font-semibold"
              >
                <span
                  className={`relative flex h-8 w-14 items-center justify-center rounded-full transition ${
                    active ? 'bg-brand-600 text-white' : timing ? 'bg-brand-50 text-brand-700' : 'text-stone-500'
                  }`}
                >
                  <Icon className="size-5" strokeWidth={2.25} aria-hidden />
                  {id === 'today' && dueTotal > 0 && !timing && (
                    <span className="absolute -top-0.5 right-2.5 min-w-4 rounded-full bg-amber-500 px-1 text-[10px] leading-4 font-bold text-white tabular-nums" aria-hidden>
                      {dueTotal > 99 ? '99+' : dueTotal}
                    </span>
                  )}
                </span>
                <span className={`tabular-nums ${active ? 'text-brand-700' : 'text-stone-600'}`}>
                  {timing ? (focusTimer.paused ? 'Paused' : clock(focusTimer.remainingMs)) : label}
                </span>
                {id === 'today' && dueTotal > 0 && <span className="sr-only">, {dueTotal} flashcards due</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
