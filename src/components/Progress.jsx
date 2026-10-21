import { CircleCheck, Layers, ListChecks, MessageCircleQuestion, Target, TrendingUp } from 'lucide-react'
import SourceLink from './SourceLink.jsx'
import { Badge, Button, Eyebrow } from './ui.jsx'

const STATUS = {
  weak: { label: 'Needs practice', tone: 'rose', bar: 'bg-rose-500' },
  improving: { label: 'Getting there', tone: 'amber', bar: 'bg-amber-500' },
  strong: { label: 'Strong', tone: 'emerald', bar: 'bg-emerald-500' },
  new: { label: 'Not practised yet', tone: undefined, bar: 'bg-stone-300' },
}

// The pack's topics, weakest first (src/lib/insights.js), with a way to
// practise each: its quiz (missed questions first), its flashcards, or a
// question for the tutor chat.
export default function Progress({ insight, canAsk, onPractise, onReviewCards, onAsk }) {
  const { modules, weak, practised, mastery } = insight
  const started = practised > 0

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="card p-6 sm:p-8">
        <Eyebrow>Your progress</Eyebrow>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">
          {!started ? 'Find your weak topics' : weak ? `${weak} topic${weak === 1 ? '' : 's'} need${weak === 1 ? 's' : ''} practice` : 'No weak topics right now'}
        </h1>
        <p className="mt-2 max-w-xl text-stone-600">
          {!started
            ? 'Answer some quiz questions or mark a few flashcards, and StudyPack shows which topics you know and which need more work.'
            : `Based on your latest ${practised} quiz answer${practised === 1 ? '' : 's'} and flashcards. Practise a topic and it updates as you go.`}
        </p>
        {started && (
          <div className="mt-5 flex items-center gap-4">
            <span className="text-4xl font-extrabold tracking-tight text-stone-900 tabular-nums">{Math.round(mastery * 100)}%</span>
            <span className="text-sm text-stone-500">overall, across everything you’ve practised</span>
          </div>
        )}
        {!started && (
          <div className="mt-5 flex flex-wrap gap-3">
            <Button variant="primary" icon={ListChecks} onClick={() => onPractise(modules[0]?.index ?? 0)}>
              Start with the quiz
            </Button>
            <Button icon={Layers} onClick={() => onReviewCards(0)}>
              Review flashcards
            </Button>
          </div>
        )}
      </section>

      <ol className="space-y-4">
        {modules.map((m) => {
          const s = STATUS[m.status]
          return (
            <li key={m.index} className={`card p-5 sm:p-6 ${m.status === 'weak' ? 'ring-2 ring-rose-200' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={s.tone}>
                  {m.status === 'weak' ? <Target className="size-3.5" aria-hidden /> : m.status === 'strong' ? <CircleCheck className="size-3.5" aria-hidden /> : m.status === 'improving' ? <TrendingUp className="size-3.5" aria-hidden /> : null}
                  {s.label}
                </Badge>
                <SourceLink chip sourceRange={m.sourceRange} />
              </div>
              <h2 className="mt-3 text-lg font-bold text-stone-900">{m.title}</h2>
              {m.practised > 0 && (
                <div className="mt-3">
                  <div className="h-2 overflow-hidden rounded-full bg-stone-100" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(m.mastery * 100)} aria-label={`${m.title}: ${Math.round(m.mastery * 100)}%`}>
                    <div className={`h-full rounded-full ${s.bar}`} style={{ width: `${Math.max(4, Math.round(m.mastery * 100))}%` }} />
                  </div>
                  <p className="mt-2 text-sm text-stone-500">
                    {Math.round(m.mastery * 100)}%
                    {m.quiz.answered > 0 && ` · ${m.quiz.right} of ${m.quiz.answered} quiz answers right`}
                    {m.cards.marked > 0 && ` · ${m.cards.learning} of ${m.cards.marked} flashcards still learning`}
                  </p>
                </div>
              )}

              {m.missed.length > 0 && (
                <details className="group mt-4" open={m.status === 'weak'}>
                  <summary className="cursor-pointer list-none text-sm font-semibold text-stone-700 [&::-webkit-details-marker]:hidden">
                    {m.missed.length} question{m.missed.length === 1 ? '' : 's'} you got wrong last time
                  </summary>
                  <ul className="mt-2 space-y-2">
                    {m.missed.slice(0, 5).map((q) => (
                      <li key={q.id} className="rounded-xl bg-stone-50 p-3 text-sm ring-1 ring-stone-200">
                        <p className="text-stone-800">{q.question}</p>
                        <p className="mt-1 text-emerald-700">
                          <span className="font-semibold">Answer:</span> {q.options[q.correctIndex]}
                        </p>
                        <SourceLink sourcePages={q.sourcePages} className="mt-1.5" />
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                <Button size="sm" variant={m.status === 'weak' ? 'primary' : 'soft'} icon={ListChecks} onClick={() => onPractise(m.index)} disabled={!m.quiz.total}>
                  {m.missed.length ? `Practise (${m.missed.length} missed first)` : 'Practise'}
                </Button>
                <Button size="sm" variant="ghost" icon={Layers} onClick={() => onReviewCards(m.index)} disabled={!m.cards.total}>
                  Review cards
                </Button>
                {canAsk && (m.status === 'weak' || m.status === 'improving') && (
                  <Button size="sm" variant="ghost" icon={MessageCircleQuestion} onClick={() => onAsk(m)}>
                    Ask about it
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
