import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AiGenerate from './components/AiGenerate.jsx'
import AppHeader from './components/AppHeader.jsx'
import ExtractedPreview from './components/ExtractedPreview.jsx'
import Flashcards from './components/Flashcards.jsx'
import GuideHero from './components/GuideHero.jsx'
import GuideImport from './components/GuideImport.jsx'
import Landing from './components/Landing.jsx'
import Library from './components/Library.jsx'
import PackLibrary from './components/PackLibrary.jsx'
import { PastePanel, ScanPanel } from './components/ScanPanel.jsx'
import Plans from './components/Plans.jsx'
import ReferralStats from './components/ReferralStats.jsx'
import Quiz from './components/Quiz.jsx'
import StudyGuide from './components/StudyGuide.jsx'
import Theory from './components/Theory.jsx'
import Toast from './components/Toast.jsx'
import { Disclosure } from './components/ui.jsx'
import { AI_GENERATION_ENABLED, SIGN_IN_ENABLED } from './config.js'
import { useAuth } from './lib/auth.js'
import { takePaymentReturn, useBilling } from './lib/billing.js'
import { captureReferral } from './lib/referral.js'
import { fetchShared, listShared, removeShared, sharePack } from './lib/shared.js'
import { buildFlashcards } from './lib/flashcards.js'
import { generateStudyGuide, getPendingJob, resumePendingJob } from './lib/generateStudyGuide.js'
import { parseDocument, ScannedPdfError, validateFile } from './lib/parseDocument.js'
import { isImageFile, pastedResult, photos, readScan, scannedPdf } from './lib/scanPages.js'
import { buildQuiz } from './lib/quiz.js'
import { clearPendingUpload, markPendingUpload, takeInterruptedUploadMessage } from './lib/pendingUpload.js'
import { takeSharedFile } from './lib/sharedFile.js'
import { parseStudyGuide } from './lib/studyGuideFormat.js'
import { useLibrary } from './lib/useLibrary.js'
import { useCardMemory } from './lib/cardMemory.js'
import { fingerprint } from './lib/library.js'
import { useStreak } from './lib/streak.js'
import { useOnline } from './lib/useOnline.js'
import { WifiOff } from 'lucide-react'

const MAX_GUIDE_FILE_SIZE = 5 * 1024 * 1024

// Read once per page load (outside the component, so StrictMode's double
// render can't consume it before it's shown).
const interruptedUploadMessage = takeInterruptedUploadMessage()
// A study pack that was still being written when the page last closed or
// reloaded (e.g. the phone unloaded it). It's finished on the home page.
const pendingJobAtLoad = AI_GENERATION_ENABLED ? getPendingJob() : null
// A Paystack payment reference, if we've just come back from checkout.
const paymentReturn = takePaymentReturn()
// A share link (?ref=…) this visit came through.
captureReferral()

// Each screen has its own address (#/library, #/plans, …) and history entry,
// so the browser's Back and Forward buttons (and Android's back gesture) move
// between screens. Study screens need a pack in memory, so after a reload
// they fall back to the home page.
const VIEWS = ['home', 'library', 'explore', 'plans', 'stats', 'notes', 'guide', 'flashcards', 'quiz', 'theory']
const NEEDS_PACK = ['notes', 'guide', 'flashcards', 'quiz', 'theory']
const viewFromUrl = () => {
  const view = window.location.hash.replace(/^#\/?/, '')
  return VIEWS.includes(view) ? view : 'home'
}
const urlFor = (view) => (view === 'home' ? window.location.pathname + window.location.search : `#/${view}`)
const initialView = paymentReturn ? 'plans' : NEEDS_PACK.includes(viewFromUrl()) ? 'home' : viewFromUrl()
window.history.replaceState({ view: initialView }, '', urlFor(initialView))

export default function App() {
  // view: 'home' | 'library' | 'explore' | 'plans' | 'stats' | 'notes' | 'guide' | 'flashcards' | 'quiz' | 'theory'
  const [view, setView] = useState(initialView)
  const [status, setStatus] = useState(interruptedUploadMessage ? 'error' : 'idle') // for the home screen: 'idle' | 'parsing' | 'error'
  const [fileName, setFileName] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState(interruptedUploadMessage ?? '')

  const [guide, setGuide] = useState(null)
  const [activeEntryId, setActiveEntryId] = useState(null) // library entry currently open
  const auth = useAuth()
  const library = useLibrary(auth.user, { onSessionExpired: auth.expire })
  const billing = useBilling(auth.user)
  const paymentChecked = useRef(false)
  // The Pack library: { packs, allowance, canModerate } once loaded.
  const [shared, setShared] = useState(null)
  const [sharedBusy, setSharedBusy] = useState(null) // pack id being added/removed
  const [sharedError, setSharedError] = useState(null)
  const ownPrints = useMemo(() => new Set(library.entries.map((e) => e.fingerprint)), [library.entries])
  const sharedPrints = useMemo(() => new Set((shared?.packs ?? []).map((p) => p.fingerprint)), [shared])
  const [toast, setToast] = useState(null)
  const dismissToast = useCallback(() => setToast(null), [])
  const notify = (message, extra = {}) => setToast({ id: Date.now(), message, ...extra })

  useEffect(() => {
    if (auth.error) setToast({ id: Date.now(), message: auth.error, tone: 'error' })
  }, [auth.error])

  // A "sign in to generate" error is stale once they have.
  useEffect(() => {
    if (auth.user) setGenerateError(null)
  }, [auth.user])

  // Back from Paystack: apply the payment once we know who's signed in.
  useEffect(() => {
    if (!paymentReturn || !auth.ready || paymentChecked.current) return
    paymentChecked.current = true
    if (!auth.user) return notify('Sign in with the same Google account to finish your upgrade.', { tone: 'error' })
    billing
      .verify(paymentReturn)
      .then((state) => {
        const name = state.plans.find((p) => p.id === state.plan)?.name
        notify(state.plan === 'free' ? 'Payment received.' : `You’re on ${name}. Thank you!`)
      })
      .catch((err) => notify(err.message, { tone: 'error' }))
    // billing.verify is stable; runs once auth is known.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.ready, auth.user])

  function signOut() {
    auth.signOut()
    library.forgetAccount()
    notify('Signed out. Your synced packs are safe in your account.')
  }
  const [jsonDraft, setJsonDraft] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  // null, or { message, reason?, resetsAt? } (reason/resetsAt for plan limits)
  const [generateError, setGenerateError] = useState(null)
  const generateAbort = useRef(null)
  const [resumingJob, setResumingJob] = useState(pendingJobAtLoad)
  const resumeAbort = useRef(null)

  // Built once per guide, so quiz option order stays put while switching views.
  const cards = useMemo(() => (guide ? buildFlashcards(guide) : []), [guide])
  // Flashcard memory is kept per pack (by its content), plus a daily streak.
  const packKey = useMemo(() => (guide ? fingerprint(guide) : null), [guide])
  const cardMemory = useCardMemory(packKey)
  const streak = useStreak()
  const online = useOnline()
  const questions = useMemo(() => (guide ? buildQuiz(guide) : []), [guide])
  const theoryItems = useMemo(
    () =>
      (guide?.modules ?? []).flatMap((module, m) =>
        (module.theory ?? []).map((t, i) => ({ ...t, id: `m${m}-t${i}`, moduleIndex: m, moduleTitle: module.title })),
      ),
    [guide],
  )

  // Flashcards reviewed this session; cleared when a new guide is loaded.
  const [reviewedCards, setReviewedCards] = useState(() => new Set())
  const markReviewed = (id) => setReviewedCards((prev) => (prev.has(id) ? prev : new Set(prev).add(id)))

  // Quiz answers this session: question id -> { selected, correct }.
  const [quizAnswers, setQuizAnswers] = useState(() => new Map())
  const recordAnswer = (id, answer) => {
    setQuizAnswers((prev) => new Map(prev).set(id, answer))
    streak.studied()
  }
  const clearAnswers = (ids) =>
    setQuizAnswers((prev) => {
      const next = new Map(prev)
      ids.forEach((id) => next.delete(id))
      return next
    })

  function navigate(next) {
    if (next !== view) window.history.pushState({ view: next }, '', urlFor(next))
    setView(next)
    window.scrollTo({ top: 0 })
  }

  // Back and Forward. Read through a ref, since the listener outlives renders.
  const hasPack = useRef({})
  hasPack.current = { notes: Boolean(result), guide: Boolean(guide), flashcards: Boolean(guide), quiz: Boolean(guide), theory: Boolean(guide) }
  useEffect(() => {
    function onPopState(e) {
      let next = VIEWS.includes(e.state?.view) ? e.state.view : viewFromUrl()
      if (NEEDS_PACK.includes(next) && !hasPack.current[next]) {
        next = 'home'
        window.history.replaceState({ view: next }, '', urlFor(next))
      }
      setView(next)
      window.scrollTo({ top: 0 })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

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

  const loadShared = useCallback(() => {
    listShared()
      .then(setShared)
      .catch(() => {}) // the page shows what it has; a retry happens on the next visit
  }, [])

  // Fresh when the Pack library or the Library (for "In the Pack library") is
  // shown, and when the account changes (allowance, "Shared by you").
  useEffect(() => {
    if (view === 'explore' || view === 'library') loadShared()
  }, [view, auth.user?.id, loadShared])

  async function addFromShared(pack) {
    const owned = library.entries.find((e) => e.fingerprint === pack.fingerprint)
    if (owned) return openFromLibrary(owned)
    setSharedBusy(pack.id)
    setSharedError(null)
    try {
      const { entry, allowance } = await fetchShared(pack.id)
      setShared((s) => s && { ...s, allowance })
      setResult(null)
      setFileName('Pack library')
      loadGuide(entry.guide, 'Pack library')
    } catch (err) {
      if (err.status === 401) auth.expire()
      setSharedError({ message: err.message, reason: err.reason, resetsAt: err.resetsAt })
    } finally {
      setSharedBusy(null)
    }
  }

  async function shareToLibrary(entry) {
    try {
      const { alreadyShared } = await sharePack(entry)
      notify(alreadyShared ? 'That pack is already in the Pack library' : 'Shared to the Pack library. Thank you!')
      loadShared()
    } catch (err) {
      notify(err.message, { tone: 'error' })
    }
  }

  async function removeFromShared(pack) {
    setSharedBusy(pack.id)
    try {
      await removeShared(pack.id)
      notify(`Removed “${pack.topic}” from the Pack library`)
      loadShared()
    } catch (err) {
      notify(err.message, { tone: 'error' })
    } finally {
      setSharedBusy(null)
    }
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
    setGenerateError(null)
    setIsGenerating(true)
    generateAbort.current = new AbortController()
    try {
      const { guide: generated } = await generateStudyGuide({
        text: result.fullText,
        fileName: result.fileName,
        signal: generateAbort.current.signal,
      })
      loadGuide(generated, result.fileName)
    } catch (err) {
      if (err.status === 401) auth.expire()
      if (err.name !== 'AbortError') setGenerateError({ message: err.message, reason: err.reason, resetsAt: err.resetsAt })
    } finally {
      setIsGenerating(false)
      billing.refresh()
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

  // Pick up a study pack that was being written before the page reloaded.
  useEffect(() => {
    if (!pendingJobAtLoad || resumeAbort.current) return // the ref guards StrictMode's second run
    resumeAbort.current = new AbortController()
    resumePendingJob(pendingJobAtLoad, { signal: resumeAbort.current.signal })
      .then((resumed) => {
        loadGuide(resumed, pendingJobAtLoad.fileName)
        notify('Your study pack is ready and saved')
      })
      .catch((err) => {
        if (err.name !== 'AbortError') fail(err.message)
      })
      .finally(() => {
        setResumingJob(null)
        billing.refresh()
      })
    // Runs once on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A file shared into the installed app from another app's Share menu.
  useEffect(() => {
    takeSharedFile().then((shared) => {
      if (shared?.file) handleFile(shared.file)
      else if (shared?.error) fail(shared.error)
    })
    // Runs once on load; takeSharedFile clears ?share so it can't repeat.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Scanned or photographed notes, and pasted text (Max): see ScanPanel.
  const [scan, setScan] = useState(null) // { kind, fileName, pageCount, getPage, close }
  const [scanProgress, setScanProgress] = useState(null)
  const [scanError, setScanError] = useState(null)
  const [pasting, setPasting] = useState(false)
  const scanAbort = useRef(null)
  const currentPlan = billing.billing?.plans?.find((p) => p.id === billing.billing?.plan)
  const canScan = auth.user ? (currentPlan ? Boolean(currentPlan.scans) : null) : null
  const canPaste = auth.user ? (currentPlan ? Boolean(currentPlan.paste) : null) : null

  function showScan(next) {
    Promise.resolve()
      .then(() => scan?.close())
      .catch(() => {})
    setPasting(false)
    setScanError(null)
    setError('')
    setStatus('idle')
    setScan(next)
  }

  async function readScanned() {
    scanAbort.current = new AbortController()
    setScanError(null)
    setScanProgress({ done: 0, total: Math.min(scan.pageCount, 40) })
    try {
      const notes = await readScan(scan, { onProgress: setScanProgress, signal: scanAbort.current.signal })
      setScan(null)
      setFileName(notes.fileName)
      setResult(notes)
      navigate('notes')
    } catch (err) {
      if (err.status === 401) auth.expire()
      if (err.name !== 'AbortError') setScanError({ message: err.message, reason: err.reason, resetsAt: err.resetsAt })
    } finally {
      setScanProgress(null)
      billing.refresh()
    }
  }

  function openPasted(text) {
    setPasting(false)
    const notes = pastedResult(text)
    setFileName(notes.fileName)
    setResult(notes)
    navigate('notes')
  }

  async function handleFile(fileOrFiles) {
    const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]
    if (files.every(isImageFile)) return showScan(photos(files))
    if (files.length > 1) return fail('Choose one PDF or PowerPoint file, or several photos of your notes.')
    const file = files[0]
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
      if (err instanceof ScannedPdfError) {
        return scannedPdf(file)
          .then(showScan)
          .catch(() => fail('This PDF is scanned, and it couldn’t be opened for reading.'))
      }
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
    setGenerateError(null)
    setJsonDraft('')
    setReviewedCards(new Set())
    setQuizAnswers(new Map())
    navigate('home')
  }

  const moduleTitles = guide?.modules.map((m) => m.title) ?? []
  const isStudyView = guide && ['guide', 'flashcards', 'quiz', 'theory'].includes(view)

  return (
    <div className="min-h-screen">
      <AppHeader
        view={view}
        onNavigate={navigate}
        onReset={reset}
        hasNotes={Boolean(result)}
        guide={guide}
        counts={{ flashcards: cards.length, quiz: questions.length, theory: theoryItems.length }}
        libraryCount={library.entries.length}
        user={auth.user}
        showSignIn={SIGN_IN_ENABLED && auth.ready}
        onSignOut={signOut}
        billing={billing.billing}
      />

      {!online && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900" role="status">
          <WifiOff className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />
          You’re offline. Your saved packs still work; generating and syncing need internet.
        </div>
      )}

      <main className={`mx-auto px-4 pb-24 sm:px-6 ${view === 'home' ? 'max-w-5xl pt-12 sm:pt-20' : 'max-w-5xl pt-8 sm:pt-10'}`}>
        <div key={view} className="animate-page-in">
          {view === 'home' && (
            <Landing
              onFile={handleFile}
              onTrySample={loadSample}
              onBrowseShared={() => navigate('explore')}
              onPaste={() => {
                showScan(null)
                setPasting(true)
              }}
              panel={
                scan ? (
                  <ScanPanel
                    scan={scan}
                    progress={scanProgress}
                    error={scanError}
                    allowed={canScan}
                    signedIn={Boolean(auth.user)}
                    onRead={readScanned}
                    onCancel={() => scanAbort.current?.abort()}
                    onClose={() => showScan(null)}
                    onOpenPlans={() => navigate('plans')}
                  />
                ) : pasting ? (
                  <PastePanel
                    allowed={canPaste}
                    signedIn={Boolean(auth.user)}
                    onSubmit={openPasted}
                    onClose={() => setPasting(false)}
                    onOpenPlans={() => navigate('plans')}
                  />
                ) : null
              }
              status={status}
              resumingJob={resumingJob}
              onCancelResume={() => resumeAbort.current?.abort()}
              fileName={fileName}
              error={error}
              recent={library.entries.slice(0, 3)}
              libraryCount={library.entries.length}
              onOpenPack={openFromLibrary}
              onDeletePack={deleteFromLibrary}
              onViewLibrary={() => navigate('library')}
            />
          )}

          {view === 'plans' && (
            <Plans
              billing={billing.billing}
              user={auth.user}
              showSignIn={SIGN_IN_ENABLED && auth.ready}
              onError={(message) => notify(message, { tone: 'error' })}
              onRedeemed={(state) => {
                billing.refresh()
                notify(`You’re on ${state.plans.find((p) => p.id === state.plan)?.name}. Thank you!`)
              }}
            />
          )}

          {view === 'explore' && (
            <PackLibrary
              shared={shared}
              user={auth.user}
              showSignIn={SIGN_IN_ENABLED && auth.ready}
              ownPrints={ownPrints}
              busyId={sharedBusy}
              error={sharedError}
              onAdd={addFromShared}
              onRemove={removeFromShared}
              onOpenPlans={() => navigate('plans')}
              canUpgrade={Boolean(billing.billing?.paymentsEnabled) && billing.billing?.plan !== 'max'}
            />
          )}

          {view === 'stats' && auth.user?.isAdmin && <ReferralStats />}

          {view === 'library' && (
            <Library
              entries={library.entries}
              activeId={activeEntryId}
              onOpen={openFromLibrary}
              onDelete={deleteFromLibrary}
              onAddNew={reset}
              user={auth.user}
              showSignIn={SIGN_IN_ENABLED && auth.ready}
              sync={library.sync}
              onSyncNow={library.syncNow}
              onBrowseShared={() => navigate('explore')}
              sharedPrints={sharedPrints}
              onShare={shareToLibrary}
              streak={streak}
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
                    signedIn={Boolean(auth.user)}
                    authReady={auth.ready}
                    billing={billing.billing}
                    onOpenPlans={() => navigate('plans')}
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
                counts={{ flashcards: cards.length, quiz: questions.length, theory: theoryItems.length }}
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
                  memory={cardMemory}
                  streak={streak}
                  onStudied={streak.studied}
                />
              )}
              {view === 'theory' && <Theory items={theoryItems} modules={moduleTitles} onStudied={streak.studied} />}
              {view === 'quiz' && (
                <Quiz
                  questions={questions}
                  modules={moduleTitles}
                  answers={quizAnswers}
                  onAnswer={recordAnswer}
                  onClearAnswers={clearAnswers}
                  onStudied={streak.studied}
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
