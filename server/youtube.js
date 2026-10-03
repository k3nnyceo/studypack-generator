// /api/youtube: turns a YouTube lecture into notes, using the video's own
// captions from Supadata (https://supadata.ai). Every plan can import a few
// videos per 3-hour window and per month (Free) or paid period; see
// server/plans.js.
//
//   POST { url }  ->  { title, videoId, sections: [{ start, end, text }], minutes, truncated }
//
// Only existing captions are used (mode=native, 1 Supadata credit a video);
// AI transcription of videos without captions costs 2 credits a minute, so
// it's off. A site-wide monthly cap (YOUTUBE_MONTHLY_CAP) stops imports before
// the Supadata plan's credits run out. The notes are cut at the plan's
// longest-notes limit, so the student can always generate from them.
import { getSessionUser } from './auth.js'
import { getDefaults } from './billing.js'
import { sendJson } from './http.js'
import { plansFromEnv } from './plans.js'
import { activeSubscription, getSubscription } from './subscriptions.js'

const API = 'https://api.supadata.ai/v1/transcript'
// Notes are grouped into sections of this many minutes, labelled with their
// times, so a pack's modules can say which part of the lecture they cover.
const SECTION_MINUTES = 5
// How long to wait for Supadata's job on a long video (the function has 60 s).
const JOB_WAIT_MS = 45_000

// The video id from any usual YouTube link, or null.
export function youtubeId(url) {
  let u
  try {
    u = new URL(String(url).trim())
  } catch {
    return null
  }
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '')
  let id = null
  if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0]
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    id = u.searchParams.get('v') ?? u.pathname.match(/^\/(?:shorts|live|embed)\/([^/?#]+)/)?.[1] ?? null
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null
}

const monthKey = (t) => `studypack:youtube:site:${new Date(t + 3600_000).toISOString().slice(0, 7)}`

export async function handleYoutubeRequest(req, res, body, deps = {}) {
  const {
    store = getDefaults().store,
    meter = getDefaults().meter,
    getUser = getSessionUser,
    env = process.env,
    fetchTranscript = supadataTranscript,
    fetchTitle = youtubeTitle,
    now = Date.now,
  } = deps
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' })
  const user = await getUser(req)
  if (!user) return sendJson(res, 401, { error: 'Sign in to use YouTube lectures.' })
  if (!store || !meter || !env.SUPADATA_API_KEY) return sendJson(res, 503, { error: 'YouTube lectures aren’t available right now.' })

  const videoId = youtubeId(body?.url)
  if (!videoId) return sendJson(res, 400, { error: 'That doesn’t look like a YouTube video link.' })

  let slot, plan
  const siteCap = Number(env.YOUTUBE_MONTHLY_CAP) || 90
  const siteKey = monthKey(now())
  try {
    const subscription = activeSubscription(await getSubscription(store, user.id), now())
    plan = plansFromEnv(env)[subscription?.plan ?? 'free']
    slot = await meter.reserveCount(user.id, subscription, 'youtube', { perWindow: plan.youtubePerWindow, perPeriod: plan.youtubePerMonth })
    if (!slot.ok) {
      const error =
        slot.reason === 'period'
          ? `You’ve used this month’s ${plan.youtubePerMonth} YouTube lectures on ${plan.name}.`
          : `You’ve used this session’s ${plan.youtubePerWindow} YouTube lecture${plan.youtubePerWindow === 1 ? '' : 's'} on ${plan.name}.`
      return sendJson(res, 429, { error, reason: slot.reason, resetsAt: slot.resetsAt, plan: plan.id })
    }
    // Supadata charges per request, success or not, so the site cap counts attempts.
    if ((await store.add(siteKey, 1, 40 * 24 * 3600)) > siteCap) {
      await Promise.all([slot.release(), store.add(siteKey, -1, 40 * 24 * 3600)])
      console.error(`[youtube] Monthly cap of ${siteCap} imports reached.`)
      return sendJson(res, 503, { error: 'YouTube lectures are very busy this month. Please try again later, or upload the slides instead.' })
    }
  } catch (err) {
    console.error('[youtube] Usage store failed:', err.message)
    return sendJson(res, 503, { error: 'YouTube lectures aren’t available right now.' })
  }

  try {
    const [captions, title] = await Promise.all([fetchTranscript(videoId, env), fetchTitle(videoId).catch(() => '')])
    if (!captions) {
      await slot.release()
      return sendJson(res, 422, {
        error: 'This video has no captions, so StarterPack can’t read it. Try another video, or upload the lecture slides.',
      })
    }
    const notes = toSections(captions, plan.maxChars)
    console.log(`[youtube] ${user.id} ${videoId}: ${notes.minutes} min, ${notes.sections.length} sections${notes.truncated ? ' (cut)' : ''}`)
    sendJson(res, 200, { videoId, title: title || 'YouTube lecture', ...notes })
  } catch (err) {
    await slot.release()
    console.error('[youtube] Failed:', err.message)
    sendJson(res, 502, { error: 'Couldn’t get this video’s captions. Please try again.' })
  }
}

// Supadata's captions as [{ text, offset (ms), duration (ms) }], or null if
// the video has none. Long videos are processed as a job, polled here.
export async function supadataTranscript(videoId, env = process.env) {
  const headers = { 'x-api-key': env.SUPADATA_API_KEY }
  const url = `${API}?${new URLSearchParams({ url: `https://www.youtube.com/watch?v=${videoId}`, mode: 'native' })}`
  let res = await fetch(url, { headers })
  if (res.status === 206 || res.status === 404) return null
  let data = await res.json().catch(() => null)
  if (res.status === 202 && data?.jobId) {
    const deadline = Date.now() + JOB_WAIT_MS
    for (;;) {
      if (Date.now() > deadline) throw new Error('Supadata job took too long')
      await new Promise((r) => setTimeout(r, 1500))
      res = await fetch(`${API}/${encodeURIComponent(data.jobId)}`, { headers })
      const job = await res.json().catch(() => null)
      if (job?.status === 'completed') {
        data = job.result ?? job
        break
      }
      if (job?.status === 'failed') return null
    }
  } else if (!res.ok) {
    throw new Error(`Supadata ${res.status}: ${data?.message ?? data?.error ?? 'no response'}`)
  }
  const chunks = Array.isArray(data?.content) ? data.content : null
  return chunks?.length ? chunks : null
}

// The video's title, from YouTube's public oEmbed endpoint.
export async function youtubeTitle(videoId) {
  const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`)
  if (!res.ok) return ''
  return String((await res.json()).title ?? '').slice(0, 200)
}

// Captions grouped into SECTION_MINUTES sections, cut at maxChars.
export function toSections(chunks, maxChars) {
  const span = SECTION_MINUTES * 60_000
  const sections = []
  let total = 0
  let truncated = false
  for (const c of chunks) {
    const text = String(c.text ?? '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    if (total + text.length + 1 > maxChars) {
      truncated = true
      break
    }
    const index = Math.floor((Number(c.offset) || 0) / span)
    let section = sections.at(-1)
    if (!section || section.index !== index) {
      section = { index, start: index * span, end: (index + 1) * span, text: '' }
      sections.push(section)
    }
    section.text += (section.text ? ' ' : '') + text
    total += text.length + 1
  }
  const last = chunks.at(-1)
  const lengthMs = (Number(last?.offset) || 0) + (Number(last?.duration) || 0)
  if (sections.length) sections.at(-1).end = Math.min(sections.at(-1).end, truncated ? sections.at(-1).end : lengthMs || sections.at(-1).end)
  return {
    sections: sections.map(({ start, end, text }) => ({ start, end, text })),
    minutes: Math.round(lengthMs / 60_000),
    coveredMinutes: Math.round((sections.at(-1)?.end ?? 0) / 60_000),
    truncated,
  }
}
