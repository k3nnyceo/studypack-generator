import { ArrowRight, Megaphone, X } from 'lucide-react'
import { useState } from 'react'
import { DISCORD_URL } from '../config.js'
import { announcements, dismiss, nextAnnouncement, readDismissed } from '../lib/whatsNew.js'

const LIST = announcements(DISCORD_URL)

// The "New in StudyPack" card (src/lib/whatsNew.js): one announcement, with a
// link and a close button.
export default function WhatsNew({ view, onNavigate, className = '' }) {
  const [dismissed, setDismissed] = useState(readDismissed)
  const item = nextAnnouncement(dismissed, view, LIST)
  if (!item) return null

  const close = () => setDismissed(dismiss(item.id))
  const cta = item.cta
  const ctaClass = 'mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:text-brand-800'

  return (
    <section aria-label="New in StudyPack" className={`relative rounded-2xl bg-gradient-to-br from-brand-50 to-white p-5 pr-12 ring-1 ring-brand-200 ${className}`}>
      <p className="flex items-center gap-1.5 text-xs font-bold tracking-[0.08em] text-brand-600 uppercase">
        <Megaphone className="size-3.5" strokeWidth={2.5} aria-hidden />
        New in StudyPack
      </p>
      <h2 className="mt-1.5 font-bold text-stone-900">{item.title}</h2>
      <p className="mt-1 text-sm leading-relaxed text-stone-600">{item.body}</p>
      {cta?.view && (
        <button
          type="button"
          onClick={() => {
            close()
            onNavigate(cta.view)
          }}
          className={ctaClass}
        >
          {cta.label}
          <ArrowRight className="size-4" aria-hidden />
        </button>
      )}
      {cta?.url && (
        <a href={cta.url} target="_blank" rel="noopener noreferrer" onClick={close} className={ctaClass}>
          {cta.label}
          <ArrowRight className="size-4" aria-hidden />
        </a>
      )}
      <button
        type="button"
        onClick={close}
        aria-label="Dismiss"
        className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
      >
        <X className="size-4" aria-hidden />
      </button>
    </section>
  )
}
