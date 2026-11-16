import { Download, EllipsisVertical, Share, SquarePlus, Smartphone, WifiOff, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { promptInstall, useInstallMode } from '../lib/install.js'
import { Button } from './ui.jsx'

const CARD_DISMISSED_KEY = 'studypack.installCard.dismissed'

// The header's "Install app" button. Hidden where there's nothing to install
// (already installed, or a desktop browser that can't).
export function InstallButton() {
  const { mode, start, help } = useInstall()
  if (mode === 'installed' || mode === 'none') return null
  return (
    <>
      <button
        type="button"
        onClick={start}
        aria-label="Install the StudyPack app"
        title="Install the StudyPack app"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-stone-600 transition hover:bg-stone-100 hover:text-stone-900 sm:px-3"
      >
        <Download className="size-4" strokeWidth={2.25} aria-hidden />
        <span className="hidden sm:inline">Install app</span>
      </button>
      {help}
    </>
  )
}

// A card on the home page saying why it's worth installing, until the student
// installs it or closes the card.
export function InstallCard() {
  const { mode, start, help } = useInstall()
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(CARD_DISMISSED_KEY) === '1'
    } catch {
      return false
    }
  })
  if (dismissed || mode === 'installed' || mode === 'none') return null
  const phone = mode !== 'prompt' || /Android|iPhone|iPad|iPod/.test(navigator.userAgent)

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(CARD_DISMISSED_KEY, '1')
    } catch {
      // Private mode: it just comes back next visit.
    }
  }

  return (
    <section aria-labelledby="install-card-heading" className="relative mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl bg-gradient-to-br from-brand-50 to-white p-5 text-left ring-1 ring-brand-200 sm:flex-row sm:items-center sm:p-6">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-brand">
        <Smartphone className="size-6" strokeWidth={2} aria-hidden />
      </span>
      <div className="min-w-0 flex-1 pr-6 sm:pr-0">
        <h2 id="install-card-heading" className="font-bold text-stone-900">
          {phone ? 'Get StudyPack on your phone' : 'Install StudyPack as an app'}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-stone-600">
          {phone
            ? 'It opens like an app from your home screen, your saved packs work offline, and you can share lecture PDFs straight to it from WhatsApp. Free, and no app store needed.'
            : 'It opens in its own window from your taskbar or dock, and your saved packs work offline. Free, and no app store needed.'}
        </p>
      </div>
      <Button variant="primary" icon={Download} onClick={start} className="self-start sm:self-auto">
        Install app
      </Button>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Hide this"
        className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
      >
        <X className="size-4" aria-hidden />
      </button>
      {help}
    </section>
  )
}

// { mode, start, help }: `start` installs in one tap where the browser allows
// it, else opens `help`, the steps for this phone.
function useInstall() {
  const mode = useInstallMode()
  const [helpOpen, setHelpOpen] = useState(false)

  async function start() {
    if (mode === 'prompt' && (await promptInstall()) !== 'unavailable') return
    setHelpOpen(true)
  }

  const help = helpOpen ? <InstallHelp mode={mode} onClose={() => setHelpOpen(false)} /> : null
  return { mode, start, help }
}

const STEPS = {
  ios: [
    { icon: Share, text: 'Tap the Share button (the square with an arrow) at the bottom or top of the screen.' },
    { icon: SquarePlus, text: 'Scroll down and tap “Add to Home Screen”, then “Add”.' },
    { icon: Smartphone, text: 'Open StudyPack from its icon on your home screen.' },
  ],
  android: [
    { icon: EllipsisVertical, text: 'Tap the browser menu (⋮), at the top right in Chrome.' },
    { icon: Download, text: 'Tap “Install app” or “Add to Home screen”, then “Install”.' },
    { icon: Smartphone, text: 'Open StudyPack from its icon on your home screen.' },
  ],
  'in-app': [
    { icon: EllipsisVertical, text: 'This page is open inside another app (like X, Instagram or WhatsApp), which can’t install apps. Tap its menu (⋯ or ⋮).' },
    { icon: Share, text: 'Choose “Open in browser” (or “Open in Chrome” / “Open in Safari”).' },
    { icon: Download, text: 'In your browser, tap Install app again.' },
  ],
}

// A small dialog with the steps for this phone.
function InstallHelp({ mode, onClose }) {
  const closeRef = useRef(null)
  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const steps = STEPS[mode] ?? STEPS.android
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-stone-950/40 p-0 sm:items-center sm:p-4" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-help-heading"
        className="animate-page-in w-full max-w-sm rounded-t-3xl bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-left shadow-elevated sm:rounded-3xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id="install-help-heading" className="text-lg font-bold text-stone-900">
            {mode === 'in-app' ? 'Open in your browser first' : 'Install StudyPack'}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mt-1 -mr-2 flex size-9 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <ol className="space-y-3">
          {steps.map(({ icon: Icon, text }, i) => (
            <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-stone-700">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                <Icon className="size-4" strokeWidth={2.25} aria-hidden />
              </span>
              <span className="pt-1">
                <span className="font-semibold text-stone-900">{i + 1}.</span> {text}
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-5 flex items-start gap-2 rounded-xl bg-stone-50 p-3 text-xs leading-relaxed text-stone-500">
          <WifiOff className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Once installed, packs you’ve opened work without data, and StudyPack shows up when you share a PDF from WhatsApp.
        </p>
      </div>
    </div>
  )
}
