import { ArrowUp, BookOpenText, MessageCircleQuestion, Sparkles, Square, Trash2, X } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { askAboutPack } from '../lib/ask.js'
import { buildAskContext } from '../lib/askContext.js'
import { formatResetTime } from '../lib/billing.js'
import { unitOf } from '../lib/sourceRefs.js'
import GoogleButton from './GoogleButton.jsx'
import { Rich } from './source/Blocks.jsx'
import { Button } from './ui.jsx'

const MAX_SAVED = 30
const storageKey = (packKey) => `studypack.ask.v1.${packKey}`

// "Ask about this pack": a chat about the open pack's lecture (server/ask.js).
// Answers come from the lecture's notes on this device and cite their pages,
// which open in the source viewer; without the notes, from the pack itself.
// A side panel on wide screens, a bottom sheet on phones. The conversation
// is kept per pack on this device.
export default function AskPanel({ guide, source, packKey, signedIn, authReady, online, canUpgrade, onOpenSource, onOpenPlans, onClose }) {
  const [messages, setMessages] = useState(() => load(packKey))
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const abort = useRef(null)
  const list = useRef(null)
  const input = useRef(null)

  useEffect(() => save(packKey, messages), [packKey, messages])
  useEffect(() => input.current?.focus({ preventScroll: true }), [])
  useEffect(() => () => abort.current?.abort(), [])
  // Follow the answer as it's written.
  useEffect(() => {
    const el = list.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])
  // Escape closes the chat, unless the source viewer is open on top of it.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.querySelector('[role=dialog][aria-label^="Source:"]')) onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function send(text) {
    const question = text.trim()
    if (!question || busy) return
    const history = messages.filter((m) => !m.error && m.text).map(({ role, text }) => ({ role, text }))
    const built = buildAskContext({ source, guide, question, history })
    setDraft('')
    setBusy(true)
    setMessages((m) => [...m, { role: 'user', text: question }, { role: 'assistant', text: '', pending: true }])
    const update = (fn) => setMessages((m) => [...m.slice(0, -1), fn(m.at(-1))])
    abort.current = new AbortController()
    try {
      await askAboutPack({
        question,
        history,
        context: built.context,
        kind: built.kind,
        title: guide.title,
        signal: abort.current.signal,
        onText: (piece) => update((last) => ({ ...last, text: last.text + piece })),
      })
      update((last) => ({ role: 'assistant', text: last.text }))
    } catch (err) {
      if (err.name === 'AbortError') update((last) => ({ role: 'assistant', text: last.text || '(Stopped.)' }))
      else update((last) => ({ role: 'assistant', text: last.text, error: { message: err.message, reason: err.reason, resetsAt: err.resetsAt } }))
    } finally {
      setBusy(false)
      abort.current = null
      input.current?.focus({ preventScroll: true })
    }
  }

  const suggestions = [
    `Explain “${guide.modules[0]?.title}” simply`,
    'What’s most likely to come up in the exam?',
    `Quiz me on ${guide.modules[1]?.title ?? guide.modules[0]?.title}`,
    'Help me remember the key terms',
  ]
  const fromNotes = Boolean(source?.sections?.length)

  return (
    <aside
      role="dialog"
      aria-label="Ask about this pack"
      className="animate-sheet-up fixed inset-x-0 bottom-0 z-40 flex h-[82dvh] flex-col overflow-hidden rounded-t-3xl bg-white shadow-elevated ring-1 ring-stone-200 lg:inset-y-0 lg:right-0 lg:left-auto lg:h-auto lg:w-[26rem] lg:rounded-none lg:rounded-l-3xl"
    >
      <header className="flex shrink-0 items-center gap-3 border-b border-stone-100 px-4 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <MessageCircleQuestion className="size-5" strokeWidth={2.25} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-900">Ask about this pack</p>
          <p className="truncate text-xs text-stone-500">{guide.title}</p>
        </div>
        {messages.length > 0 && !busy && (
          <button
            type="button"
            onClick={() => setMessages([])}
            className="flex size-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
            aria-label="Clear chat"
            title="Clear chat"
          >
            <Trash2 className="size-4" strokeWidth={2.25} aria-hidden />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="flex size-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 hover:text-stone-800"
          aria-label="Close chat"
        >
          <X className="size-5" strokeWidth={2.25} aria-hidden />
        </button>
      </header>

      <div ref={list} className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
        {messages.length === 0 && (
          <div className="space-y-4">
            <p className="text-sm leading-relaxed text-stone-600">
              Ask anything about this lecture: a point you didn’t get, a worked example, what to revise.{' '}
              {fromNotes
                ? `Answers come from your ${unitOf(source).toLowerCase()}s, with links to the exact ${unitOf(source).toLowerCase()}.`
                : 'This pack’s lecture isn’t on this device, so answers come from the pack itself.'}
            </p>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  disabled={!signedIn || !online}
                  onClick={() => send(s)}
                  className="rounded-full bg-brand-50 px-3 py-1.5 text-left text-sm font-medium text-brand-800 ring-1 ring-brand-100 transition hover:bg-brand-100 disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-brand-600 px-3.5 py-2 text-sm whitespace-pre-wrap text-white">
              {m.text}
            </p>
          ) : (
            <div key={i} className="max-w-[95%] text-sm leading-relaxed text-stone-800">
              {m.text ? <AnswerText text={m.text} source={source} onOpenSource={onOpenSource} /> : m.pending && <Thinking />}
              {m.error && (
                <div className="mt-2 rounded-xl bg-amber-50 p-3 text-amber-900 ring-1 ring-amber-200" role="alert">
                  <p>
                    {m.error.message}
                    {m.error.resetsAt && ` It refills at ${formatResetTime(m.error.resetsAt)}.`}
                  </p>
                  {m.error.reason && canUpgrade && (
                    <Button size="sm" variant="primary" icon={Sparkles} onClick={onOpenPlans} className="mt-2">
                      See plans
                    </Button>
                  )}
                </div>
              )}
            </div>
          ),
        )}
      </div>

      <div className="shrink-0 border-t border-stone-100 p-3">
        {!signedIn ? (
          <div className="space-y-2 px-1 pb-1">
            <p className="text-sm font-semibold text-stone-800">Sign in to ask about your pack</p>
            <div className="min-h-10">{authReady && <GoogleButton text="continue_with" />}</div>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              send(draft)
            }}
            className="flex items-end gap-2 rounded-2xl bg-stone-50 p-1.5 ring-1 ring-stone-200 focus-within:ring-2 focus-within:ring-brand-400"
          >
            <textarea
              ref={input}
              value={draft}
              rows={1}
              maxLength={1000}
              onChange={(e) => {
                setDraft(e.target.value)
                e.target.style.height = 'auto'
                e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  send(draft)
                }
              }}
              placeholder={online ? 'Ask about this lecture…' : 'You’re offline'}
              disabled={!online}
              aria-label="Your question"
              className="max-h-36 min-h-10 flex-1 resize-none bg-transparent px-2.5 py-2 text-base outline-none placeholder:text-stone-400 sm:text-sm"
            />
            {busy ? (
              <button
                type="button"
                onClick={() => abort.current?.abort()}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-stone-800 text-white"
                aria-label="Stop"
              >
                <Square className="size-4" fill="currentColor" aria-hidden />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!draft.trim() || !online}
                className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40"
                aria-label="Ask"
              >
                <ArrowUp className="size-5" strokeWidth={2.5} aria-hidden />
              </button>
            )}
          </form>
        )}
        <p className="mt-2 px-1 text-[11px] leading-snug text-stone-400">Each answer uses a little of your plan’s allowance. Check important facts against your notes.</p>
      </div>
    </aside>
  )
}

function Thinking() {
  return (
    <span className="inline-flex gap-1 py-2" aria-label="Writing an answer">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-1.5 animate-pulse rounded-full bg-stone-400" style={{ animationDelay: `${i * 150}ms` }} />
      ))}
    </span>
  )
}

// An answer: "#" headings, "- " and "1." lists, paragraphs, **bold**, $maths$,
// and [[Page 4]] citations as chips that open the page in the viewer. Lines
// are grouped one by one, since answers often put a list straight under a line.
const HEADING = /^\s*#{1,6}\s+/
const BULLET = /^\s*[-*•]\s+/
const NUMBERED = /^\s*\d+[.)]\s+/

function AnswerText({ text, source, onOpenSource }) {
  const groups = []
  for (const line of text.trim().split('\n')) {
    const kind = !line.trim() ? 'gap' : HEADING.test(line) ? 'heading' : BULLET.test(line) ? 'ul' : NUMBERED.test(line) ? 'ol' : 'p'
    const last = groups.at(-1)
    if (kind === 'gap') groups.push({ kind })
    else if (last?.kind === kind && kind !== 'heading') last.lines.push(line)
    else groups.push({ kind, lines: [line] })
  }
  const inline = (line, strip) => <Inline text={line.replace(strip, '')} source={source} onOpenSource={onOpenSource} />
  return groups.map((g, i) => {
    if (g.kind === 'gap') return null
    if (g.kind === 'heading') {
      return (
        <p key={i} className="mt-3 mb-1 font-bold text-stone-900 first:mt-0">
          {inline(g.lines[0], HEADING)}
        </p>
      )
    }
    if (g.kind === 'ul' || g.kind === 'ol') {
      const List = g.kind
      const strip = g.kind === 'ul' ? BULLET : NUMBERED
      return (
        <List key={i} className={`my-1.5 space-y-1 pl-5 ${g.kind === 'ul' ? 'list-disc' : 'list-decimal'}`}>
          {g.lines.map((l, j) => (
            <li key={j}>{inline(l, strip)}</li>
          ))}
        </List>
      )
    }
    return (
      <p key={i} className="my-1.5 first:mt-0">
        {g.lines.map((l, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(l, /^$/)}
          </Fragment>
        ))}
      </p>
    )
  })
}

const CITATION = /\[\[(Page|Slide|Section) (\d+)\]\]/g

function Inline({ text, source, onOpenSource }) {
  const parts = []
  let last = 0
  for (const m of text.matchAll(CITATION)) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push({ unit: m[1], n: Number(m[2]) })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts.map((part, i) =>
    typeof part === 'string' ? (
      <Bold key={i} text={part} />
    ) : source ? (
      <button
        key={i}
        type="button"
        onClick={() => onOpenSource([part.n])}
        className="mx-0.5 inline-flex translate-y-[-1px] items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 align-middle text-[11px] font-semibold text-brand-700 ring-1 ring-brand-200 transition hover:bg-brand-100"
        aria-label={`Open ${part.unit.toLowerCase()} ${part.n}`}
      >
        <BookOpenText className="size-3" strokeWidth={2.5} aria-hidden />
        {part.unit === 'Slide' ? 'Slide' : part.unit === 'Section' ? 'Part' : 'p.'} {part.n}
      </button>
    ) : (
      <span key={i} className="text-xs font-semibold text-stone-500">
        ({part.unit} {part.n})
      </span>
    ),
  )
}

function Bold({ text }) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((piece, i) =>
    /^\*\*[^*]+\*\*$/.test(piece) ? (
      <strong key={i} className="font-semibold text-stone-900">
        <Rich text={piece.slice(2, -2)} />
      </strong>
    ) : (
      <Rich key={i} text={piece} />
    ),
  )
}

function load(packKey) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey(packKey)) ?? '[]')
    return Array.isArray(saved) ? saved.filter((m) => m && !m.pending && (m.role === 'user' || m.role === 'assistant')) : []
  } catch {
    return []
  }
}

function save(packKey, messages) {
  try {
    const done = messages.filter((m) => !m.pending).slice(-MAX_SAVED)
    if (done.length) localStorage.setItem(storageKey(packKey), JSON.stringify(done))
    else localStorage.removeItem(storageKey(packKey))
  } catch {
    // Storage full or blocked: the chat just isn't kept.
  }
}
