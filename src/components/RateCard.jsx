import { Star, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DISCORD_URL } from '../config.js'
import { fetchMyReview, recentlyDismissed, rememberDismissed, submitReview } from '../lib/reviews.js'
import { Button } from './ui.jsx'

// "How's StudyPack?" on the quiz results screen, for signed-in students who
// haven't rated it yet (server/reviews.js). Stars first; a comment and
// permission to show it publicly are optional.
export default function RateCard() {
  // 'checking' | 'asking' | 'sending' | 'thanks' | 'hidden'
  const [state, setState] = useState(() => (recentlyDismissed() ? 'hidden' : 'checking'))
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (state !== 'checking') return
    let alive = true
    fetchMyReview()
      .then((review) => alive && setState(review ? 'hidden' : 'asking'))
      .catch(() => alive && setState('hidden'))
    return () => {
      alive = false
    }
    // Checked once, when the card first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (state === 'checking' || state === 'hidden') return null

  if (state === 'thanks') {
    return (
      <section className="card p-6 text-center sm:p-8" aria-live="polite">
        <p className="text-lg font-bold text-stone-900">Thank you! 💜</p>
        <p className="mt-1 text-sm text-stone-600">Your review helps us make StudyPack better for every student.</p>
        {DISCORD_URL && (
          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-[#5865F2] px-4 text-sm font-semibold text-white transition hover:bg-[#4752c4]"
          >
            Join the StudyPack Discord
          </a>
        )}
      </section>
    )
  }

  async function send(e) {
    e.preventDefault()
    if (!rating) return
    setState('sending')
    setError('')
    try {
      await submitReview({ rating, comment, public: isPublic })
      setState('thanks')
    } catch (err) {
      setError(err.message)
      setState('asking')
    }
  }

  function dismiss() {
    rememberDismissed()
    setState('hidden')
  }

  const shown = hover || rating
  return (
    <section className="card relative p-6 sm:p-8" aria-labelledby="rate-heading">
      <button
        type="button"
        onClick={dismiss}
        aria-label="Not now"
        className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
      >
        <X className="size-4" aria-hidden />
      </button>
      <h2 id="rate-heading" className="pr-8 font-bold text-stone-900">
        How’s StudyPack working for you?
      </h2>
      <form onSubmit={send} className="mt-3 space-y-4">
        <div className="flex gap-1" role="radiogroup" aria-label="Your rating" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={rating === n}
              aria-label={`${n} star${n === 1 ? '' : 's'}`}
              onClick={() => setRating(n)}
              onMouseEnter={() => setHover(n)}
              className="rounded-lg p-1 transition hover:scale-110"
            >
              <Star className={`size-8 ${n <= shown ? 'fill-amber-400 text-amber-400' : 'text-stone-300'}`} strokeWidth={1.75} aria-hidden />
            </button>
          ))}
        </div>
        {rating > 0 && (
          <>
            <div>
              <label htmlFor="review-comment" className="text-sm font-semibold text-stone-800">
                {rating >= 4 ? 'What do you like most?' : 'What should we improve?'} <span className="font-normal text-stone-500">(optional)</span>
              </label>
              <textarea
                id="review-comment"
                rows={3}
                maxLength={600}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:ring-2 focus:ring-brand-200 focus:outline-none"
              />
            </div>
            {comment.trim() && (
              <label className="flex items-start gap-2 text-sm text-stone-600">
                <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="mt-0.5 size-4 accent-brand-600" />
                OK to show my first name and comment on StudyPack’s website
              </label>
            )}
            {error && (
              <p role="alert" className="text-sm text-rose-700">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Send review'}
            </Button>
          </>
        )}
      </form>
    </section>
  )
}
