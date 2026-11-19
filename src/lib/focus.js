import { useCallback, useEffect, useRef, useState } from 'react'
import { lagosDay } from './streak.js'

// Focus sessions, the daily goal and XP. Saved on this device:
//   studypack.focus.v1 = { goal, xp, sessions, days: { 'YYYY-MM-DD': minutes }, timer }
// timer is null, or { startedAt, durationMs, pausedAt, pausedMs, label }, so a
// session keeps counting while the student moves between screens, locks the
// phone or reloads the page.

const KEY = 'studypack.focus.v1'
export const GOALS = [30, 45, 60, 90, 120]
export const LENGTHS = [15, 25, 45, 60]
// A finished session earns this on top of 1 XP per minute.
export const FINISH_BONUS = 10
// Days kept for the week chart; XP and sessions are running totals.
const KEEP_DAYS = 60
const DAY_MS = 24 * 60 * 60 * 1000

const EMPTY = { goal: 60, xp: 0, sessions: 0, days: {}, timer: null }

export function readFocus(storage = globalThis.localStorage) {
  try {
    const s = JSON.parse(storage.getItem(KEY) ?? 'null')
    return s && typeof s.xp === 'number' ? { ...EMPTY, ...s } : EMPTY
  } catch {
    return EMPTY
  }
}

// XP needed to go from `level` to the next: 50, 75, 100, …
const needFor = (level) => 50 + 25 * (level - 1)

// { level, into, needed }: `into` XP of `needed` towards the next level.
export function levelFor(xp) {
  let level = 1
  let left = Math.max(0, Math.floor(xp))
  while (left >= needFor(level)) {
    left -= needFor(level)
    level++
  }
  return { level, into: left, needed: needFor(level) }
}

// Where a timer stands at `now`.
export function timerState(timer, now = Date.now()) {
  if (!timer) return null
  const elapsedMs = Math.max(0, Math.min(timer.durationMs, (timer.pausedAt ?? now) - timer.startedAt - timer.pausedMs))
  return { elapsedMs, remainingMs: timer.durationMs - elapsedMs, paused: timer.pausedAt != null, done: elapsedMs >= timer.durationMs }
}

export function startTimer(state, minutes, label = '', now = Date.now()) {
  return { ...state, timer: { startedAt: now, durationMs: minutes * 60_000, pausedAt: null, pausedMs: 0, label } }
}

export function pauseTimer(state, now = Date.now()) {
  if (!state.timer || state.timer.pausedAt != null) return state
  return { ...state, timer: { ...state.timer, pausedAt: now } }
}

export function resumeTimer(state, now = Date.now()) {
  const t = state.timer
  if (!t || t.pausedAt == null) return state
  return { ...state, timer: { ...t, pausedAt: null, pausedMs: t.pausedMs + (now - t.pausedAt) } }
}

// Ends the session and credits its whole minutes to today: a finished one
// also earns FINISH_BONUS. Returns { state, minutes, xp, finished }.
export function endTimer(state, now = Date.now()) {
  const t = timerState(state.timer, now)
  if (!t) return { state, minutes: 0, xp: 0, finished: false }
  const minutes = Math.floor(t.elapsedMs / 60_000)
  const finished = t.done
  const xp = minutes + (finished ? FINISH_BONUS : 0)
  const day = lagosDay(now)
  const days = Object.fromEntries(
    Object.entries({ ...state.days, [day]: (state.days[day] ?? 0) + minutes }).filter(
      ([d, m]) => m > 0 && Date.parse(d) > now - KEEP_DAYS * DAY_MS,
    ),
  )
  return {
    state: { ...state, timer: null, days, xp: state.xp + xp, sessions: state.sessions + (minutes > 0 ? 1 : 0) },
    minutes,
    xp,
    finished,
  }
}

// The 7 days ending today: [{ day, label, minutes, today }].
export function weekOf(state, now = Date.now()) {
  return Array.from({ length: 7 }, (_, i) => {
    const t = now - (6 - i) * DAY_MS
    const day = lagosDay(t)
    const label = new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
    return { day, label, minutes: state.days[day] ?? 0, today: i === 6 }
  })
}

// A short two-note chime and a buzz when a session ends. Both are optional.
function chime() {
  try {
    navigator.vibrate?.([200, 100, 200])
    const ctx = new AudioContext()
    ;[880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = freq
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.25)
      gain.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + i * 0.25 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.25 + 0.5)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.25)
      osc.stop(ctx.currentTime + i * 0.25 + 0.55)
    })
    setTimeout(() => ctx.close(), 1500)
  } catch {
    // no sound on this device
  }
}

// The focus state plus actions. `onEnded({ minutes, xp, finished })` runs
// when a session is credited, whether it ran out or was ended early.
export function useFocus({ onEnded } = {}) {
  const [state, setState] = useState(() => readFocus())
  const [now, setNow] = useState(Date.now)
  const onEndedRef = useRef(onEnded)
  useEffect(() => {
    onEndedRef.current = onEnded
  })

  const save = useCallback((next) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // storage blocked: progress lasts for this visit
    }
    setState(next)
  }, [])

  const end = useCallback(
    (from) => {
      const result = endTimer(from)
      save(result.state)
      if (result.finished) chime()
      onEndedRef.current?.(result)
    },
    [save],
  )

  const running = state.timer && state.timer.pausedAt == null
  // Ticks once a second while a session runs (and once on load, which also
  // credits a session that finished while the page was closed).
  useEffect(() => {
    if (!state.timer) return
    const tick = () => {
      const t = Date.now()
      setNow(t)
      if (timerState(state.timer, t).done) end(state)
    }
    tick()
    if (!running) return
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [state, running, end])

  const today = lagosDay(now)
  return {
    ...state,
    now,
    todayMinutes: state.days[today] ?? 0,
    level: levelFor(state.xp),
    week: weekOf(state, now),
    timerState: timerState(state.timer, now),
    start: (minutes, label) => save(startTimer(state, minutes, label)),
    pause: () => save(pauseTimer(state)),
    resume: () => save(resumeTimer(state)),
    stop: () => end(state),
    setGoal: (goal) => save({ ...state, goal }),
    // XP from elsewhere, e.g. ticking off a task in the daily plan (src/lib/examPlan.js).
    addXp: (amount) => save({ ...state, xp: Math.max(0, state.xp + amount) }),
  }
}

export const clock = (ms) => {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
