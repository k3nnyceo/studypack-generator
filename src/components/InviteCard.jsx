import { Check, Copy, Gift, Share2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from './ui.jsx'

// The student's invite link (server/invites.js): friends get a discount on
// their first month, and each friend who pays earns the student free days.
export default function InviteCard() {
  const [invite, setInvite] = useState(null)
  const [failed, setFailed] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let alive = true
    fetch('/api/referrals?mine=1', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data) => alive && setInvite(data))
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [])

  if (failed) return null
  const link = invite && `${window.location.origin}/?ref=${invite.code}`
  const percent = invite && Math.round(invite.friendDiscount * 100)
  const message = invite && `I use StudyPack to turn my lecture notes into study guides, flashcards and quizzes. Get ${percent}% off your first month with my link: ${link}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt('Copy your invite link:', link)
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'StudyPack', text: message })
    } catch {
      // Closed the share sheet: nothing to do.
    }
  }

  return (
    <section id="invite" className="card scroll-mt-24 p-6" aria-label="Invite friends">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
          <Gift className="size-5" strokeWidth={2.25} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="font-bold text-stone-900">Invite friends, get free days</h2>
          <p className="mt-1 text-sm text-stone-600">
            {invite ? (
              <>
                Friends get <span className="font-semibold text-stone-900">{percent}% off</span> their first month. When one pays, you get{' '}
                <span className="font-semibold text-stone-900">{invite.rewardDays} free days</span>: a week of Plus, or more time on your plan.
              </>
            ) : (
              'Loading your link…'
            )}
          </p>
        </div>
      </div>

      {invite && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <input
              readOnly
              value={link}
              aria-label="Your invite link"
              onFocus={(e) => e.target.select()}
              className="h-10 min-w-0 flex-1 rounded-lg bg-stone-50 px-3 font-mono text-sm text-stone-800 ring-1 ring-stone-200 outline-none focus:ring-2 focus:ring-brand-400 sm:max-w-md"
            />
            <Button icon={copied ? Check : Copy} onClick={copy}>
              {copied ? 'Copied' : 'Copy link'}
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#25D366] px-3 text-sm font-semibold text-white transition hover:brightness-95"
            >
              Share on WhatsApp
            </a>
            {typeof navigator.share === 'function' && (
              <Button size="sm" variant="ghost" icon={Share2} onClick={share}>
                More ways to share
              </Button>
            )}
          </div>
          <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-stone-100 pt-4 text-center">
            {[
              ['Friends joined', invite.joined],
              ['Friends who paid', invite.paid],
              ['Free days earned', invite.days],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col-reverse">
                <dt className="text-xs text-stone-500">{label}</dt>
                <dd className="text-2xl font-extrabold text-stone-900 tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </section>
  )
}
