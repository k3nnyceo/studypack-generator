import { Check, CreditCard, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { formatDate, formatNaira, manageAutoRenew, startCheckout } from '../lib/billing.js'
import GoogleButton from './GoogleButton.jsx'
import UsageBars from './UsageBars.jsx'
import { Badge, Button, Eyebrow } from './ui.jsx'

// Plans & usage: the account's usage bars, and the Free / Pro / Max cards
// with Paystack checkout.
export default function Plans({ billing, user, showSignIn, onError }) {
  const [busy, setBusy] = useState(null) // `${plan}:${autoRenew}` while heading to checkout

  if (!billing) {
    return (
      <div className="flex justify-center py-24" role="status">
        <Loader2 className="size-6 animate-spin text-brand-600" aria-label="Loading plans" />
      </div>
    )
  }

  const current = user ? billing.plan : null
  const currentName = billing.plans.find((p) => p.id === current)?.name

  async function buy(planId, autoRenew) {
    setBusy(`${planId}:${autoRenew}`)
    try {
      await startCheckout(planId, autoRenew) // navigates away on success
    } catch (err) {
      setBusy(null)
      onError(err.message)
    }
  }

  async function manage() {
    setBusy('manage')
    try {
      await manageAutoRenew()
    } catch (err) {
      setBusy(null)
      onError(err.message)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <Eyebrow>Plans & usage</Eyebrow>
        <h1 className="mt-1 text-3xl font-bold tracking-tight text-stone-900">
          {current && current !== 'free' ? `You’re on ${billing.plans.find((p) => p.id === current).name}` : 'Choose your plan'}
        </h1>
        <p className="mt-1 max-w-2xl text-stone-500">
          Each study pack uses part of your allowance according to how much work it takes, so longer lectures use more.
          Allowances refill every 3 hours, and each month.
        </p>
      </div>

      {user && billing.usage && (
        <section className="card grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-start" aria-label="Your usage">
          <UsageBars billing={billing} />
          {current !== 'free' && (
            <div className="space-y-2 text-sm sm:w-56">
              <p className="text-stone-600">
                {billing.autoRenew ? 'Renews automatically on ' : 'Active until '}
                <span className="font-semibold text-stone-900">{formatDate(billing.periodEnd)}</span>
              </p>
              {billing.autoRenew && (
                <Button size="sm" variant="ghost" icon={RefreshCw} onClick={manage} disabled={busy !== null} className="-ml-3">
                  Manage auto-renew
                </Button>
              )}
            </div>
          )}
        </section>
      )}

      {!user && showSignIn && (
        <div className="card flex flex-wrap items-center justify-between gap-4 p-5">
          <p className="font-semibold text-stone-900">Sign in to start free, or to choose a plan.</p>
          <GoogleButton text="signin_with" />
        </div>
      )}

      <ul className="grid gap-5 md:grid-cols-3">
        {billing.plans.map((plan) => {
          const isCurrent = plan.id === current
          const paid = plan.price > 0
          const featured = plan.id === 'pro'
          return (
            <li
              key={plan.id}
              className={`card relative flex flex-col p-6 ${featured ? 'ring-2 ring-brand-400' : ''}`}
            >
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-stone-900">{plan.name}</h2>
                {isCurrent ? <Badge tone="emerald">Your plan</Badge> : featured && <Badge tone="brand">Most popular</Badge>}
              </div>
              <p className="mt-3">
                <span className="text-3xl font-extrabold tracking-tight text-stone-900">{paid ? formatNaira(plan.price) : '₦0'}</span>
                <span className="text-stone-500"> / month</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-stone-700">
                <Feature>About {plan.packsPerWindow} study pack{plan.packsPerWindow === 1 ? '' : 's'} every 3 hours</Feature>
                <Feature>About {plan.packsPerMonth} study packs a month</Feature>
                <Feature>Lectures up to about {plan.maxPages} pages</Feature>
                {paid ? <Feature>Never turned away on busy days</Feature> : <Feature>Study guide, flashcards and quiz</Feature>}
                <Feature>Library synced across your devices</Feature>
              </ul>

              {paid && user && billing.paymentsEnabled && (
                <div className="mt-6 space-y-2">
                  {isCurrent && billing.autoRenew ? (
                    <p className="text-sm text-stone-500">Renews automatically. Nothing to do.</p>
                  ) : (
                    <>
                      <Button
                        variant={featured ? 'primary' : undefined}
                        className="w-full justify-center"
                        icon={Sparkles}
                        disabled={busy !== null}
                        onClick={() => buy(plan.id, false)}
                      >
                        {busy === `${plan.id}:false`
                          ? 'Opening Paystack…'
                          : isCurrent
                            ? 'Add 30 days'
                            : `Pay ${formatNaira(plan.price)} for 30 days`}
                      </Button>
                      <Button
                        variant="ghost"
                        className="w-full justify-center"
                        icon={CreditCard}
                        disabled={busy !== null}
                        onClick={() => buy(plan.id, true)}
                      >
                        {busy === `${plan.id}:true` ? 'Opening Paystack…' : 'Renew monthly by card'}
                      </Button>
                      <p className="text-center text-xs text-stone-500">
                        {current !== 'free' && !isCurrent
                          ? `Your unused ${currentName} days carry over, adjusted for the difference in price.`
                          : 'Card, bank transfer or USSD. Secured by Paystack.'}
                      </p>
                    </>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {user && !billing.paymentsEnabled && (
        <p className="text-sm text-stone-500">Paid plans are coming soon.</p>
      )}
    </div>
  )
}

function Feature({ children }) {
  return (
    <li className="flex gap-2.5">
      <Check className="mt-0.5 size-4 shrink-0 text-brand-600" strokeWidth={2.5} aria-hidden />
      <span>{children}</span>
    </li>
  )
}
