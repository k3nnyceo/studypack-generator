import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AiGenerate from './components/AiGenerate.jsx'
import AppHeader from './components/AppHeader.jsx'
import ExtractedPreview from './components/ExtractedPreview.jsx'
import Flashcards from './components/Flashcards.jsx'
import GuideHero from './components/GuideHero.jsx'
import GuideImport from './components/GuideImport.jsx'
import Landing from './components/Landing.jsx'
import Library from './components/Library.jsx'
import Quiz from './components/Quiz.jsx'
import StudyGuide from './components/StudyGuide.jsx'
import Toast from './components/Toast.jsx'
import { Disclosure } from './components/ui.jsx'
import { AI_GENERATION_ENABLED } from './config.js'
import { buildFlashcards } from './lib/flashcards.js'
import { generateStudyGuide } from './lib/generateStudyGuide.js'
import { parseDocument, validateFile } from './lib/parseDocument.js'
import { buildQuiz } from './lib/quiz.js'
import { clearPendingUpload, markPendingUpload, takeInterruptedUploadMessage } from './lib/pendingUpload.js'
import { takeSharedFile } from './lib/sharedFile.js'
import { parseStudyGuide } from './lib/studyGuideFormat.js'
import { useLibrary } from './lib/useLibrary.js'

const MAX_GUIDE_FILE_SIZE = 5 * 1024 * 1024

// Read once per page load (outside the component, so StrictMode's double
// render can't consume it before it's shown).
const interruptedUploadMessage = takeInterruptedUploadMessage()

export default function App() {
  // view: 'home' | 'library' | 'notes' | 'guide' | 'flashcards' | 'quiz'
  const [view, setView] = useState('home')
  const [status, setStatus] = useState(interruptedUploadMessage ? 'error' : 'idle') // for the home screen: 'idle' | 'parsing' | 'error'
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(interruptedUploadMessage ?? '')

  const [guide, setGuide] = useState(null)
  const [activeEntryId, setActiveEntryId] = useState(null) // library entry currently open
  const library = useLibrary()
  const [toast, setToast] = useState(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const notify = (message, extra = {}) => setToast({ id: Date.now(), message, ...extra })
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

  // Shows a guide in the study views, starting a fresh session.
  function openGuide(newGuide, entryId) {
    setGuide(newGuide)
    setActiveEntryId(entryId)
    setReviewedCards(new Set())
    setQuizAnswers(new Map())
    navigate('guide')
  }

  // Every guide that's pasted, uploaded or generated arrives here already
  // validated, and is saved to the library before it's shown.
  function loadGuide(newGuide, sourceName = fileName) {
    const saved = library.add(newGuide, sourceName)
    if (saved.error) notify(`Opened, but not saved: ${saved.error}`, { tone: 'error' })
    else if (saved.duplicate) notify('Already in your library, so it wasn’t saved again')
    else notify('Saved to your library')
    openGuide(newGuide, saved.entry?.id ?? null)
  }

  function openFromLibrary(entry) {
    setResult(null) // lecture notes from an earlier upload don't belong to this pack
    setFileName(entry.sourceName || entry.course)
    openGuide(entry.guide, entry.id)
  }

  function deleteFromLibrary(entry) {
    const removed = library.remove(entry.id)
    if (!removed) return
    if (removed.error) return notify(removed.error, { tone: 'error' })
    if (entry.id === activeEntryId) setActiveEntryId(null)
    notify(`Deleted “${entry.topic}”`, {
      action: {
        label: 'Undo',
        onClick: () => {
          const error = library.restore(removed.entry, removed.index)
          if (error) notify(error, { tone: 'error' })
        },
      },
    })
  }

  async function handleGenerate() {
    setGenerateError('')
    setIsGenerating(true)
    generateAbort.current = new AbortController()
    try {
      const { guide: generated, remaining } = await generateStudyGuide({
        text: result.fullText,
        fileName: result.fileName,
        signal: generateAbort.current.signal,
      })
      loadGuide(generated, result.fileName)
      if (remaining !== null) {
        notify(`Study pack ready and saved · ${remaining} free generation${remaining === 1 ? '' : 's'} left today`)
      }
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

  // The bundled sample, so first-time visitors can try every study view
  // without making a study guide first. Loaded on demand to keep the home page light.
  async function loadSample() {
    const { default: sample } = await import('./samples/strength-of-materials.json')
    const parsed = parseStudyGuide(JSON.stringify(sample))
    if (!parsed.ok) return fail('The sample study pack couldn’t be loaded.')
    setFileName('Sample study pack')
    setResult(null)
    setError('')
    setStatus('idle')
    loadGuide(parsed.guide, 'Sample study pack')
  }

  // A file shared into the installed app from another app's Share menu.
  useEffect(() => {
    takeSharedFile().then((shared) => {
      if (shared?.file) handleFile(shared.file)
      else if (shared?.error) fail(shared.error)
    })
    // Runs once on load; takeSharedFile clears ?share so it can't repeat.
  }, [])

  async function handleFile(file) {
    if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') return handleGuideFile(file)

    const validationError = validateFile(file)
    if (validationError) return fail(validationError)

    setFileName(file.name)
    setError('')
    setStatus('parsing')
    markPendingUpload('reading')
    try {
      setResult(await parseDocument(file))
      setStatus('idle')
      navigate('notes')
    } catch (err) {
      console.error(err)
      fail(err.message || 'Something went wrong reading that file.')
    } finally {
      clearPendingUpload()
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
    loadGuide(parsed.guide, file.name)
  }

  function reset() {
    generateAbort.current?.abort()
    setStatus('idle')
    setResult(null)
    setError('')
    setGuide(null)
    setActiveEntryId(null)
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
        hasNotes={Boolean(result)}
        guide={guide}
        counts={{ flashcards: cards.length, quiz: questions.length }}
        libraryCount={library.entries.length}
      />

      <main className={`mx-auto px-4 pb-24 sm:px-6 ${view === 'home' ? 'max-w-5xl pt-12 sm:pt-20' : 'max-w-5xl pt-8 sm:pt-10'}`}>
        <div key={view} className="animate-page-in">
          {view === 'home' && (
            <Landing
              onFile={handleFile}
              onTrySample={loadSample}
              status={status}
              fileName={fileName}
              error={error}
              recent={library.entries.slice(0, 3)}
              libraryCount={library.entries.length}
              onOpenPack={openFromLibrary}
              onDeletePack={deleteFromLibrary}
              onViewLibrary={() => navigate('library')}
            />
          )}

          {view === 'library' && (
            <Library
              entries={library.entries}
              activeId={activeEntryId}
              onOpen={openFromLibrary}
              onDelete={deleteFromLibrary}
              onAddNew={reset}
            />
          )}

          {view === 'notes' && result && (
            <ExtractedPreview result={result} hasGuide={Boolean(guide)} onViewGuide={() => navigate('guide')}>
              {AI_GENERATION_ENABLED ? (
                <>
                  <AiGenerate
                    onGenerate={handleGenerate}
                    onCancel={() => generateAbort.current?.abort()}
                    isGenerating={isGenerating}
                    error={generateError}
                  />
                  <Disclosure summary="Already have a study guide JSON? Paste or upload it instead">
                    <GuideImport
                      draft={jsonDraft}
                      onDraftChange={setJsonDraft}
                      onLoad={(g) => loadGuide(g, result.fileName)}
                      source={result}
                    />
                  </Disclosure>
                </>
              ) : (
                <GuideImport
                  draft={jsonDraft}
                  onDraftChange={setJsonDraft}
                  onLoad={(g) => loadGuide(g, result.fileName)}
                  source={result}
                />
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

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
