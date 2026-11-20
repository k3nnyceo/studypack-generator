import { BellOff, BellRing, Loader2 } from 'lucide-react'
import { useReminders } from '../lib/reminders.js'
import { Button } from './ui.jsx'

// "Daily reminders" on the Today screen (src/lib/reminders.js): a nudge each
// evening about due flashcards, close exams and the streak. Hidden where
// this browser can't get them or the server isn't set up.
export default function Reminders({ user }) {
  const { state, error, enable, disable } = useReminders(user)
  if (state === 'unsupported' || state === 'off') return null
  const on = state === 'enabled'

  return (
    <section className="card flex flex-wrap items-center gap-4 p-5 sm:px-6" aria-labelledby="reminders">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${on ? 'bg-brand-600 text-white' : 'bg-brand-50 text-brand-600'}`}>
        {on ? <BellRing className="size-5" strokeWidth={2.25} aria-hidden /> : <BellOff className="size-5" strokeWidth={2.25} aria-hidden />}
      </span>
      <div className="min-w-0 flex-1">
        <h2 id="reminders" className="font-bold text-stone-900">
          Daily reminders {on && <span className="text-sm font-semibold text-brand-600">· on</span>}
        </h2>
        <p className="text-sm text-stone-600">
          {state === 'blocked'
            ? 'Notifications are blocked for StudyPack. Allow them in your browser’s site settings, then come back.'
            : 'One nudge in the evening about cards due, exams coming up and your streak. Never on days you’ve already studied.'}
        </p>
        {error && (
          <p className="mt-1 text-sm text-rose-700" role="alert">
            {error}
          </p>
        )}
      </div>
      {state === 'working' ? (
        <Loader2 className="size-5 animate-spin text-stone-400" aria-label="Working" />
      ) : state === 'blocked' ? null : on ? (
        <Button size="sm" onClick={disable}>
          Turn off
        </Button>
      ) : (
        <Button size="sm" variant="primary" onClick={enable}>
          Turn on
        </Button>
      )}
    </section>
  )
}
