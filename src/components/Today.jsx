import { ArrowRight, Flame, Pause, Play, Plus, Square, Timer, Trophy } from 'lucide-react'
import { useState } from 'react'
import { clock, FINISH_BONUS, GOALS, LENGTHS } from '../lib/focus.js'
import { Button, Eyebrow } from './ui.jsx'

// The daily dashboard: today's focus minutes against the goal, the streak,
// XP and level, the week, a focus timer, and the pack to pick up next.
export default function Today({ focus, streak, entries, openTopic, onOpenPack, onNewPack }) {
  const pct = Math.min(1, focus.todayMinutes / focus.goal)
  const reached = focus.todayMinutes >= focus.goal
  const date = new Date(focus.now).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
  const next = entries[0]

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <Eyebrow>{date}</Eyebrow>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-stone-900">
          {reached ? 'Goal reached. Nice work!' : focus.todayMinutes ? 'Keep going' : 'Ready to focus?'}
        </h1>
      </div>

      <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
        <section className="card flex flex-col items-center p-6 sm:p-8" aria-label="Today’s goal">
          <GoalRing pct={pct} minutes={focus.todayMinutes} goal={focus.goal} />
          <div className="mt-6 grid w-full grid-cols-2 gap-3">
            <Stat icon={Flame} tone="text-orange-600">
              <strong className="text-xl tabular-nums">{streak.count}</strong> day{streak.count === 1 ? '' : 's'}
              <span className="block text-xs text-stone-500">{streak.studiedToday || !streak.count ? 'study streak' : 'study today to keep it'}</span>
            </Stat>
            <Stat icon={Trophy} tone="text-brand-600">
              <strong className="text-xl tabular-nums">Level {focus.level.level}</strong>
              <span className="block text-xs text-stone-500">{focus.level.needed - focus.level.into} XP to Level {focus.level.level + 1}</span>
            </Stat>
          </div>
          <div className="mt-4 w-full">
            <div className="h-2 overflow-hidden rounded-full bg-stone-100" role="progressbar" aria-label="XP towards the next level" aria-valuemin={0} aria-valuemax={focus.level.needed} aria-valuenow={focus.level.into}>
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(focus.level.into / focus.level.needed) * 100}%` }} />
            </div>
            <p className="mt-2 text-xs text-stone-500">
              {focus.xp} XP · every focused minute earns 1 XP, and finishing a session earns {FINISH_BONUS} more.
            </p>
          </div>
          <label className="mt-4 flex items-center gap-2 self-start text-sm text-stone-600">
            Daily goal
            <select
              value={focus.goal}
              onChange={(e) => focus.setGoal(Number(e.target.value))}
              className="rounded-lg border-0 bg-stone-100 py-1 pr-7 pl-2 text-sm font-semibold text-stone-800 ring-1 ring-stone-200"
            >
              {GOALS.map((g) => (
                <option key={g} value={g}>
                  {g} minutes
                </option>
              ))}
            </select>
          </label>
        </section>

        <FocusTimer focus={focus} entries={entries} openTopic={openTopic} />
      </div>

      <div className="grid gap-6 md:grid-cols-[1.1fr_1fr]">
        <Week week={focus.week} goal={focus.goal} />

        <section className="card p-6" aria-labelledby="up-next">
          <h2 id="up-next" className="text-sm font-semibold tracking-[0.08em] text-stone-500 uppercase">
            Up next
          </h2>
          {next ? (
            <>
              <p className="mt-3 text-lg font-bold text-stone-900">{next.topic}</p>
              {next.course && <p className="text-sm text-stone-500">{next.course}</p>}
              <Button variant="primary" icon={ArrowRight} className="mt-4" onClick={() => onOpenPack(next)}>
                Continue studying
              </Button>
            </>
          ) : (
            <>
              <p className="mt-3 text-stone-600">Make a study pack from your lecture notes, then focus on it here.</p>
              <Button variant="primary" icon={Plus} className="mt-4" onClick={onNewPack}>
                Make a study pack
              </Button>
            </>
          )}
        </section>
      </div>

      <p className="text-center text-xs text-stone-500">Your focus minutes and XP are saved on this device.</p>
    </div>
  )
}

function GoalRing({ pct, minutes, goal }) {
  const r = 70
  const c = 2 * Math.PI * r
  return (
    <div className="relative size-48">
      <svg viewBox="0 0 160 160" className="size-full -rotate-90" aria-hidden>
        <circle cx="80" cy="80" r={r} fill="none" strokeWidth="12" className="stroke-stone-100" />
        <circle
          cx="80"
          cy="80"
          r={r}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={`transition-all duration-700 ${pct >= 1 ? 'stroke-emerald-500' : 'stroke-brand-500'}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-extrabold tracking-tight text-stone-900 tabular-nums">{minutes}</span>
        <span className="text-sm text-stone-500">of {goal} focus minutes</span>
      </div>
    </div>
  )
}

function Stat({ icon: Icon, tone, children }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl bg-stone-50 p-3 text-sm text-stone-700 ring-1 ring-stone-200/70">
      <Icon className={`mt-1 size-5 shrink-0 ${tone}`} strokeWidth={2.25} aria-hidden />
      <div>{children}</div>
    </div>
  )
}

function FocusTimer({ focus, entries, openTopic }) {
  const [length, setLength] = useState(25)
  const topics = [...new Set([openTopic, ...entries.map((e) => e.topic)].filter(Boolean))].slice(0, 8)
  const [label, setLabel] = useState(topics[0] ?? '')
  const t = focus.timerState

  return (
    <section className="card flex flex-col p-6 sm:p-8" aria-labelledby="focus-timer">
      <h2 id="focus-timer" className="flex items-center gap-2 text-sm font-semibold tracking-[0.08em] text-stone-500 uppercase">
        <Timer className="size-4 text-brand-600" aria-hidden />
        Focus timer
      </h2>

      {t ? (
        <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
          <p className="text-6xl font-extrabold tracking-tight text-stone-900 tabular-nums" role="timer" aria-live="off">
            {clock(t.remainingMs)}
          </p>
          <p className="mt-2 text-sm text-stone-500">
            {t.paused ? 'Paused' : 'Focusing'}
            {focus.timer.label && ` on ${focus.timer.label}`} · {Math.floor(t.elapsedMs / 60_000)} min so far
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {t.paused ? (
              <Button variant="primary" icon={Play} onClick={focus.resume}>
                Resume
              </Button>
            ) : (
              <Button icon={Pause} onClick={focus.pause}>
                Pause
              </Button>
            )}
            <Button variant="ghost" icon={Square} onClick={focus.stop}>
              End and save
            </Button>
          </div>
          <p className="mt-4 text-xs text-stone-500">The timer keeps running while you study in other screens.</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-1 flex-col">
          <p className="text-sm text-stone-600">How long?</p>
          <div className="mt-2 grid grid-cols-4 gap-2" role="radiogroup" aria-label="Session length">
            {LENGTHS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={length === m}
                onClick={() => setLength(m)}
                className={`rounded-xl py-2.5 text-sm font-semibold ring-1 transition ${
                  length === m ? 'bg-brand-50 text-brand-700 ring-brand-300' : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'
                }`}
              >
                {m} min
              </button>
            ))}
          </div>
          {topics.length > 0 && (
            <label className="mt-4 block text-sm text-stone-600">
              Studying
              <select
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="mt-1.5 block w-full rounded-xl border-0 bg-white py-2.5 pl-3 text-sm text-stone-800 ring-1 ring-stone-200"
              >
                {topics.map((topic) => (
                  <option key={topic} value={topic}>
                    {topic}
                  </option>
                ))}
                <option value="">Something else</option>
              </select>
            </label>
          )}
          <Button variant="primary" size="lg" icon={Play} className="mt-6 w-full" onClick={() => focus.start(length, label)}>
            Start {length}-minute focus
          </Button>
        </div>
      )}
    </section>
  )
}

function Week({ week, goal }) {
  // Headroom above the goal line, so its label clears the heading.
  const top = Math.max(goal * 1.2, ...week.map((d) => d.minutes))
  const total = week.reduce((n, d) => n + d.minutes, 0)
  return (
    <section className="card p-6" aria-labelledby="this-week">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="this-week" className="text-sm font-semibold tracking-[0.08em] text-stone-500 uppercase">
          This week
        </h2>
        <span className="text-sm text-stone-500 tabular-nums">{total} min</span>
      </div>
      <div className="relative mt-5 h-36">
        <div className="absolute inset-x-0 border-t border-dashed border-emerald-400" style={{ bottom: `${(goal / top) * 100}%` }}>
          <span className="absolute -top-5 right-0 text-[11px] font-semibold text-emerald-600">Goal</span>
        </div>
        <ol className="flex h-full items-end gap-2">
          {week.map((d) => (
            <li key={d.day} className="flex h-full flex-1 flex-col justify-end" title={`${d.minutes} min`}>
              <div
                className={`w-full rounded-t-md ${d.minutes >= goal ? 'bg-emerald-500' : d.today ? 'bg-brand-500' : 'bg-brand-200'}`}
                style={{ height: `${Math.max(d.minutes ? 4 : 2, (d.minutes / top) * 100)}%` }}
              />
              <span className="sr-only">
                {d.label}: {d.minutes} minutes
              </span>
            </li>
          ))}
        </ol>
      </div>
      <ol className="mt-2 flex gap-2" aria-hidden>
        {week.map((d) => (
          <li key={d.day} className={`flex-1 text-center text-xs ${d.today ? 'font-bold text-stone-900' : 'text-stone-500'}`}>
            {d.label}
          </li>
        ))}
      </ol>
    </section>
  )
}

// A one-line summary of today for the home page, which opens Today.
export function TodayStrip({ focus, streak, onOpen }) {
  const t = focus.timerState
  return (
    <button
      type="button"
      onClick={onOpen}
      className="card mb-10 flex w-full flex-wrap items-center gap-x-5 gap-y-2 px-5 py-4 text-left text-sm text-stone-600 transition hover:shadow-card-hover sm:-mt-6"
    >
      <span className="flex items-center gap-2 font-semibold text-stone-900">
        <Timer className="size-4 text-brand-600" aria-hidden />
        {t ? `${t.paused ? 'Paused' : 'Focusing'} · ${clock(t.remainingMs)} left` : `${focus.todayMinutes} of ${focus.goal} focus minutes today`}
      </span>
      <span className="flex items-center gap-1.5">
        <Flame className="size-4 text-orange-600" aria-hidden />
        {streak.count}-day streak
      </span>
      <span className="flex items-center gap-1.5">
        <Trophy className="size-4 text-brand-600" aria-hidden />
        Level {focus.level.level}
      </span>
      <span className="ml-auto inline-flex items-center gap-1 font-semibold text-brand-600">
        {t ? 'Open timer' : 'Start focusing'}
        <ArrowRight className="size-4" aria-hidden />
      </span>
    </button>
  )
}
