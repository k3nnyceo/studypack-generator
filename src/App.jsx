import { useRef, useState } from 'react'
import AiGenerate from './components/AiGenerate.jsx'
import ExtractedPreview from './components/ExtractedPreview.jsx'
import GuideImport from './components/GuideImport.jsx'
import StudyGuide from './components/StudyGuide.jsx'
import UploadDropzone from './components/UploadDropzone.jsx'
import { AI_GENERATION_ENABLED } from './config.js'
import { generateStudyGuide } from './lib/generateStudyGuide.js'
import { parseDocument, validateFile } from './lib/parseDocument.js'
import { parseStudyGuide } from './lib/studyGuideFormat.js'

const MAX_GUIDE_FILE_SIZE = 5 * 1024 * 1024

const FEATURES = [
  { title: 'Key concepts', body: 'Pulls out the terms and ideas your lecture actually emphasises.' },
  { title: 'Flashcards', body: 'Turns your notes into cards you can flip through and self-test.' },
  { title: 'Practice quizzes', body: 'Checks your understanding with questions built from the material.' },
]

export default function App() {
  // status: 'idle' | 'parsing' | 'done' | 'error'
  const [status, setStatus] = useState('idle')
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  const [guide, setGuide] = useState(null)
  const [showGuide, setShowGuide] = useState(false)
  const [jsonDraft, setJsonDraft] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const generateAbort = useRef(null)

  // Flashcards reviewed this session; cleared when a new file is uploaded.
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

  // Every guide, pasted or generated, arrives here already validated.
  function loadGuide(newGuide) {
    setGuide(newGuide)
    setReviewedCards(new Set())
    setQuizAnswers(new Map())
    setShowGuide(true)
    window.scrollTo({ top: 0 })
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

  async function handleFile(file) {
    if (file.name.toLowerCase().endsWith('.json')) return handleGuideFile(file)

    const validationError = validateFile(file)
    if (validationError) {
      setError(validationError)
      setStatus('error')
      return
    }

    setFileName(file.name)
    setError('')
    setStatus('parsing')
    try {
      setResult(await parseDocument(file))
      setStatus('done')
    } catch (err) {
      console.error(err)
      setError(err.message || 'Something went wrong reading that file.')
      setStatus('error')
    }
  }

  // A study guide .json dropped on the landing page loads straight into the
  // study views, with no lecture file needed.
  async function handleGuideFile(file) {
    const fail = (message) => {
      setError(message)
      setStatus('error')
    }
    if (file.size > MAX_GUIDE_FILE_SIZE) return fail('That JSON file is too large (the limit is 5 MB).')

    const parsed = parseStudyGuide(await file.text())
    if (!parsed.ok) {
      const problems = parsed.errors.map((e) => `• ${e}`).join('\n')
      return fail(`Couldn’t load ${file.name}:\n${problems}`)
    }
    setFileName(file.name)
    setResult(null)
    setError('')
    setStatus('done')
    loadGuide(parsed.guide)
  }

  function reset() {
    generateAbort.current?.abort()
    setStatus('idle')
    setResult(null)
    setError('')
    setGuide(null)
    setShowGuide(false)
    setGenerateError('')
    setJsonDraft('')
    setReviewedCards(new Set())
    setQuizAnswers(new Map())
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center gap-2 px-4 py-4 sm:px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 font-bold text-white">S</div>
          <span className="text-lg font-bold tracking-tight">StudyPack</span>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        {status === 'done' && guide && showGuide ? (
          <StudyGuide
            guide={guide}
            fileName={fileName}
            onBack={result ? () => setShowGuide(false) : undefined}
            onReset={reset}
            reviewedCards={reviewedCards}
            onReviewCard={markReviewed}
            onResetReviewed={() => setReviewedCards(new Set())}
            quizAnswers={quizAnswers}
            onAnswerQuiz={recordAnswer}
            onClearQuizAnswers={clearAnswers}
          />
        ) : status === 'done' && result ? (
          <ExtractedPreview
            result={result}
            onReset={reset}
            hasGuide={Boolean(guide)}
            onViewGuide={() => setShowGuide(true)}
          >
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
        ) : (
          <>
            <section className="mb-10 text-center">
              <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">
                Lecture notes in.
                <br />
                <span className="text-indigo-600">Study guide out.</span>
              </h1>
              <p className="mx-auto mt-4 max-w-xl text-lg text-slate-600">
                Upload your slides or PDF notes and StudyPack builds an interactive study guide from them. Already
                have a study guide? Drop its .json file below.
              </p>
            </section>

            <UploadDropzone onFile={handleFile} disabled={status === 'parsing'} />

            {status === 'parsing' && (
              <div className="mt-6 flex items-center justify-center gap-3 text-slate-600" role="status">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
                <span>
                  Reading <span className="font-medium text-slate-800">{fileName}</span>…
                </span>
              </div>
            )}

            {status === 'error' && (
              <div className="mt-6 whitespace-pre-line rounded-xl bg-rose-50 p-4 text-sm text-rose-800 ring-1 ring-rose-200" role="alert">
                {error}
              </div>
            )}

            <p className="mt-4 text-center text-xs text-slate-400">
              Your file is processed in your browser and never uploaded to a server.
            </p>

            <section className="mt-16 grid gap-4 sm:grid-cols-3">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <h3 className="font-semibold text-slate-800">{f.title}</h3>
                  <p className="mt-1 text-sm text-slate-500">{f.body}</p>
                </div>
              ))}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
