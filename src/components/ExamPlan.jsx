import { BookOpen, CalendarClock, Check, Layers, ListChecks, Plus, Sparkles, Timer, X } from 'lucide-react'
import { useState } from 'react'
import { examLabel, TASK_XP } from '../lib/examPlan.js'
import { Button } from './ui.jsx'

const TASK_ICONS = { review: Layers, guide: BookOpen, quiz: ListChecks, exam: Timer, make: Sparkles }

// Exam countdown and today's plan (src/lib/examPlan.js), on the Today screen.
// `exams` are the upcoming ones (with daysLeft), `tasks` today's plan,
// `courses` the courses in the library (suggested when adding an exam).
export default function ExamPlan({ exams, tasks, done, courses, today, onAddExam, onRemoveExam, onToggle, onStart }) {
  const [adding, setAdding] = useState(false)
  const finished = tasks.filter((t) => done.includes(t.id)).length

  return (
    <section className="card overflow-hidden" aria-labelledby="exam-plan">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-6">
        <h2 id="exam-plan" className="flex items-center gap-2 text-sm font-semibold tracking-[0.08em] text-stone-500 uppercase">
          <CalendarClock className="size-4 text-brand-600" aria-hidden />
          Exams
        </h2>
        {!adding && (
          <Button size="sm" variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
            Add exam
          </Button>
        )}
      </div>

      {exams.length > 0 && (
        <ul className="flex gap-3 overflow-x-auto px-5 pt-3 pb-1 [scrollbar-width:none] sm:px-6">
          {exams.map((exam) => (
            <li key={exam.id} className="relative min-w-36 shrink-0 rounded-2xl bg-brand-50 px-4 py-3 ring-1 ring-brand-200">
              <p className="pr-5 text-sm font-bold text-brand-800">{examLabel(exam.course)}</p>
              <p className="mt-1 text-3xl leading-none font-extrabold text-stone-900 tabular-nums">{exam.daysLeft}</p>
              <p className="text-xs text-stone-500">
                {exam.daysLeft === 0 ? 'Today. Good luck!' : exam.daysLeft === 1 ? 'day left' : 'days left'} · {formatDay(exam.date)}
              </p>
              <button
                type="button"
                onClick={() => onRemoveExam(exam.id)}
                aria-label={`Remove the ${examLabel(exam.course)} exam`}
                className="absolute top-1.5 right-1.5 flex size-7 items-center justify-center rounded-full text-stone-400 transition hover:bg-white hover:text-stone-700"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && <AddExam courses={courses} today={today} onAdd={(course, date) => (onAddExam(course, date), setAdding(false))} onCancel={() => setAdding(false)} />}

      <div className="mt-4 border-t border-stone-100 px-5 py-4 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-bold text-stone-900">Today’s plan</h3>
          {tasks.length > 0 && (
            <p className="text-xs text-stone-500 tabular-nums">
              {finished} of {tasks.length} done · +{TASK_XP} XP each
            </p>
          )}
        </div>
        {tasks.length === 0 ? (
          <p className="mt-2 text-sm text-stone-600">
            {exams.length === 0
              ? 'Add your exam dates, and StudyPack plans what to study each day: cards to review, guides to read, quizzes and mock exams.'
              : 'Nothing planned for today. Your next exam is a while away; review any cards that come due.'}
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {tasks.map((task) => {
              const isDone = done.includes(task.id)
              const Icon = TASK_ICONS[task.kind]
              return (
                <li key={task.id} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 transition ${isDone ? 'bg-emerald-50/60 ring-emerald-200' : 'bg-white ring-stone-200'}`}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={isDone}
                    aria-label={`${isDone ? 'Untick' : 'Tick off'}: ${task.text}`}
                    onClick={() => onToggle(task)}
                    className={`flex size-6 shrink-0 items-center justify-center rounded-lg ring-2 transition ${isDone ? 'bg-emerald-500 text-white ring-emerald-500' : 'text-transparent ring-stone-300 hover:ring-brand-400'}`}
                  >
                    <Check className="size-4" strokeWidth={3} aria-hidden />
                  </button>
                  <Icon className="size-4 shrink-0 text-stone-400" aria-hidden />
                  <span className={`min-w-0 flex-1 text-sm ${isDone ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{task.text}</span>
                  {!isDone && (
                    <Button size="sm" variant={task.kind === 'review' || task.kind === 'exam' ? 'primary' : 'secondary'} onClick={() => onStart(task)}>
                      {task.kind === 'make' ? 'Make' : 'Start'}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </section>
  )
}

function AddExam({ courses, today, onAdd, onCancel }) {
  const [course, setCourse] = useState('')
  const [date, setDate] = useState('')
  const valid = course.trim() && date >= today
  return (
    <form
      className="mx-5 mt-3 grid gap-3 rounded-2xl bg-stone-50 p-4 ring-1 ring-stone-200 sm:mx-6 sm:grid-cols-[1fr_auto_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault()
        if (valid) onAdd(course, date)
      }}
    >
      <label className="text-sm font-semibold text-stone-800">
        Course
        <input
          list="exam-courses"
          value={course}
          onChange={(e) => setCourse(e.target.value)}
          placeholder="e.g. MTH 101"
          autoFocus
          className="mt-1 block h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-normal focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
        />
        <datalist id="exam-courses">
          {courses.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>
      <label className="text-sm font-semibold text-stone-800">
        Exam date
        <input
          type="date"
          value={date}
          min={today}
          onChange={(e) => setDate(e.target.value)}
          className="mt-1 block h-10 w-full rounded-xl border border-stone-300 bg-white px-3 text-sm font-normal focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" disabled={!valid}>
          Add
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}

const formatDay = (day) => new Date(`${day}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
