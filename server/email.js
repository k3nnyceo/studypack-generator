// Sending email (the sign-in codes in server/emailSignIn.js), through Resend
// or Brevo, whichever has a key:
//   RESEND_API_KEY   https://resend.com (needs a domain you own, verified there)
//   BREVO_API_KEY    https://brevo.com (can send from a single verified address)
//   EMAIL_FROM       the sender, e.g. "StudyPack <hello@studypack.ng>"
// Without a key, the local dev server prints emails to its console instead;
// a deployment can't send, so email sign-in is turned off there.
import { isDeployed } from './usageLimits.js'

export function emailProvider(env = process.env) {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) return 'resend'
  if (env.BREVO_API_KEY && env.EMAIL_FROM) return 'brevo'
  return isDeployed(env) ? null : 'console'
}

// "StudyPack <hello@x.com>" -> { name: 'StudyPack', email: 'hello@x.com' }
function parseFrom(from) {
  const match = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(from)
  return match ? { name: match[1] || undefined, email: match[2] } : { email: from.trim() }
}

export async function sendEmail({ to, subject, text, html }, { env = process.env, fetchImpl = fetch } = {}) {
  const provider = emailProvider(env)
  if (!provider) throw new Error('No email provider is set up')

  if (provider === 'console') {
    console.log(`[email] To ${to}: ${subject}\n${text}`)
    return
  }

  const request =
    provider === 'resend'
      ? {
          url: 'https://api.resend.com/emails',
          headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
          body: { from: env.EMAIL_FROM, to: [to], subject, text, html },
        }
      : {
          url: 'https://api.brevo.com/v3/smtp/email',
          headers: { 'api-key': env.BREVO_API_KEY },
          body: { sender: parseFrom(env.EMAIL_FROM), to: [{ email: to }], subject, textContent: text, htmlContent: html },
        }
  const res = await fetchImpl(request.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...request.headers },
    body: JSON.stringify(request.body),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`${provider} answered ${res.status}: ${detail.slice(0, 200)}`)
  }
}
