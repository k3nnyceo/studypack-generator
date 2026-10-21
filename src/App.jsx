import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AiGenerate from './components/AiGenerate.jsx'
import AppHeader from './components/AppHeader.jsx'
import ExtractedPreview from './components/ExtractedPreview.jsx'
import Flashcards from './components/Flashcards.jsx'
import GuideHero from './components/GuideHero.jsx'
import Landing from './components/Landing.jsx'
import Library from './components/Library.jsx'
import LoadBoundary from './components/LoadBoundary.jsx'
import PackLibrary from './components/PackLibrary.jsx'
import { PastePanel, ScanPanel, YoutubePanel } from './components/ScanPanel.jsx'
import { youtubeNotes } from './lib/youtube.js'
import Plans from './components/Plans.jsx'
import Progress from './components/Progress.jsx'
import ReferralStats from './components/ReferralStats.jsx'
import Quiz from './components/Quiz.jsx'
import StudyGuide from './components/StudyGuide.jsx'
import Theory from './components/Theory.jsx'
import Toast from './components/Toast.jsx'
import { SourceContext } from './lib/sourceContext.js'
import { friendlyError } from './lib/staleBuild.js'
import { AI_GENERATION_ENABLED, SIGN_IN_ENABLED } from './config.js'
import { useAuth } from './lib/auth.js'
import { takePaymentReturn, useBilling } from './lib/billing.js'
import { captureReferral } from './lib/referral.js'
import { fetchShared, listShared, removeShared, sharePack } from './lib/shared.js'
import { buildFlashcards } from './lib/flashcards.js'
import { generateStudyGuide, getPendingJobs, resumePendingJob } from './lib/generateStudyGuide.js'
import { parseDocument, ScannedPdfError, validateFile } from './lib/parseDocument.js'
import { isImageFile, MAX_SCAN_PAGES, pastedResult, photos, readScan, scannedPdf } from './lib/scanPages.js'
import { buildQuiz } from './lib/quiz.js'
import { clearPendingUpload, markPendingUpload, takeInterruptedUploadMessage } from './lib/pendingUpload.js'
import { takeSharedFile } from './lib/sharedFile.js'
import { validateStudyGuide } from './lib/studyGuideFormat.js'
import { useLibrary } from './lib/useLibrary.js'
import { useCardMemory } from './lib/cardMemory.js'
import { practiceQuestions, topicInsights } from './lib/insights.js'
import { useQuizResults } from './lib/quizResults.js'
import { fingerprint } from './lib/library.js'
import { useStreak } from './lib/streak.js'
import { loadSource, restoreSource, saveSource, sourceFromResult, takeSource } from './lib/sourceStore.js'
import { splitIntoParts } from './lib/splitNotes.js'
import { prepareDiagramPages, useDiagramPages } from './lib/useDiagramPages.js'
import { useOnline } from './lib/useOnline.js'
import { MessageCircleQuestion, WifiOff } from 'lucide-react'

// The source viewer (pdf.js, KaTeX, JSZip) loads the first time it's opened.
const SourceSheet = lazy(() => import('./components/source/SourceSheet.jsx'))
// "Ask about this pack" loads the first time it's opened.
const AskPanel = lazy(() => import('./components/AskPanel.jsx'))

// How many parts of a long lecture are written at the same time when they're
// all made at once. Each part is several Claude calls, so more would risk
// Bedrock's rate limits.
const PARALLEL_PARTS = 2

// Read once per page load (outside the component, so StrictMode's double
// render can't consume it before it's shown).
const interruptedUploadMessage = takeInterruptedUploadMessage()
// Study packs that were still being written when the page last closed or
// reloaded (e.g. the phone unloaded it), possibly several parts of a long
// lecture. They're finished on the home page.
const pendingJobsAtLoad = AI_GENERATION_ENABLED ? getPendingJobs() : []
// A Paystack payment reference, if we've just come back from checkout.
const paymentReturn = takePaymentReturn()
// A share link (?ref=…) this visit came through.
captureReferral()

// Each screen has its own address (#/library, #/plans, …) and history entry,
// so the browser's Back and Forward buttons (and Android's back gesture) move
// between screens. Study screens need a pack in memory, so after a reload
// they fall back to the home page.
const VIEWS = ['home', 'library', 'explore', 'plans', 'stats', 'notes', 'guide', 'flashcards', 'quiz', 'theory', 'progress']
const NEEDS_PACK = ['notes', 'guide', 'flashcards', 'quiz', 'theory', 'progress']
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
  const [isGenerating, setIsGenerating] = useState(false)
  // null, or { message, reason?, resetsAt? } (reason/resetsAt for plan limits)
  const [generateError, setGenerateError] = useState(null)
  const generateAbort = useRef(null)
  // Diagram pages in the notes (found on the device), and how many the plan
  // lets Claude see as pictures; the student can switch them off.
  const diagramPages = useDiagramPages(result)
  const currentPlan = billing.billing?.plans?.find((p) => p.id === billing.billing?.plan)
  const diagramLimit = auth.user ? (currentPlan?.diagramPages ?? 0) : 0
  const [sendDiagrams, setSendDiagrams] = useState(true)
  // Notes too long for one pack on this plan are split into parts, each its
  // own pack (src/lib/splitNotes.js). doneParts: part numbers already made
  // from these notes, so the student can see what's left.
  const maxChars = auth.user ? currentPlan?.maxChars : null
  const parts = useMemo(
    () => (result && maxChars && result.fullText.length > maxChars ? splitIntoParts(result.fullText, maxChars) : null),
    [result, maxChars],
  )
  const [doneParts, setDoneParts] = useState({ result: null, numbers: new Set() })
  const [generatingPart, setGeneratingPart] = useState(null)
  const partSuffix = (part) => ` (Part ${part.number} of ${parts.length})`
  const markPartDone = (forResult, number) =>
    setDoneParts((done) => ({ result: forResult, numbers: new Set(done.result === forResult ? done.numbers : []).add(number) }))
  // Making every part at once (generateAllParts): null, or { result, running,
  // statuses: { [part number]: { state, message?, resetsAt? } } } with state
  // 'queued' | 'writing' | 'done' | 'failed' | 'waiting' (for the allowance).
  const [batch, setBatch] = useState(null)
  const batchAbort = useRef(null)
  // { fileName, count } while packs from before a reload are being finished.
  const [resumingJob, setResumingJob] = useState(
    pendingJobsAtLoad.length ? { fileName: pendingJobsAtLoad[0].fileName, count: pendingJobsAtLoad.length } : null,
  )
  const resumeAbort = useRef(null)

  // Built once per guide, so quiz option order stays put while switching views.
  const cards = useMemo(() => (guide ? buildFlashcards(guide) : []), [guide])
  // Flashcard memory is kept per pack (by its content), plus a daily streak.
  const packKey = useMemo(() => (guide ? fingerprint(guide) : null), [guide])
  const cardMemory = useCardMemory(packKey)
  const streak = useStreak()
  const online = useOnline()
  const [askOpen, setAskOpen] = useState(false)
  const questions = useMemo(() => (guide ? buildQuiz(guide) : []), [guide])
  // Answers kept across visits, for weak topics on Progress.
  const quizResults = useQuizResults(packKey)
  const insight = useMemo(
    () =>
      guide && topicInsights({ modules: guide.modules, questions, cards, results: quizResults.results, cardRecords: cardMemory.records }),
    [guide, questions, cards, quizResults.results, cardMemory.records],
  )
  // Requests from Progress: a quiz round on one topic, flashcards on one
  // topic, or a question for the chat. Each carries a nonce so repeats count.
  const [practice, setPractice] = useState(null)
  const [cardFocus, setCardFocus] = useState(null)
  const [askPrefill, setAskPrefill] = useState(null)

  // The lecture behind the open pack, for the source viewer: linked when the
  // pack is made from notes, or read back from this device (src/lib/sourceStore.js).
  const [packSource, setPackSource] = useState(null) // { key, fileName, type, sections, file?, photos? }
  const guideSource = packSource && packSource.key === packKey ? packSource : null
  const notesSource = useMemo(() => sourceFromResult(result), [result])
  useEffect(() => {
    if (!packKey || packSource?.key === packKey) return
    let alive = true
    loadSource(packKey).then((record) => alive && record && setPackSource({ ...record, key: packKey }))
    return () => {
      alive = false
    }
    // Only a new pack needs a lookup; packSource is read to skip one already linked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [packKey])

  // The source viewer: null, or { source, target: { refs, nonce } }.
  const [viewer, setViewer] = useState(null)
  const openViewer = useCallback((source, refs = []) => {
    if (source) setViewer({ source, target: { refs, nonce: Date.now() } })
  }, [])
  const sourceContext = useMemo(
    () => ({ source: guideSource, open: (refs) => openViewer(guideSource, refs) }),
    [guideSource, openViewer],
  )
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
    quizResults.record([{ id, correct: answer.correct }])
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

  // Back and Forward. Read through refs, since the listener outlives renders.
  const viewRef = useRef(view)
  viewRef.current = view
  const hasPack = useRef({})
  hasPack.current = { notes: Boolean(result), guide: Boolean(guide), flashcards: Boolean(guide), quiz: Boolean(guide), theory: Boolean(guide), progress: Boolean(guide) }
  useEffect(() => {
    function onPopState(e) {
      let next = VIEWS.includes(e.state?.view) ? e.state.view : viewFromUrl()
      if (NEEDS_PACK.includes(next) && !hasPack.current[next]) {
        next = 'home'
        window.history.replaceState({ view: next }, '', urlFor(next))
      }
      // Closing the source viewer steps back within the same screen.
      if (next === viewRef.current) return
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
  // validated, and is saved to the library before it's shown. `notes` is the
  // lecture it was made from, kept on this device for the source viewer.
  // Saves a pack to the library, with the lecture it was made from (kept on
  // this device for the source viewer). Returns library.add's result.
  function saveToLibrary(newGuide, sourceName, notes = null) {
    const saved = library.add(newGuide, sourceName)
    const source = sourceFromResult(notes)
    if (source) saveSource(fingerprint(newGuide), source)
    return saved
  }

  function loadGuide(newGuide, sourceName = fileName, notes = null) {
    const saved = saveToLibrary(newGuide, sourceName, notes)
    const source = sourceFromResult(notes)
    if (source) setPackSource({ ...source, key: fingerprint(newGuide) })
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
    // Its lecture file goes too, but is held until Undo is no longer offered.
    const lecture = takeSource(fingerprint(entry.guide))
    notify(`Deleted “${entry.topic}”`, {
      action: {
        label: 'Undo',
        onClick: () => {
          const error = library.restore(removed.entry, removed.index)
          if (error) notify(error, { tone: 'error' })
          else lecture.then(restoreSource)
        },
      },
    })
  }

  // Makes every part not made yet, PARALLEL_PARTS at a time, saving each to
  // the library as it's ready (without opening it). If the plan's allowance
  // runs out, the parts left wait for it to refill instead of failing.
  async function generateAllParts() {
    const forResult = result
    const made = doneParts.result === forResult ? doneParts.numbers : new Set()
    const todo = parts.filter((p) => !made.has(p.number))
    if (!todo.length) return
    const controller = new AbortController()
    batchAbort.current = controller
    const update = (number, status) =>
      setBatch((b) => (b?.result === forResult ? { ...b, statuses: { ...b.statuses, [number]: status } } : b))
    setGenerateError(null)
    setBatch({ result: forResult, running: true, statuses: Object.fromEntries(todo.map((p) => [p.number, { state: 'queued' }])) })

    const queue = [...todo]
    let allowanceOut = null // { message, resetsAt } once the plan's allowance runs out
    let saved = 0
    // One part's pictures are rendered at a time: each render opens the whole
    // file, and phones run out of memory quickly.
    let rendering = Promise.resolve()
    const worker = async () => {
      for (let part = queue.shift(); part; part = queue.shift()) {
        if (controller.signal.aborted) return
        if (allowanceOut) {
          update(part.number, { state: 'waiting', ...allowanceOut })
          continue
        }
        update(part.number, { state: 'writing' })
        try {
          const inPart = part.from ? diagramPages?.filter((p) => p.ref >= part.from && p.ref <= part.to) : diagramPages
          const images = sendDiagrams
            ? await (rendering = rendering
                .catch(() => {})
                .then(() => prepareDiagramPages(forResult, inPart, diagramLimit, { signal: controller.signal })))
            : []
          const { guide: generated } = await generateStudyGuide({
            text: part.text,
            fileName: forResult.fileName,
            images,
            titleSuffix: partSuffix(part),
            signal: controller.signal,
          })
          saveToLibrary(generated, forResult.fileName, forResult)
          saved++
          markPartDone(forResult, part.number)
          update(part.number, { state: 'done' })
        } catch (err) {
          if (err.name === 'AbortError') return update(part.number, { state: 'queued' })
          if (err.status === 401) auth.expire()
          if (err.reason && err.reason !== 'too-long') {
            allowanceOut = { message: err.message, resetsAt: err.resetsAt }
            update(part.number, { state: 'waiting', ...allowanceOut })
          } else update(part.number, { state: 'failed', message: err.message })
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(PARALLEL_PARTS, todo.length) }, worker))
    batchAbort.current = null
    billing.refresh()
    if (controller.signal.aborted) return setBatch(null)
    setBatch((b) => (b?.result === forResult ? { ...b, running: false } : b))
    if (saved) notify(`${saved} of ${todo.length} parts made and saved to your library`)
    else notify('No parts were made', { tone: 'error' })
  }

  // `part` (from `parts`) makes a pack from that part of the notes only.
  async function handleGenerate(part = null) {
    setGenerateError(null)
    setIsGenerating(true)
    setGeneratingPart(part?.number ?? null)
    generateAbort.current = new AbortController()
    try {
      const signal = generateAbort.current.signal
      // A part's own diagram pages only; their numbers stay the whole file's.
      const inPart = part?.from ? diagramPages?.filter((p) => p.ref >= part.from && p.ref <= part.to) : diagramPages
      const images = sendDiagrams ? await prepareDiagramPages(result, inPart, diagramLimit, { signal }) : []
      const { guide: generated } = await generateStudyGuide({
        text: part?.text ?? result.fullText,
        fileName: result.fileName,
        images,
        titleSuffix: part ? partSuffix(part) : '',
        signal,
      })
      if (part) markPartDone(result, part.number)
      loadGuide(generated, result.fileName, result)
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
    const parsed = validateStudyGuide(sample)
    if (!parsed.ok) return fail('The sample study pack couldn’t be loaded.')
    setFileName('Sample study pack')
    setResult(null)
    setError('')
    setStatus('idle')
    loadGuide(parsed.guide, 'Sample study pack')
  }

  // Pick up study packs that were being written before the page reloaded.
  // One opens when it's ready; several (a long lecture's parts) are saved to
  // the library.
  useEffect(() => {
    if (!pendingJobsAtLoad.length || resumeAbort.current) return // the ref guards StrictMode's second run
    resumeAbort.current = new AbortController()
    const single = pendingJobsAtLoad.length === 1
    let saved = 0
    let failure = null
    Promise.all(
      pendingJobsAtLoad.map((job) =>
        resumePendingJob(job, { signal: resumeAbort.current.signal })
          .then((resumed) => {
            if (single) {
              loadGuide(resumed, job.fileName)
              notify('Your study pack is ready and saved')
            } else if (!saveToLibrary(resumed, job.fileName).error) saved++
          })
          .catch((err) => {
            if (err.name !== 'AbortError') failure ??= err
          }),
      ),
    ).finally(() => {
      if (!single && saved) notify(`${saved} study pack${saved === 1 ? '' : 's'} finished and saved to your library`)
      if (failure && (single || !saved)) fail(failure.message)
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
  const [youtube, setYoutube] = useState(null) // null, or { busy, error } while the YouTube panel is open
  const scanAbort = useRef(null)
  const canScan = auth.user ? (currentPlan ? Boolean(currentPlan.scans) : null) : null
  // Scanned pages read per pack: Pro 10, Max 40.
  const scanPageLimit = currentPlan?.scanPages || MAX_SCAN_PAGES
  const canPaste = auth.user ? (currentPlan ? Boolean(currentPlan.paste) : null) : null

  function showScan(next) {
    Promise.resolve()
      .then(() => scan?.close())
      .catch(() => {})
    setPasting(false)
    setYoutube(null)
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
      const notes = await readScan(scan, {
        pageCount: Math.min(scan.pageCount, scanPageLimit),
        onProgress: setScanProgress,
        signal: scanAbort.current.signal,
      })
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

  async function openYoutube(url) {
    setYoutube({ busy: true, error: null })
    try {
      const notes = await youtubeNotes(url)
      setYoutube(null)
      setFileName(notes.fileName)
      setResult(notes)
      navigate('notes')
    } catch (err) {
      if (err.status === 401) auth.expire()
      setYoutube({ busy: false, error: { message: err.message, reason: err.reason, resetsAt: err.resetsAt } })
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
      fail(friendlyError(err, 'Something went wrong reading that file.'))
    } finally {
      clearPendingUpload()
    }
  }


  function reset() {
    generateAbort.current?.abort()
    batchAbort.current?.abort()
    setStatus('idle')
    setResult(null)
    setError('')
    setGuide(null)
    setActiveEntryId(null)
    setGenerateError(null)
    setReviewedCards(new Set())
    setQuizAnswers(new Map())
    setPackSource(null)
    navigate('home')
  }

  const moduleTitles = guide?.modules.map((m) => m.title) ?? []
  const isStudyView = guide && ['guide', 'flashcards', 'quiz', 'theory', 'progress'].includes(view)

  function practiseTopic(moduleIndex) {
    const ids = practiceQuestions(questions, moduleIndex, quizResults.results).map((q) => q.id)
    // A fresh go at each question.
    clearAnswers(ids)
    setPractice({ moduleIndex, ids, title: guide.modules[moduleIndex]?.title, nonce: Date.now() })
    navigate('quiz')
  }
  function reviewTopicCards(moduleIndex) {
    setCardFocus({ moduleIndex, nonce: Date.now() })
    navigate('flashcards')
  }
  function askAboutTopic(module) {
    setAskPrefill({
      text: `I keep getting “${module.title}” wrong. Explain it simply, then ask me one quick question to check I understand.`,
      nonce: Date.now(),
    })
    setAskOpen(true)
  }

  return (
    <div className="min-h-screen">
      <AppHeader
        view={view}
        onNavigate={navigate}
        onReset={reset}
        hasNotes={Boolean(result)}
        guide={guide}
        counts={{ flashcards: cards.length, quiz: questions.length, theory: theoryItems.length, weak: insight?.weak ?? 0 }}
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
              onYoutube={() => {
                showScan(null)
                setYoutube({ busy: false, error: null })
              }}
              panel={
                scan ? (
                  <ScanPanel
                    scan={scan}
                    progress={scanProgress}
                    error={scanError}
                    allowed={canScan}
                    maxPages={scanPageLimit}
                    signedIn={Boolean(auth.user)}
                    onRead={readScanned}
                    onCancel={() => scanAbort.current?.abort()}
                    onClose={() => showScan(null)}
                    onOpenPlans={() => navigate('plans')}
                  />
                ) : youtube ? (
                  <YoutubePanel
                    signedIn={Boolean(auth.user)}
                    limits={currentPlan && { perWindow: currentPlan.youtubePerWindow, perMonth: currentPlan.youtubePerMonth }}
                    busy={youtube.busy}
                    error={youtube.error}
                    onSubmit={openYoutube}
                    onClose={() => setYoutube(null)}
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
            <ExtractedPreview
              result={result}
              hasGuide={Boolean(guide)}
              onViewGuide={() => navigate('guide')}
              onOpenSource={(refs) => openViewer(notesSource, refs)}
            >
              {AI_GENERATION_ENABLED ? (
                <AiGenerate
                  onGenerate={() => handleGenerate()}
                  split={parts && {
                    parts,
                    unit: result.type === 'pptx' ? 'Slides' : 'Pages',
                    done: doneParts.result === result ? doneParts.numbers : new Set(),
                    generating: generatingPart,
                    onGenerate: handleGenerate,
                    batch: batch?.result === result ? batch : null,
                    // Making every part at once is for paid plans (batchParts).
                    onGenerateAll: currentPlan?.batchParts ? generateAllParts : null,
                    onOpenPlans: billing.billing?.paymentsEnabled ? () => navigate('plans') : null,
                    onCancelAll: () => batchAbort.current?.abort(),
                    onOpenLibrary: () => navigate('library'),
                  }}
                  onCancel={() => generateAbort.current?.abort()}
                  isGenerating={isGenerating}
                  error={generateError}
                  signedIn={Boolean(auth.user)}
                  authReady={auth.ready}
                  billing={billing.billing}
                  onOpenPlans={() => navigate('plans')}
                  diagrams={{
                    pages: diagramPages,
                    limit: diagramLimit,
                    unit: result.type === 'pptx' ? 'slide' : 'page',
                    send: sendDiagrams,
                    onToggle: setSendDiagrams,
                  }}
                />
              ) : (
                <p className="card p-6 text-sm text-stone-600">Generating study packs is turned off on this server.</p>
              )}
            </ExtractedPreview>
          )}

          {isStudyView && (
            <SourceContext value={sourceContext}>
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
                  focus={cardFocus}
                  onFocused={() => setCardFocus(null)}
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
                  practice={practice}
                  onPracticeStarted={() => setPractice(null)}
                  onExamResults={quizResults.record}
                />
              )}
              {view === 'progress' && (
                <Progress
                  insight={insight}
                  canAsk={AI_GENERATION_ENABLED}
                  onPractise={practiseTopic}
                  onReviewCards={reviewTopicCards}
                  onAsk={askAboutTopic}
                />
              )}
            </div>
            </SourceContext>
          )}
        </div>
      </main>

      {isStudyView &&
        AI_GENERATION_ENABLED &&
        (askOpen ? (
          <LoadBoundary onClose={() => setAskOpen(false)}>
            <Suspense fallback={null}>
              <AskPanel
                key={packKey}
                guide={guide}
                source={guideSource}
                packKey={packKey}
                initialQuestion={askPrefill}
                signedIn={Boolean(auth.user)}
                authReady={auth.ready}
                online={online}
                canUpgrade={Boolean(billing.billing?.paymentsEnabled) && billing.billing?.plan !== 'max'}
                onOpenSource={(refs) => openViewer(guideSource, refs)}
                onOpenPlans={() => {
                  setAskOpen(false)
                  navigate('plans')
                }}
                onClose={() => setAskOpen(false)}
              />
            </Suspense>
          </LoadBoundary>
        ) : (
          <button
            type="button"
            onClick={() => setAskOpen(true)}
            className="fixed right-4 bottom-4 z-30 inline-flex items-center gap-2 rounded-full bg-brand-600 py-3 pr-5 pl-4 text-sm font-semibold text-white shadow-elevated ring-4 ring-white/70 transition hover:bg-brand-700 active:scale-95 sm:right-6 sm:bottom-6"
          >
            <MessageCircleQuestion className="size-5" strokeWidth={2.25} aria-hidden />
            Ask about this pack
          </button>
        ))}

      {viewer && (
        <LoadBoundary key={viewer.target.nonce} onClose={() => setViewer(null)}>
          <Suspense fallback={null}>
            <SourceSheet source={viewer.source} target={viewer.target} onClose={() => setViewer(null)} />
          </Suspense>
        </LoadBoundary>
      )}

      <Toast toast={toast} onDismiss={dismissToast} />
    </div>
  )
}
