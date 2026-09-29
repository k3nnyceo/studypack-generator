import { useMemo, useState } from 'react'
import { buildFlashcards } from '../lib/flashcards.js'
import { buildQuiz } from '../lib/quiz.js'
import Flashcards from './Flashcards.jsx'
import Quiz from './Quiz.jsx'

export default function StudyGuide({
  guide,
  fileName,
  onBack,
  onReset,
  reviewedCards,
  onReviewCard,
  onResetReviewed,
  quizAnswers,
  onAnswerQuiz,
  onClearQuizAnswers,
}) {
  const [tab, setTab] = useState('guide')
  const cards = useMemo(() => buildFlashcards(guide), [guide])
  const questions = useMemo(() => buildQuiz(guide), [guide])
  const moduleTitles = guide.modules.map((m) => m.title)

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={onBack} className="text-sm font-medium text-slate-500 transition hover:text-slate-800">
          ← Back to extracted notes
        </button>
        <button
          onClick={onReset}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 ring-1 ring-slate-300 transition hover:bg-white"
        >
          Upload another
        </button>
      </div>

      <header className="rounded-2xl bg-indigo-600 p-6 text-white shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-200">Study guide · {fileName}</p>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">{guide.title}</h1>
        <p className="mt-3 max-w-3xl leading-relaxed text-indigo-100">{guide.overview}</p>
      </header>

      <div className="flex justify-center">
        <div className="inline-flex rounded-2xl bg-slate-200/70 p-1" role="tablist" aria-label="Study mode">
          <TabButton active={tab === 'guide'} onClick={() => setTab('guide')}>
            Study guide
          </TabButton>
          <TabButton active={tab === 'flashcards'} onClick={() => setTab('flashcards')}>
            Flashcards
            <TabCount>{cards.length}</TabCount>
          </TabButton>
          <TabButton active={tab === 'quiz'} onClick={() => setTab('quiz')}>
            Quiz
            <TabCount>{questions.length}</TabCount>
          </TabButton>
        </div>
      </div>

      {tab === 'quiz' ? (
        <Quiz
          questions={questions}
          modules={moduleTitles}
          answers={quizAnswers}
          onAnswer={onAnswerQuiz}
          onClearAnswers={onClearQuizAnswers}
        />
      ) : tab === 'flashcards' ? (
        <Flashcards
          cards={cards}
          modules={moduleTitles}
          reviewed={reviewedCards}
          onReview={onReviewCard}
          onResetProgress={onResetReviewed}
        />
      ) : (
        <div className="lg:grid lg:grid-cols-[14rem_1fr] lg:gap-8">
          <nav aria-label="Modules" className="mb-6 lg:mb-0">
            <ol className="flex gap-2 overflow-x-auto pb-2 lg:sticky lg:top-6 lg:flex-col lg:overflow-visible lg:pb-0">
              {guide.modules.map((module, i) => (
                <li key={i} className="shrink-0">
                  <a
                    href={`#module-${i + 1}`}
                    className="flex items-start gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 ring-1 ring-slate-200 transition hover:bg-white hover:text-indigo-700 lg:ring-0"
                  >
                    <span className="font-semibold tabular-nums text-indigo-500">{i + 1}</span>
                    <span className="lg:line-clamp-2">{module.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="min-w-0 space-y-10">
            {guide.modules.map((module, i) => (
              <Module key={i} module={module} number={i + 1} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 sm:px-5 text-sm font-semibold transition ${
        active ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  )
}

function Module({ module, number }) {
  return (
    <section id={`module-${number}`} className="scroll-mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">
        Module {number}
        {module.sourceRange && <span className="font-normal normal-case text-slate-400"> · {module.sourceRange}</span>}
      </p>
      <h2 className="mt-1 text-2xl font-bold text-slate-900">{module.title}</h2>

      <div className="mt-4 space-y-3 leading-relaxed text-slate-700">
        {module.summary.split(/\n{2,}/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>

      {module.keyPoints.length > 0 && (
        <SubSection title="Key points">
          <ul className="space-y-2">
            {module.keyPoints.map((point, i) => (
              <li key={i} className="flex gap-3 text-slate-700">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-500" />
                {point}
              </li>
            ))}
          </ul>
        </SubSection>
      )}

      {module.definitions.length > 0 && (
        <SubSection title="Key definitions">
          <dl className="grid gap-3 sm:grid-cols-2">
            {module.definitions.map((def, i) => (
              <div key={i} className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <dt className="font-semibold text-slate-900">{def.term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-slate-600">{def.definition}</dd>
              </div>
            ))}
          </dl>
        </SubSection>
      )}

      {module.workedExamples.length > 0 && (
        <SubSection title="Worked examples">
          <div className="space-y-3">
            {module.workedExamples.map((example, i) => (
              <WorkedExample key={i} example={example} number={i + 1} />
            ))}
          </div>
        </SubSection>
      )}
    </section>
  )
}

function SubSection({ title, children }) {
  return (
    <div className="mt-8">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      {children}
    </div>
  )
}

// The solution stays hidden until the student asks for it, so they can try first.
function WorkedExample({ example, number }) {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className="rounded-xl ring-1 ring-slate-200">
      <div className="p-4">
        <p className="text-sm font-semibold text-slate-900">
          <span className="text-indigo-600">Example {number}.</span> {example.title}
        </p>
        <p className="mt-2 whitespace-pre-line text-slate-700">{example.problem}</p>
        <button
          onClick={() => setRevealed((r) => !r)}
          aria-expanded={revealed}
          className="mt-3 text-sm font-medium text-indigo-600 transition hover:text-indigo-800"
        >
          {revealed ? 'Hide solution' : 'Show solution'}
        </button>
      </div>
      {revealed && (
        <div className="border-t border-slate-200 bg-slate-50 p-4">
          <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700 marker:font-semibold marker:text-slate-400">
            {example.steps.map((step, i) => (
              <li key={i} className="whitespace-pre-line pl-1">{step}</li>
            ))}
          </ol>
          <p className="mt-4 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
            <span className="font-semibold">Answer: </span>
            {example.answer}
          </p>
        </div>
      )}
    </div>
  )
}

function TabCount({ children }) {
  return (
    <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-indigo-700">
      {children}
    </span>
  )
}
