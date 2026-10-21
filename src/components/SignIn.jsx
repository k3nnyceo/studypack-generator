import { ArrowLeft, Mail } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { requestEmailCode, useEmailSignIn, verifyEmailCode } from '../lib/auth.js'
import GoogleButton from './GoogleButton.jsx'
import { Button } from './ui.jsx'

const RESEND_SECONDS = 60

// The ways to sign in: Google's button, and (when the server can send email)
// a 6-digit code sent to any address. A code rather than a link, so the
// student stays on this page with their notes instead of a new tab.
// `text` is the Google button's wording ('signin_with', 'continue_with', ...).
export default function SignIn({ text = 'signin_with', className = '' }) {
  const emailEnabled = useEmailSignIn()
  const [step, setStep] = useState('start') // 'start' | 'email' | 'code'

  return (
    <div className={`flex max-w-xs flex-col gap-3 ${className}`}>
      {step === 'start' && <GoogleButton text={text} />}
      {emailEnabled && <EmailSignIn step={step} setStep={setStep} />}
    </div>
  )
}

function EmailSignIn({ step, setStep }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [wait, setWait] = useState(0)
  const codeInput = useRef(null)

  useEffect(() => {
    if (!wait) return
    const timer = setTimeout(() => setWait((w) => w - 1), 1000)
    return () => clearTimeout(timer)
  }, [wait])
  useEffect(() => {
    if (step === 'code') codeInput.current?.focus()
  }, [step])

  async function send(e) {
    e?.preventDefault()
    setBusy(true)
    setError('')
    try {
      await requestEmailCode(email.trim())
      setCode('')
      setStep('code')
      setWait(RESEND_SECONDS)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function verify(value = code) {
    setBusy(true)
    setError('')
    try {
      await verifyEmailCode(email.trim(), value)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  if (step === 'start') {
    return (
      <>
        <div className="flex items-center gap-3 text-xs font-semibold tracking-wide text-stone-400 uppercase">
          <span className="h-px flex-1 bg-stone-200" />
          or
          <span className="h-px flex-1 bg-stone-200" />
        </div>
        <Button icon={Mail} className="w-full" onClick={() => setStep('email')}>
          Continue with email
        </Button>
      </>
    )
  }

  const errorText = error && (
    <p role="alert" className="text-sm text-rose-700">
      {error}
    </p>
  )

  if (step === 'email') {
    return (
      <form onSubmit={send} className="flex flex-col gap-2">
        <label htmlFor="signin-email" className="text-sm font-semibold text-stone-800">
          Your email
        </label>
        <input
          id="signin-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="w-full rounded-xl bg-white px-3.5 py-2.5 text-stone-900 ring-1 ring-stone-300 outline-none placeholder:text-stone-400 focus:ring-2 focus:ring-brand-500"
        />
        {errorText}
        <Button type="submit" variant="primary" className="w-full" disabled={busy || !email.trim()}>
          {busy ? 'Sending…' : 'Send me a code'}
        </Button>
        <button type="button" onClick={() => setStep('start')} className="inline-flex items-center gap-1 self-start text-sm font-medium text-stone-500 hover:text-stone-800">
          <ArrowLeft className="size-3.5" aria-hidden />
          Other ways to sign in
        </button>
      </form>
    )
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        verify()
      }}
      className="flex flex-col gap-2"
    >
      <p className="text-sm text-stone-600">
        We sent a 6-digit code to <span className="font-semibold text-stone-900">{email.trim()}</span>. It can take a minute, and check spam if
        it isn’t there.
      </p>
      <label htmlFor="signin-code" className="sr-only">
        Code from the email
      </label>
      <input
        id="signin-code"
        ref={codeInput}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
          setCode(digits)
          // A full code (typed, pasted or autofilled) signs straight in.
          if (digits.length === 6 && !busy) verify(digits)
        }}
        placeholder="123456"
        className="w-full rounded-xl bg-white px-3.5 py-2.5 text-center text-2xl font-bold tracking-[0.4em] text-stone-900 tabular-nums ring-1 ring-stone-300 outline-none placeholder:text-stone-300 focus:ring-2 focus:ring-brand-500"
      />
      {errorText}
      <Button type="submit" variant="primary" className="w-full" disabled={busy || code.length !== 6}>
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm font-medium">
        <button type="button" onClick={() => setStep('email')} className="text-stone-500 hover:text-stone-800">
          Change email
        </button>
        <button type="button" onClick={() => send()} disabled={busy || wait > 0} className="text-brand-700 hover:text-brand-800 disabled:text-stone-400">
          {wait > 0 ? `Send again in ${wait}s` : 'Send a new code'}
        </button>
      </div>
    </form>
  )
}
