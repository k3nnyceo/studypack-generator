import { useCallback, useEffect, useState } from 'react'

// Plans, usage and Paystack checkout (/api/billing, server/billing.js).
//
// Billing state: { paymentsEnabled, plans: [{ id, name, price, packsPerWindow,
// packsPerMonth, maxPages }], plan, periodEnd, autoRenew, usage: { window:
// { percent, resetsAt }, period: { percent, resetsAt } } }.

async function billingApi(method, body) {
  let res
  try {
    res = await fetch('/api/billing', {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
  } catch {
    throw new Error('Couldn’t reach StarterPack. Check your connection and try again.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) {
    const err = new Error(data?.error || `Something went wrong (${res.status}). Please try again.`)
    err.status = res.status
    throw err
  }
  return data
}

// Sends the student to Paystack's checkout page. They come back to
// /?billing=return&reference=…, which takePaymentReturn() picks up.
export async function startCheckout(plan, autoRenew) {
  const { url } = await billingApi('POST', { action: 'checkout', plan, autoRenew })
  window.location.assign(url)
}

// Applies a Gumroad license key. Resolves to the new billing state.
export const redeemGumroadKey = (key) => billingApi('POST', { action: 'redeem', key })

// Paystack's page for cancelling auto-renew or changing the card.
export async function manageAutoRenew() {
  const { url } = await billingApi('POST', { action: 'manage' })
  window.location.assign(url)
}

// The payment reference if we've just come back from Paystack, removing it
// from the address bar so a reload doesn't repeat it.
export function takePaymentReturn() {
  const params = new URLSearchParams(window.location.search)
  if (params.get('billing') !== 'return') return null
  const reference = params.get('reference') || params.get('trxref')
  params.delete('billing')
  params.delete('reference')
  params.delete('trxref')
  const query = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)
  return reference
}

// The billing state (the account's, when signed in), refreshed on sign-in, on demand,
// and when the app comes back to the foreground. `verify(reference)` applies a
// payment the student just made.
export function useBilling(user) {
  // Tagged with whose it is, so one account's usage is never shown to the next.
  const [state, setState] = useState({ userId: undefined, data: null })
  const userId = user?.id ?? null
  const billing = state.userId === userId ? state.data : null

  // Signed out, this is just the plans (for the plans page). A failure keeps
  // the last known state; the usage bars are informational.
  const refresh = useCallback(
    () =>
      billingApi('GET')
        .then((data) => setState({ userId, data }))
        .catch(() => {}),
    [userId],
  )

  useEffect(() => {
    billingApi('GET')
      .then((data) => setState({ userId, data }))
      .catch(() => {})
    if (!userId) return
    const onVisible = () => document.visibilityState === 'visible' && refresh()
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [refresh, userId])

  const verify = useCallback(async (reference) => {
    const data = await billingApi('POST', { action: 'verify', reference })
    setState({ userId, data })
    return data
  }, [userId])

  return { billing, refresh, verify }
}

const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' })
const day = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const date = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

// "4:00 pm", or "Sat 1 Nov, 12:00 am" when it isn't today.
export function formatResetTime(ms) {
  const at = new Date(ms)
  const sameDay = at.toDateString() === new Date().toDateString()
  return sameDay ? time.format(at) : `${day.format(at)}, ${time.format(at)}`
}

export const formatDate = (ms) => date.format(new Date(ms))
export const formatNaira = (n) => `₦${n.toLocaleString('en-NG')}`
