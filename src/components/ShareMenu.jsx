import { Check, Link2, MessageCircle, Share2 } from 'lucide-react'
import { useState } from 'react'
import { whatsappShareUrl, xShareUrl } from '../lib/shareLinks.js'

// Share buttons for a message and link: post on X, send on WhatsApp, and the
// phone's own share menu (or Copy link where there isn't one).
export default function ShareMenu({ text, url, className = '', size = 'md' }) {
  const [copied, setCopied] = useState(false)
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const small = size === 'sm'
  const item = `inline-flex items-center justify-center gap-1.5 rounded-xl font-semibold whitespace-nowrap transition ${small ? 'h-8 px-3 text-sm' : 'h-10 px-4 text-sm'}`

  async function more() {
    if (canShare) {
      try {
        await navigator.share({ title: 'StudyPack', text, url })
      } catch {
        // Closed the share sheet: nothing to do.
      }
      return
    }
    try {
      await navigator.clipboard.writeText(`${text} ${url}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy this:', `${text} ${url}`)
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <a href={xShareUrl(text, url)} target="_blank" rel="noopener noreferrer" className={`${item} bg-stone-900 text-white hover:bg-stone-700`}>
        <XLogo className="size-3.5" />
        Post on X
      </a>
      <a
        href={whatsappShareUrl(text, url)}
        target="_blank"
        rel="noopener noreferrer"
        className={`${item} bg-[#1fa855] text-white hover:bg-[#178c46]`}
      >
        <MessageCircle className="size-4" strokeWidth={2.25} aria-hidden />
        WhatsApp
      </a>
      <button type="button" onClick={more} className={`${item} bg-white text-stone-700 ring-1 ring-stone-200 hover:bg-stone-50`}>
        {copied ? <Check className="size-4 text-emerald-600" aria-hidden /> : canShare ? <Share2 className="size-4" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
        {copied ? 'Copied' : canShare ? 'More' : 'Copy link'}
      </button>
    </div>
  )
}

// X's logo (lucide has no X mark).
function XLogo({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}
