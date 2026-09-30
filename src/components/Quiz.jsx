import { ArrowLeft, ArrowRight, Check, CircleCheck, CircleX, Info, RotateCcw, Sparkles, Target, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import FilterChip from './FilterChip.jsx'
import { Button } from './ui.jsx'

const LETTERS = 'ABCDEFGHIJ'

// `answers` is a Map of question id -> { selected, correct }, owned by the
// parent so results survive switching tabs. `selected` is the option text,
// because generated questions reshuffle their options when the quiz is rebuilt.
export default function Quiz({ questions, modules, answers, onAnswer, onClearAnswers }) {
  const [moduleFilter, setModuleFilter] = useState('all')
  const [retryIds, setRetryIds] = useState(null) // Set of ids during a "retry incorrect" round
  const [index, setIndex] = useState(0)
  const [showResults, setShowResults] = useState(false)

  const deck = questions.filter(
    (q) => (moduleFilter === 'all' || q.moduleIndex === moduleFilter) && (!retryIds || retryIds.has(q.id)),
  )
  const question = deck[index]
  const answer = question && answers.get(question.id)

  const answered = deck.filter((q) => answers.has(q.id))
  const correctCount = answered.filter((q) => answers.get(q.id).correct).length
  const incorrect = answered.filter((q) => !answers.get(q.id).correct)
  const complete = deck.length > 0 && answered.length === deck.length
  const isLast = index === deck.length - 1
  const firstUnanswered = deck.findIndex((q) => !answers.has(q.id))

  function choose(optionIndex) {
    if (!question || answer || showResults || optionIndex >= question.options.length) return
    onAnswer(question.id, {
      selected: question.options[optionIndex],
      correct: optionIndex === question.correctIndex,
    })
  }

  function go(step) {
    const next = index + step
    if (next >= 0 && next < deck.length) setIndex(next)
  }

  // The primary button: next question, jump back to anything skipped, or finish.
  function advance() {
    if (!isLast) return go(1)
    if (complete) return setShowResults(true)
    if (firstUnanswered >= 0) setIndex(firstUnanswered)
  }

  function startRound({ filter = moduleFilter, retry = null } = {}) {
    setModuleFilter(filter)
    setRetryIds(retry)
    setIndex(0)
    setShowResults(false)
  }

  function retryIncorrect() {
    const ids = incorrect.map((q) => q.id)
    onClearAnswers(ids)
    startRound({ retry: new Set(ids) })
  }

  function retakeAll() {
    onClearAnswers(deck.map((q) => q.id))
    startRound({ retry: null })
  }

  // 1-9 or A-J pick an option; arrows move; Enter continues once answered.
  useEffect(() => {
    function onKeyDown(e) {
      if (showResults || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
      const numeric = Number(e.key)
      const letter = e.key.length === 1 ? LETTERS.indexOf(e.key.toUpperCase()) : -1
      if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'Enter' && answer && e.target === document.body) advance()
      else if (numeric >= 1 && numeric <= 9) choose(numeric - 1)
      else if (letter >= 0) choose(letter)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (questions.length === 0) {
    return (
      <p className="rounded-2xl bg-white p-8 text-center text-stone-500 ring-1 ring-stone-200">
        This study guide has no quiz questions, and not enough definitions to generate any.
      </p>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="card overflow-hidden p-4 sm:p-5">
        <div className="-mr-4 flex gap-2 overflow-x-auto pr-10 pb-1 [scrollbar-width:none] [mask-image:linear-gradient(to_right,#000_calc(100%-3rem),transparent)] sm:-mr-5">
          <FilterChip active={moduleFilter === 'all' && !retryIds} onClick={() => startRound({ filter: 'all' })}>
            All modules
            <Count questions={questions} answers={answers} />
          </FilterChip>
          {modules.map((title, m) => {
            const moduleQuestions = questions.filter((q) => q.moduleIndex === m)
            if (moduleQuestions.length === 0) return null
            return (
              <FilterChip
                key={m}
                active={moduleFilter === m && !retryIds}
                onClick={() => startRound({ filter: m })}
                title={title}
              >
                <span className="max-w-48 truncate">{title}</span>
                <Count questions={moduleQuestions} answers={answers} />
              </FilterChip>
            )
          })}
        </div>
      </div>

      {retryIds && (
        <div className="animate-page-in flex items-center justify-between gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-950 ring-1 ring-amber-200">
          <span>
            <RotateCcw className="mr-2 inline size-4 text-amber-700" aria-hidden />
            <span className="font-semibold">Retry round:</span> {deck.length} question{deck.length === 1 ? '' : 's'} you
            missed
          </span>
          <button onClick={() => startRound({ retry: null })} className="font-medium underline-offset-2 hover:underline">
            Back to all questions
          </button>
        </div>
      )}

      {showResults && complete ? (
        <Results
          deck={deck}
          answers={answers}
          modules={modules}
          showBreakdown={moduleFilter === 'all'}
          isRetry={Boolean(retryIds)}
          onRetryIncorrect={retryIncorrect}
          onRetakeAll={retakeAll}
          onReview={() => startRound({ retry: retryIds })}
        />
      ) : (
        <>
          <ProgressBar
            label={`Question ${index + 1} of ${deck.length}`}
            total={deck.length}
            correct={correctCount}
            incorrect={incorrect.length}
          />

          <QuestionCard key={question.id} question={question} answer={answer} onChoose={choose} />

          <div className="flex items-center justify-between gap-4">
            <Button onClick={() => go(-1)} disabled={index === 0} icon={ArrowLeft}>
              Previous
            </Button>
            <p className="hidden text-xs text-stone-500 sm:block">
              Press 1–{Math.min(question.options.length, 9)} to answer
            </p>
            <Button
              variant={answer ? 'primary' : 'secondary'}
              onClick={advance}
              disabled={isLast && !complete && firstUnanswered === index}
            >
              {!isLast ? 'Next' : complete ? 'See results' : 'Go to unanswered'}
              <ArrowRight className="size-4" strokeWidth={2.25} aria-hidden />
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

function ProgressBar({ label, total, correct, incorrect }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span className="font-medium text-stone-700">{label}</span>
        <span className="flex gap-3 text-stone-500">
          <span>
            <span className="font-semibold tabular-nums text-emerald-600">{correct}</span> correct
          </span>
          <span>
            <span className="font-semibold tabular-nums text-rose-600">{incorrect}</span> incorrect
          </span>
        </span>
      </div>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-stone-200"
        role="progressbar"
        aria-label="Questions answered"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={correct + incorrect}
      >
        <div className="h-full bg-emerald-500 transition-[width] duration-500 ease-out" style={{ width: `${(correct / total) * 100}%` }} />
        <div className="h-full bg-rose-400 transition-[width] duration-500 ease-out" style={{ width: `${(incorrect / total) * 100}%` }} />
      </div>
    </div>
  )
}

function QuestionCard({ question, answer, onChoose }) {
  return (
    <div className="animate-card-next rounded-3xl bg-white p-6 shadow-elevated ring-1 ring-stone-200/80 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium text-stone-500">{question.moduleTitle}</span>
        {question.generated && (
          <span
            className="rounded-full bg-stone-100 px-2.5 py-1 font-medium text-stone-500"
            title="This module had no quiz questions, so this one was generated from its key definitions."
          >
            <Info className="mr-1 inline size-3 align-[-1px]" strokeWidth={2.5} aria-hidden />
            From definitions
          </span>
        )}
      </div>

      <h2 className="mt-3 text-xl font-semibold leading-snug text-stone-900 sm:text-2xl">{question.question}</h2>
      {question.quote && (
        <blockquote className="mt-4 rounded-xl border-l-4 border-brand-400 bg-brand-50/60 px-4 py-3 leading-relaxed text-stone-700">
          {question.quote}
        </blockquote>
      )}

      <ul className="mt-6 space-y-3">
        {question.options.map((option, i) => (
          <li key={i}>
            <OptionButton
              letter={LETTERS[i]}
              text={option}
              state={optionState(question, answer, i)}
              disabled={Boolean(answer)}
              onClick={() => onChoose(i)}
            />
          </li>
        ))}
      </ul>

      {answer && <Feedback question={question} answer={answer} />}
    </div>
  )
}

// Shown the moment an option is picked: verdict, the explanation, and for
// generated questions what each wrong option actually means.
function Feedback({ question, answer }) {
  const correctOption = question.options[question.correctIndex]
  const otherNotes = question.options
    .map((option, i) => ({ option, note: question.optionNotes[i], chosen: option === answer.selected }))
    .filter(({ note }) => note)

  return (
    <div
      className={`animate-card-next mt-6 rounded-2xl p-5 text-sm leading-relaxed ring-1 ${
        answer.correct ? 'bg-emerald-50 text-emerald-950 ring-emerald-200' : 'bg-rose-50 text-rose-950 ring-rose-200'
      }`}
      role="status"
    >
      <p className="flex items-start gap-2 text-base font-semibold">
        {answer.correct ? (
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-emerald-600" aria-hidden />
        ) : (
          <CircleX className="mt-0.5 size-5 shrink-0 text-rose-600" aria-hidden />
        )}
        {answer.correct ? 'Correct!' : `Not quite. The correct answer is “${correctOption}”.`}
      </p>
      {question.explanation && <p className="mt-2 pl-7">{question.explanation}</p>}
      {otherNotes.length > 0 && (
        <dl className="mt-4 space-y-2 pl-7">
          {otherNotes.map(({ option, note, chosen }) => (
            <div key={option} className={`rounded-xl px-3.5 py-2.5 ${chosen ? 'bg-white ring-1 ring-rose-300' : 'bg-white/70'}`}>
              <dt className="font-semibold">
                {option}
                {chosen && <span className="ml-2 text-xs font-medium text-rose-600">your answer</span>}
              </dt>
              <dd className="text-stone-600">{note}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  )
}

function Results({ deck, answers, modules, showBreakdown, isRetry, onRetryIncorrect, onRetakeAll, onReview }) {
  const correct = deck.filter((q) => answers.get(q.id)?.correct).length
  const missed = deck.filter((q) => !answers.get(q.id)?.correct)
  const percent = Math.round((correct / deck.length) * 100)
  const verdict =
    percent === 100 ? 'Perfect score!' : percent >= 80 ? 'Great work!' : percent >= 60 ? 'Good progress' : 'Keep practising'

  const byModule = modules
    .map((title, m) => {
      const qs = deck.filter((q) => q.moduleIndex === m)
      return { title, total: qs.length, correct: qs.filter((q) => answers.get(q.id)?.correct).length }
    })
    .filter((row) => row.total > 0)

  return (
    <div className="animate-card-next space-y-6">
      <div className="rounded-3xl bg-white p-8 text-center shadow-elevated ring-1 ring-stone-200/80 sm:p-10">
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-[0.08em] text-brand-600 uppercase">
          <Sparkles className="size-3.5" aria-hidden />
          {isRetry ? 'Retry round complete' : 'Quiz complete'}
        </p>
        <ScoreRing percent={percent} />
        <p className="text-2xl font-bold tracking-tight text-stone-900">{verdict}</p>
        <p className="mt-1 text-stone-500">
          You got <span className="font-semibold text-stone-800">{correct}</span> of {deck.length} questions right.
        </p>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          {missed.length > 0 && (
            <Button variant="primary" size="lg" icon={Target} onClick={onRetryIncorrect}>
              Retry incorrect only ({missed.length})
            </Button>
          )}
          <Button size="lg" icon={RotateCcw} onClick={onRetakeAll}>
            {isRetry ? 'Retake these' : 'Retake quiz'}
          </Button>
          <Button size="lg" variant="ghost" onClick={onReview}>
            Review answers
          </Button>
        </div>
      </div>

      {showBreakdown && byModule.length > 1 && (
        <section className="card p-6 sm:p-8">
          <h2 className="mb-5 text-xs font-semibold tracking-[0.08em] text-stone-500 uppercase">By module</h2>
          <ul className="space-y-3">
            {byModule.map((row) => (
              <li key={row.title}>
                <div className="mb-1 flex justify-between gap-4 text-sm">
                  <span className="truncate text-stone-700">{row.title}</span>
                  <span className="shrink-0 tabular-nums text-stone-500">
                    {row.correct}/{row.total}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-stone-100">
                  <div
                    className={`h-full rounded-full ${row.correct === row.total ? 'bg-emerald-500' : row.correct / row.total >= 0.5 ? 'bg-amber-400' : 'bg-rose-400'}`}
                    style={{ width: `${(row.correct / row.total) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {missed.length > 0 && (
        <section className="card p-6 sm:p-8">
          <h2 className="mb-5 text-xs font-semibold tracking-[0.08em] text-stone-500 uppercase">
            Questions to review ({missed.length})
          </h2>
          <ul className="divide-y divide-stone-100">
            {missed.map((q) => (
              <li key={q.id} className="py-4 first:pt-0 last:pb-0">
                <p className="text-xs text-stone-500">{q.moduleTitle}</p>
                <p className="mt-1 font-medium text-stone-900">{q.quote ? `“${q.quote}”` : q.question}</p>
                <div className="mt-2 space-y-1 text-sm">
                  <p className="text-rose-700">
                    <span className="font-semibold">Your answer:</span> {answers.get(q.id).selected}
                  </p>
                  <p className="text-emerald-700">
                    <span className="font-semibold">Correct answer:</span> {q.options[q.correctIndex]}
                  </p>
                </div>
                {q.explanation && !q.generated && <p className="mt-2 text-sm text-stone-600">{q.explanation}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function ScoreRing({ percent }) {
  const radius = 52
  const circumference = 2 * Math.PI * radius
  const color = percent >= 80 ? 'text-emerald-500' : percent >= 60 ? 'text-amber-400' : 'text-rose-400'
  return (
    <div className="relative mx-auto my-5 h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" strokeWidth="10" className="stroke-stone-100" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          stroke="currentColor"
          className={`${color} animate-score-ring`}
          style={{
            strokeDasharray: circumference,
            strokeDashoffset: circumference * (1 - percent / 100),
            '--ring-from': circumference,
          }}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-4xl font-extrabold tabular-nums text-stone-900">
        {percent}%
      </span>
    </div>
  )
}

function optionState(question, answer, i) {
  if (!answer) return 'idle'
  if (i === question.correctIndex) return 'correct'
  if (question.options[i] === answer.selected) return 'wrong'
  return 'dimmed'
}

const OPTION_STYLES = {
  idle: 'bg-white ring-stone-200 hover:bg-brand-50/60 hover:ring-brand-300 hover:shadow-card active:scale-[0.99]',
  correct: 'bg-emerald-50 ring-2 ring-emerald-500 text-emerald-900',
  wrong: 'animate-shake bg-rose-50 ring-2 ring-rose-400 text-rose-900',
  dimmed: 'bg-white ring-stone-200 opacity-50',
}

const LETTER_STYLES = {
  idle: 'bg-stone-100 text-stone-500 group-hover:bg-brand-100 group-hover:text-brand-700',
  correct: 'bg-emerald-500 text-white',
  wrong: 'bg-rose-500 text-white',
  dimmed: 'bg-stone-100 text-stone-500',
}

function OptionButton({ letter, text, state, disabled, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`group flex w-full items-center gap-4 rounded-2xl px-4 py-3.5 text-left ring-1 transition duration-200 disabled:cursor-default ${OPTION_STYLES[state]}`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-bold transition ${LETTER_STYLES[state]}`}>
        {state === 'correct' ? (
          <Check className="size-4" strokeWidth={3} aria-hidden />
        ) : state === 'wrong' ? (
          <X className="size-4" strokeWidth={3} aria-hidden />
        ) : (
          letter
        )}
      </span>
      <span className="leading-snug">{text}</span>
    </button>
  )
}

function Count({ questions, answers }) {
  const done = questions.filter((q) => answers.has(q.id)).length
  return (
    <span className="text-xs font-medium text-stone-500 tabular-nums group-aria-pressed:text-stone-300">
      {done}/{questions.length}
    </span>
  )
}
