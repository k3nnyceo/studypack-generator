import { useMemo, useRef, useState } from 'react'
import AiGenerate from './components/AiGenerate.jsx'
import AppHeader from './components/AppHeader.jsx'
import ExtractedPreview from './components/ExtractedPreview.jsx'
import Flashcards from './components/Flashcards.jsx'
import GuideHero from './components/GuideHero.jsx'
import GuideImport from './components/GuideImport.jsx'
import Landing from './components/Landing.jsx'
import Quiz from './components/Quiz.jsx'
import StudyGuide from './components/StudyGuide.jsx'
import { AI_GENERATION_ENABLED } from './config.js'
import { buildFlashcards } from './lib/flashcards.js'
import { generateStudyGuide } from './lib/generateStudyGuide.js'
import { parseDocument, validateFile } from './lib/parseDocument.js'
import { buildQuiz } from './lib/quiz.js'
import { parseStudyGuide } from './lib/studyGuideFormat.js'

const MAX_GUIDE_FILE_SIZE = 5 * 1024 * 1024

export default function App() {
  // view: 'home' | 'notes' | 'guide' | 'flashcards' | 'quiz'
  const [view, setView] = useState('home')
  const [status, setStatus] = useState('idle') // for the home screen: 'idle' | 'parsing' | 'error'
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const [guide, setGuide] = useState(null)
  const [jsonDraft, setJsonDraft] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const generateAbort = useRef(null)

  // Built once per guide, so quiz option order stays put while switching views.
  const cards = useMemo(() => (guide ? buildFlashcards(guide) : []), [guide])
  const questions = useMemo(() => (guide ? buildQuiz(guide) : []), [guide])

  // Flashcards reviewed this session; cleared when a new guide is loaded.
  const [reviewedCards, setReviewedCards] = useState(() => new Set())
  const markReviewed = (id) => setReviewedCards((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))

  // Quiz answers this session: question id -> { selected, correct }.
  const [quizAnswers, setQuizAnswers] = useState(() => new Map())
  const recordAnswer = (id, answer) => setQuizAnswers((prev) => new Map(prev).set(id, answer))
  const clearAnswers = (ids) =>
    setQuizAnswers((prev) => {
      const next = new Map(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })

  function navigate(next) {
    setView(next)
    window.scrollTo({ top: 0 })
  }

  // Every guide, pasted, uploaded or generated, arrives here already validated.
  function loadGuide(newGuide) {
    setGuide(newGuide)
    setReviewedCards(new Set())
    setQuizAnswers(new Map())
    navigate('guide')
  }

  async function handleGenerate() {
    setGenerateError('')
    setIsGenerating(true)
    generateAbort.current = new AbortController()
    try {
      const data = await generateStudyGuide({
        text: result.fullText,
        fileName: result.fileName,
        signal: generateAbort.current.signal,
      })
      loadGuide(data)
    } catch (err) {
      if (err.name !== 'AbortError') setGenerateError(err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  function fail(message) {
    setError(message)
    setStatus('error')
  }

  async function handleFile(file) {
    if (file.name.toLowerCase().endsWith('.json')) return handleGuideFile(file)

    const validationError = validateFile(file)
    if (validationError) return fail(validationError)

    setFileName(file.name)
    setError('')
    setStatus('parsing')
    try {
      setResult(await parseDocument(file))
      setStatus('idle')
      navigate('notes')
    } catch (err) {
      console.error(err)
      fail(err.message || 'Something went wrong reading that file.')
    }
  }

  // A study guide .json dropped on the home page opens straight into the
  // study views, with no lecture file needed.
  async function handleGuideFile(file) {
    if (file.size > MAX_GUIDE_FILE_SIZE) return fail('That JSON file is too large (the limit is 5 MB).')

    const parsed = parseStudyGuide(await file.text())
    if (!parsed.ok) {
      const problems = parsed.errors.map((e) => `• ${e}`).join('\n')
      return fail(`Couldn’t load ${file.name}:\n${problems}`)
    }
    setFileName(file.name)
    setResult(null)
    setError('')
    setStatus('idle')
    loadGuide(parsed.guide)
  }

  function reset() {
    generateAbort.current?.abort()
    setStatus('idle')
    setResult(null)
    setError('')
    setGuide(null)
    setGenerateError('')
    setJsonDraft('')
    setReviewedCards(new Set())
    setQuizAnswers(new Map())
    navigate('home')
  }

  const moduleTitles = guide?.modules.map((m) => m.title) ?? []
  const isStudyView = guide && ['guide', 'flashcards', 'quiz'].includes(view)

  return (
    <div className="min-h-screen">
      <AppHeader
        view={view}
        onNavigate={navigate}
        onReset={reset}
        fileName={view === 'home' ? '' : fileName}
        hasNotes={Boolean(result)}
        guide={guide}
        counts={{ flashcards: cards.length, quiz: questions.length }}
        progress={{ reviewed: reviewedCards.size, answered: quizAnswers.size }}
      />

      <main className={`mx-auto px-4 pb-24 sm:px-6 ${view === 'home' ? 'max-w-5xl pt-12 sm:pt-20' : 'max-w-5xl pt-8 sm:pt-10'}`}>
        <div key={view} className="animate-page-in">
          {view === 'home' && (
            <Landing onFile={handleFile} status={status} fileName={fileName} error={error} />
          )}

          {view === 'notes' && result && (
            <ExtractedPreview result={result} hasGuide={Boolean(guide)} onViewGuide={() => navigate('guide')}>
              <GuideImport
                draft={jsonDraft}
                onDraftChange={setJsonDraft}
                onLoad={loadGuide}
                source={result}
                hasGuide={Boolean(guide)}
              />
              {AI_GENERATION_ENABLED && (
                <AiGenerate onGenerate={handleGenerate} isGenerating={isGenerating} error={generateError} />
              )}
            </ExtractedPreview>
          )}

          {isStudyView && (
            <div className="space-y-8">
              <GuideHero
                guide={guide}
                fileName={fileName}
                compact={view !== 'guide'}
                counts={{ flashcards: cards.length, quiz: questions.length }}
                onNavigate={navigate}
              />
              {view === 'guide' && <StudyGuide guide={guide} />}
              {view === 'flashcards' && (
                <Flashcards
                  cards={cards}
                  modules={moduleTitles}
                  reviewed={reviewedCards}
                  onReview={markReviewed}
                  onResetProgress={() => setReviewedCards(new Set())}
                />
              )}
              {view === 'quiz' && (
                <Quiz
                  questions={questions}
                  modules={moduleTitles}
                  answers={quizAnswers}
                  onAnswer={recordAnswer}
                  onClearAnswers={clearAnswers}
                />
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
