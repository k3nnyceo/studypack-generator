import { ArrowLeft, ArrowRight, CircleCheck, CircleX, Clock, Flag, RotateCcw, Timer, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { shuffled } from '../lib/flashcards.js'
import FilterChip from './FilterChip.jsx'
import { Button, Eyebrow } from './ui.jsx'

const LETTERS = 'ABCDEFGHIJ'
const LENGTHS = [10, 20, 30]
const PACES = [
  { seconds: 45, label: '45 sec' },
  { seconds: 60, label: '1 min' },
  { seconds: 90, label: '1½ min' },
]

// Nigerian university grading, so the result reads like a real exam.
const GRADES = [
  [70, 'A'],
  [60, 'B'],
  [50, 'C'],
  [45, 'D'],
  [40, 'E'],
  [0, 'F'],
]
const gradeFor = (percent) => GRADES.find(([min]) => percent >= min)[1]

// A timed mock exam from the pack's multiple-choice questions: no feedback
// until the end, answers can be changed and questions flagged, and it submits
// itself when time runs out. The clock runs from a fixed end time, so it stays
// right even if the phone locks mid-exam.
export default function ExamMode({ questions, modules, onExit }) {
  const [exam, setExam] = useState(null) // { deck, endsAt, startedAt, answers: Map, flagged: Set, index, submittedAt }

  if (!exam) return <ExamSetup questions={questions} modules={modules} onStart={setExam} onExit={onExit} />
  if (exam.submittedAt) return <ExamResults exam={exam} modules={modules} onRestart={() => setExam(null)} onExit={onExit} />
  return <ExamRunning exam={exam} setExam={setExam} />
}

function ExamSetup({ questions, modules, onStart, onExit }) {
  const [moduleFilter, setModuleFilter] = useState('all')
  const pool = questions.filter((q) => moduleFilter === 'all' || q.moduleIndex === moduleFilter)
  const lengths = [...new Set([...LENGTHS.filter((n) => n < pool.length), pool.length])]
  const [length, setLength] = useState(() => Math.min(20, questions.length))
  const [pace, setPace] = useState(60)
  const count = Math.min(length, pool.length)

  function start() {
    const deck = shuffled(pool).slice(0, count)
    const now = Date.now()
    onStart({ deck, startedAt: now, endsAt: now + count * pace * 1000, answers: new Map(), flagged: new Set(), index: 0 })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <button type="button" onClick={onExit} className="inline-flex items-center gap-1.5 text-sm font-medium text-stone-600 hover:text-stone-900">
        <ArrowLeft className="size-4" aria-hidden /> Back to practice
      </button>
      <section className="card space-y-6 p-6 sm:p-8">
        <div>
          <Eyebrow>Exam mode</Eyebrow>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">Sit a timed mock exam</h2>
          <p className="mt-2 text-stone-600">
            No answers are shown until you submit. You can change answers and flag questions to come back to. When time runs out,
            the exam submits itself.
          </p>
        </div>

        {modules.length > 1 && (
          <Choice label="Topics">
            <FilterChip active={moduleFilter === 'all'} onClick={() => setModuleFilter('all')}>
              All modules
            </FilterChip>
            {modules.map((title, m) =>
              questions.some((q) => q.moduleIndex === m) ? (
                <FilterChip key={m} active={moduleFilter === m} onClick={() => setModuleFilter(m)} title={title}>
                  <span className="max-w-48 truncate">{title}</span>
                </FilterChip>
              ) : null,
            )}
          </Choice>
        )}

        <Choice label="Questions">
          {lengths.map((n) => (
            <FilterChip key={n} active={count === n} onClick={() => setLength(n)}>
              {n === pool.length && n > 30 ? `All ${n}` : n}
            </FilterChip>
          ))}
        </Choice>

        <Choice label="Time per question">
          {PACES.map((p) => (
            <FilterChip key={p.seconds} active={pace === p.seconds} onClick={() => setPace(p.seconds)}>
              {p.label}
            </FilterChip>
          ))}
        </Choice>

        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-stone-100 pt-5">
          <p className="flex items-center gap-2 text-stone-700">
            <Clock className="size-4 text-brand-600" aria-hidden />
            <span>
              <span className="font-semibold">{count} questions</span> in{' '}
              <span className="font-semibold">{formatDuration(count * pace)}</span>
            </span>
          </p>
          <Button variant="primary" size="lg" icon={Timer} onClick={start} disabled={count === 0}>
            Start exam
          </Button>
        </div>
      </section>
    </div>
  )
}

function Choice({ label, children }) {
  return (
    <div>
      <p className="mb-2 text-sm font-semibold text-stone-800">{label}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}

function ExamRunning({ exam, setExam }) {
  const { deck, answers, flagged, index, endsAt } = exam
  const [now, setNow] = useState(() => Date.now())
  const [confirming, setConfirming] = useState(false)
  const left = Math.max(0, endsAt - now)
  const question = deck[index]
  const unanswered = deck.filter((q) => !answers.has(q.id)).length

  const submit = () => setExam((e) => (e.submittedAt ? e : { ...e, submittedAt: Math.min(Date.now(), e.endsAt) }))

  // Ticks every second, and catches up at once when the phone wakes.
  useEffect(() => {
    const tick = () => setNow(Date.now())
    const timer = setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [])
  useEffect(() => {
    if (left === 0) setExam((e) => (e.submittedAt ? e : { ...e, submittedAt: e.endsAt, timedOut: true }))
  }, [left, setExam])

  const update = (fn) => setExam((e) => ({ ...e, ...fn(e) }))
  const choose = (option) => update((e) => ({ answers: new Map(e.answers).set(question.id, option) }))
  const go = (i) => update(() => ({ index: Math.max(0, Math.min(deck.length - 1, i)) }))
  const toggleFlag = () =>
    update((e) => {
      const next = new Set(e.flagged)
      if (next.has(question.id)) next.delete(question.id)
      else next.add(question.id)
      return { flagged: next }
    })

  const urgent = left < 60_000
  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-20">
      {/* Fixed to the bottom of the screen, so the clock is always in view. */}
      <div className="fixed inset-x-4 bottom-4 z-20 mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-elevated ring-1 ring-stone-200 backdrop-blur">
        <span className="text-sm font-medium text-stone-700">
          Question {index + 1} of {deck.length}
        </span>
        <span
          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-mono text-sm font-bold tabular-nums ${urgent ? 'animate-pulse bg-rose-100 text-rose-700' : 'bg-brand-50 text-brand-800'}`}
          role="timer"
          aria-label={`Time left: ${formatClock(left)}`}
        >
          <Clock className="size-4" aria-hidden />
          {formatClock(left)}
        </span>
      </div>

      <nav aria-label="Questions" className="flex flex-wrap gap-1.5">
        {deck.map((q, i) => (
          <button
            key={q.id}
            type="button"
            onClick={() => go(i)}
            aria-current={i === index ? 'step' : undefined}
            aria-label={`Question ${i + 1}${answers.has(q.id) ? ', answered' : ''}${flagged.has(q.id) ? ', flagged' : ''}`}
            className={`relative size-9 rounded-lg text-xs font-semibold tabular-nums ring-1 transition ${
              i === index
                ? 'bg-stone-900 text-white ring-stone-900'
                : answers.has(q.id)
                  ? 'bg-brand-100 text-brand-800 ring-brand-200'
                  : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'
            }`}
          >
            {i + 1}
            {flagged.has(q.id) && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-amber-500 ring-2 ring-white" />}
          </button>
        ))}
      </nav>

      <section className="card p-6 sm:p-8" aria-live="polite">
        <p className="text-xs font-semibold tracking-wide text-stone-500 uppercase">{question.moduleTitle}</p>
        <h2 className="mt-2 text-lg leading-snug font-semibold text-stone-900 sm:text-xl">{question.question}</h2>
        <div className="mt-6 space-y-2.5" role="radiogroup" aria-label="Options">
          {question.options.map((option, i) => {
            const selected = answers.get(question.id) === option
            return (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => choose(option)}
                className={`flex w-full items-start gap-3 rounded-xl p-3.5 text-left ring-1 transition ${
                  selected ? 'bg-brand-50 ring-2 ring-brand-500' : 'bg-white ring-stone-200 hover:bg-stone-50'
                }`}
              >
                <span
                  className={`flex size-7 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${selected ? 'bg-brand-600 text-white' : 'bg-stone-100 text-stone-600'}`}
                >
                  {LETTERS[i]}
                </span>
                <span className="pt-0.5 text-stone-800">{option}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          onClick={toggleFlag}
          className={`mt-5 inline-flex items-center gap-1.5 text-sm font-medium ${flagged.has(question.id) ? 'text-amber-700' : 'text-stone-500 hover:text-stone-800'}`}
        >
          <Flag className="size-4" aria-hidden />
          {flagged.has(question.id) ? 'Flagged to come back to' : 'Flag this question'}
        </button>
      </section>

      {confirming ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 p-4" role="alertdialog" aria-label="Submit the exam">
          <p className="text-sm text-stone-700">
            {unanswered > 0 ? `${unanswered} question${unanswered === 1 ? ' is' : 's are'} unanswered. ` : ''}Submit your exam now?
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" icon={X} onClick={() => setConfirming(false)}>
              Keep going
            </Button>
            <Button variant="primary" onClick={submit}>
              Submit
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3">
          <Button onClick={() => go(index - 1)} disabled={index === 0} icon={ArrowLeft}>
            Previous
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setConfirming(true)}>
              Submit
            </Button>
            {index < deck.length - 1 && (
              <Button variant="primary" onClick={() => go(index + 1)}>
                Next <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ExamResults({ exam, modules, onRestart, onExit }) {
  const { deck, answers, startedAt, submittedAt, timedOut } = exam
  const [onlyWrong, setOnlyWrong] = useState(false)
  const marked = useMemo(
    () => deck.map((q) => ({ q, chosen: answers.get(q.id), correct: answers.get(q.id) === q.options[q.correctIndex] })),
    [deck, answers],
  )
  const score = marked.filter((m) => m.correct).length
  const percent = Math.round((score / deck.length) * 100)
  const grade = gradeFor(percent)
  const shown = onlyWrong ? marked.filter((m) => !m.correct) : marked

  const byModule = modules
    .map((title, i) => {
      const items = marked.filter((m) => m.q.moduleIndex === i)
      return { title, total: items.length, correct: items.filter((m) => m.correct).length }
    })
    .filter((m) => m.total > 0)

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="card p-6 text-center sm:p-8">
        <Eyebrow>{timedOut ? 'Time’s up' : 'Exam submitted'}</Eyebrow>
        <p className="mt-3 text-5xl font-extrabold tracking-tight text-stone-900 tabular-nums">
          {percent}%<span className="ml-3 text-3xl text-brand-600">{grade}</span>
        </p>
        <p className="mt-2 text-stone-600">
          {score} of {deck.length} correct · {formatDuration(Math.round((submittedAt - startedAt) / 1000))} used
        </p>
        {byModule.length > 1 && (
          <ul className="mx-auto mt-6 max-w-md space-y-2 text-left text-sm">
            {byModule.map((m) => (
              <li key={m.title} className="flex items-center justify-between gap-3">
                <span className="truncate text-stone-700">{m.title}</span>
                <span className="shrink-0 font-semibold tabular-nums text-stone-900">
                  {m.correct}/{m.total}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button variant="primary" icon={RotateCcw} onClick={onRestart}>
            New exam
          </Button>
          <Button onClick={onExit}>Back to practice</Button>
        </div>
      </section>

      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold text-stone-900">Review your answers</h3>
        <FilterChip active={onlyWrong} onClick={() => setOnlyWrong((v) => !v)}>
          Only the ones I got wrong
        </FilterChip>
      </div>
      <ol className="space-y-3">
        {shown.map(({ q, chosen, correct }) => (
          <li key={q.id} className="card p-5">
            <p className="flex items-start gap-2 font-medium text-stone-900">
              {correct ? (
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-label="Correct" />
              ) : (
                <CircleX className="mt-0.5 size-5 shrink-0 text-rose-600" aria-label="Wrong" />
              )}
              <span>
                {deck.indexOf(q) + 1}. {q.question}
              </span>
            </p>
            <div className="mt-3 space-y-1 pl-7 text-sm">
              {!correct && (
                <p className="text-rose-700">
                  Your answer: <span className="font-medium">{chosen ?? 'Not answered'}</span>
                </p>
              )}
              <p className="text-emerald-700">
                Correct answer: <span className="font-medium">{q.options[q.correctIndex]}</span>
              </p>
              {q.explanation && <p className="pt-1 text-stone-600">{q.explanation}</p>}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

const formatClock = (ms) => {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function formatDuration(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  if (m === 0) return `${s} sec`
  return s ? `${m} min ${s} sec` : `${m} min`
}
