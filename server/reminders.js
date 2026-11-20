// Daily study reminders: a push notification to students who turned them on
// (src/lib/reminders.js), sent once a day by a Vercel cron (vercel.json) to
// /api/library?cron=reminders. Each message is built from the student's
// synced progress (src/lib/progressSync.js): flashcards due, exams in the
// next two weeks, and a streak that ends tonight. Nobody gets one on a day
// they've already studied, or when there's nothing to say.
//
// Needs VAPID keys (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY; make them with
// `node scripts/vapid-keys.js`) and CRON_SECRET, which Vercel sends with each
// cron request. Without the keys, reminders are simply off.
import webpush from 'web-push'
import { lagosDay } from '../src/lib/streak.js'
import { daysUntil, examLabel, upcomingExams } from '../src/lib/examPlan.js'

// Exams this close get mentioned.
const EXAM_DAYS = 14
const MAX_DEVICES = 5
const SEND_BATCH = 20

export const vapidFromEnv = (env = process.env) =>
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY
    ? { publicKey: env.VAPID_PUBLIC_KEY, privateKey: env.VAPID_PRIVATE_KEY, subject: env.VAPID_SUBJECT || env.SITE_URL || 'https://studypack-generator.vercel.app' }
    : null

// { title, body } for today, or null when there's nothing worth a nudge.
// `fingerprints` are the packs in the student's library, so flashcards from
// deleted packs don't count.
export function reminderFor({ progress, fingerprints, now = Date.now() }) {
  if (!progress) return null
  const today = lagosDay(now)
  const streak = progress.streak
  if (streak?.last === today) return null

  let due = 0
  for (const [pack, cards] of Object.entries(progress.cards ?? {})) {
    if (fingerprints && !fingerprints.has(pack)) continue
    for (const card of Object.values(cards ?? {})) if (card?.box === 0 || card?.due <= now) due++
  }
  const exam = upcomingExams(progress.plan?.exams ?? [], today).find((e) => e.daysLeft <= EXAM_DAYS)
  const streakAtRisk = streak?.count > 1 && daysUntil(today, streak.last) === 1

  const cards = `${due} flashcard${due === 1 ? '' : 's'} due`
  const when = (e) => (e.daysLeft === 0 ? 'today' : e.daysLeft === 1 ? 'tomorrow' : `in ${e.daysLeft} days`)
  if (exam) {
    const parts = [due ? `Review your ${due} due flashcard${due === 1 ? '' : 's'}` : 'A short session today keeps it fresh']
    if (streakAtRisk) parts.push(`and keep your ${streak.count}-day streak`)
    return { title: `${examLabel(exam.course)} exam ${when(exam)}`, body: `${parts.join(' ')}.` }
  }
  if (streakAtRisk) return { title: `Keep your ${streak.count}-day streak`, body: due ? `${cards}. A few minutes is enough.` : 'A few minutes of study keeps it going.' }
  if (due >= 5) return { title: cards, body: 'Review them now, while they’re easy to remember.' }
  return null
}

// Adds a device's subscription (newest first, at most MAX_DEVICES).
export function withDevice(devices = [], subscription, now = Date.now()) {
  const others = devices.filter((d) => d.endpoint !== subscription.endpoint)
  return [{ endpoint: subscription.endpoint, keys: subscription.keys, at: now }, ...others].slice(0, MAX_DEVICES)
}

export const isSubscription = (s) =>
  typeof s?.endpoint === 'string' && /^https:\/\//.test(s.endpoint) && s.endpoint.length < 1000 && typeof s.keys?.p256dh === 'string' && typeof s.keys?.auth === 'string'

// The daily run. Returns { students, sent, removed }.
export async function sendReminders({ store, vapid, send = defaultSender(vapid), now = Date.now() }) {
  const users = await store.pushUsers()
  let sent = 0
  let removed = 0
  for (let i = 0; i < users.length; i += SEND_BATCH) {
    await Promise.all(
      users.slice(i, i + SEND_BATCH).map(async (user) => {
        try {
          const devices = await store.getPush(user)
          if (!devices?.length) return void (await store.setPush(user, []))
          const [progress, entries] = await Promise.all([store.getProgress(user), store.list(user)])
          const message = reminderFor({ progress, fingerprints: new Set(entries.map((e) => e.fingerprint)), now })
          if (!message || !(await store.markReminded(user, lagosDay(now)))) return
          const payload = JSON.stringify({ ...message, url: '/#/today' })
          const gone = []
          for (const device of devices) {
            try {
              await send(device, payload)
              sent++
            } catch (err) {
              // 404/410: the device unsubscribed or the app was removed.
              if (err.statusCode === 404 || err.statusCode === 410) gone.push(device.endpoint)
              else console.error('[reminders] Send failed:', err.statusCode ?? err.message)
            }
          }
          if (gone.length) {
            removed += gone.length
            await store.setPush(user, devices.filter((d) => !gone.includes(d.endpoint)))
          }
        } catch (err) {
          console.error('[reminders] Student failed:', err.message)
        }
      }),
    )
  }
  return { students: users.length, sent, removed }
}

function defaultSender(vapid) {
  return (device, payload) =>
    webpush.sendNotification({ endpoint: device.endpoint, keys: device.keys }, payload, {
      vapidDetails: vapid,
      TTL: 12 * 60 * 60,
      urgency: 'normal',
    })
}
