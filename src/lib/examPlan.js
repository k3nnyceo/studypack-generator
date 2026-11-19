import { useCallback, useEffect, useState } from 'react'
import { lagosDay } from './streak.js'

// Exam countdown and the daily plan (the Today screen). The student adds
// exam dates per course; each day StudyPack lists what to do for the exams
// coming up, from their packs:
//   - review the flashcards due in that course's packs (src/lib/dueCards.js),
//   - one study task per course, taking turns between reading the guide and
//     taking the quiz, and a timed mock exam in the last few days,
//   - or "make a study pack" when the course has none yet.
// Ticking a task off earns TASK_XP. Saved on this device:
//   studypack.plan.v1 = { exams: [{ id, course, date: 'YYYY-MM-DD' }],
//                         removed: [exam id], done: { 'YYYY-MM-DD': [task id] } }
// `removed` keeps an exam deleted here from coming back from another device
// when progress syncs (src/lib/progressSync.js).

const KEY = 'studypack.plan.v1'
export const TASK_XP = 5
// Exams this many days away or fewer get a daily task; further off, they're
// only counted down.
export const PLAN_WINDOW_DAYS = 45
// The last days before an exam: a timed mock exam instead of guide or quiz.
const MOCK_EXAM_DAYS = 3
const MAX_REVIEW_TASKS = 4
const EMPTY = { exams: [], removed: [], done: {} }
export const PLAN_KEY = KEY

const DAY_MS = 24 * 60 * 60 * 1000
const dayNumber = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS)
export const daysUntil = (date, today) => dayNumber(date) - dayNumber(today)

// "MTH 101", "MTH101" and "MTH 101 Elementary Mathematics I" are one course.
const courseCode = (name) => {
  const m = /\b([A-Za-z]{2,4}) ?(\d{3}[A-Za-z]?)\b/.exec(name ?? '')
  return m ? `${m[1].toUpperCase()} ${m[2].toUpperCase()}` : null
}
export function sameCourse(a, b) {
  const [ca, cb] = [courseCode(a), courseCode(b)]
  if (ca && cb) return ca === cb
  return (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase()
}

// A short name for an exam's course: its code if it has one.
export const examLabel = (course) => courseCode(course) ?? course

// Exams from today on, soonest first, with how many days are left.
export function upcomingExams(exams, today) {
  return exams
    .map((exam) => ({ ...exam, daysLeft: daysUntil(exam.date, today) }))
    .filter((exam) => exam.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft || a.course.localeCompare(b.course))
}

// Today's tasks: [{ id, kind, text, entry?, course?, count? }], kind being
// 'review' | 'guide' | 'quiz' | 'exam' | 'make'. `due` is from dueCards.js.
export function dailyPlan({ exams, entries, due, today }) {
  const tasks = []
  const reviewed = new Set()
  const soon = upcomingExams(exams, today).filter((exam) => exam.daysLeft <= PLAN_WINDOW_DAYS)

  for (const [index, exam] of soon.entries()) {
    const packs = entries.filter((entry) => sameCourse(entry.course, exam.course))
    if (packs.length === 0) {
      tasks.push({ id: `${today}:make:${exam.id}`, kind: 'make', course: exam.course, text: `Make a study pack for ${examLabel(exam.course)}` })
      continue
    }
    for (const { entry, due: count } of due.packs.filter((p) => packs.includes(p.entry))) {
      reviewed.add(entry.id)
      tasks.push({ id: `${today}:review:${entry.id}`, kind: 'review', entry, count, text: `Review ${count} due flashcard${count === 1 ? '' : 's'}: ${entry.topic}` })
    }
    // One pack a day per course, in turn; guide and quiz take turns day by day
    // (offset per exam, so two courses don't both ask for a quiz today).
    const n = dayNumber(today)
    const entry = packs[n % packs.length]
    const kind = exam.daysLeft <= MOCK_EXAM_DAYS ? 'exam' : (n + index) % 2 === 0 ? 'guide' : 'quiz'
    const text = { exam: `Timed mock exam: ${entry.topic}`, guide: `Read the study guide: ${entry.topic}`, quiz: `Take the quiz: ${entry.topic}` }[kind]
    tasks.push({ id: `${today}:${kind}:${entry.id}`, kind, entry, course: exam.course, text })
  }

  // Cards due in packs without an exam still get reviewed, a few at most.
  for (const { entry, due: count } of due.packs.filter((p) => !reviewed.has(p.entry.id)).slice(0, MAX_REVIEW_TASKS)) {
    tasks.push({ id: `${today}:review:${entry.id}`, kind: 'review', entry, count, text: `Review ${count} due flashcard${count === 1 ? '' : 's'}: ${entry.topic}` })
  }
  return tasks
}

export function readPlan(storage = globalThis.localStorage) {
  try {
    const plan = JSON.parse(storage?.getItem(KEY) ?? 'null')
    return plan && Array.isArray(plan.exams) ? { exams: plan.exams, removed: plan.removed ?? [], done: plan.done ?? {} } : EMPTY
  } catch {
    return EMPTY
  }
}

// Keeps only today's ticks (older days don't matter any more).
export const withoutOldDays = (done, today) => (done[today] ? { [today]: done[today] } : {})

// { exams, done (today's task ids), today, addExam, removeExam, toggle }.
// `now` is the current time (the focus clock's, so today rolls over at
// midnight). `toggle(task)` returns +TASK_XP when ticked, -TASK_XP when unticked.
export function useExamPlan(now) {
  const [plan, setPlan] = useState(() => readPlan())
  const today = lagosDay(now)

  const save = useCallback((next) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      // Storage blocked: the plan lasts for this visit.
    }
    setPlan(next)
  }, [])

  useEffect(() => {
    const onStorage = (e) => e.key === KEY && setPlan(readPlan())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const done = plan.done[today] ?? []
  return {
    exams: plan.exams,
    done,
    today,
    addExam: (course, date) =>
      save({ ...plan, exams: [...plan.exams, { id: `e${Date.now().toString(36)}`, course: course.trim(), date }] }),
    removeExam: (id) => save({ ...plan, exams: plan.exams.filter((exam) => exam.id !== id), removed: [...(plan.removed ?? []), id] }),
    toggle: (task) => {
      const ticked = done.includes(task.id)
      const ids = ticked ? done.filter((id) => id !== task.id) : [...done, task.id]
      save({ ...plan, done: { ...withoutOldDays(plan.done, today), [today]: ids } })
      return ticked ? -TASK_XP : TASK_XP
    },
  }
}
