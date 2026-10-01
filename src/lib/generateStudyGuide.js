import { validateStudyGuide } from './studyGuideFormat.js'

// Only used when AI_GENERATION_ENABLED is on (src/config.js).
//
// Generation runs as a job on the server (server/studyGuideHandler.js): we
// start it, then poll until it's done. Nothing depends on one connection
// staying open, so a phone can lock its screen or switch apps mid-way. The job
// id is kept in localStorage, so if the page is reloaded (or the phone unloads
// it), the app picks the job back up on the next load (see resumePendingJob).

const PENDING_KEY = 'studypack.pendingJob.v1'
const POLL_MS = 3000
// Past this, stop waiting: the server gives up on a job after ~5.5 minutes.
const GIVE_UP_MS = 8 * 60 * 1000

// Resolves to { guide, remaining }: a validated guide in the format defined in
// studyGuideFormat.js, and how many free guides the visitor has left today.
export async function generateStudyGuide({ text, fileName, signal }) {
  const { jobId, remaining } = await callApi('/api/study-guide', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, fileName }),
    signal,
  })
  savePendingJob({ jobId, fileName, startedAt: Date.now() })
  const guide = await waitForJob({ jobId, startedAt: Date.now(), signal })
  return { guide, remaining: Number.isFinite(remaining) ? remaining : null }
}

// A job started before the page was reloaded, if it could still be running:
// { jobId, fileName, startedAt } or null.
export function getPendingJob() {
  try {
    const job = JSON.parse(localStorage.getItem(PENDING_KEY) ?? 'null')
    if (job?.jobId && Date.now() - job.startedAt < GIVE_UP_MS) return job
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // storage blocked or corrupt: nothing to resume
  }
  return null
}

// Waits for a job from getPendingJob(). Resolves to the guide.
export function resumePendingJob({ jobId, startedAt }, { signal } = {}) {
  return waitForJob({ jobId, startedAt, signal })
}

// Polls until the job finishes. Aborting `signal` cancels the job on the server.
async function waitForJob({ jobId, startedAt, signal }) {
  const url = `/api/study-guide?job=${encodeURIComponent(jobId)}`
  try {
    for (;;) {
      let job = null
      try {
        job = await callApi(url, { signal, cache: 'no-store' })
      } catch (err) {
        // A dropped connection (the phone just woke, or lost signal) or a
        // server hiccup is retried; a 4xx answer, like "expired", is final.
        if (err.name === 'AbortError' || err.fromServer) throw err
      }
      if (job?.status === 'done') {
        clearPendingJob()
        const result = validateStudyGuide(job.guide)
        if (!result.ok) {
          console.error('Invalid study guide from server:', result.errors)
          throw new Error('The study guide came back in an unexpected format. Please try again.')
        }
        return result.guide
      }
      if (job?.status === 'error' || job?.status === 'cancelled') {
        throw new Error(job.error || 'Generation was stopped. Please try again.')
      }
      if (Date.now() - startedAt > GIVE_UP_MS) {
        throw new Error('This is taking much longer than usual. Please check your connection and try again.')
      }
      await nextCheck(signal)
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      // keepalive lets the cancel go through even if the page is closing.
      fetch(url, { method: 'DELETE', keepalive: true }).catch(() => {})
    }
    clearPendingJob()
    throw err
  }
}

// Waits POLL_MS, or less if the visitor comes back to the tab: timers are
// paused while a phone is locked, so check as soon as it's visible again.
function nextCheck(signal) {
  return new Promise((resolve, reject) => {
    const done = () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      signal?.removeEventListener('abort', onAbort)
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        done()
        resolve()
      }
    }
    const onAbort = () => {
      done()
      reject(new DOMException('Aborted', 'AbortError'))
    }
    const timer = setTimeout(() => {
      done()
      resolve()
    }, POLL_MS)
    document.addEventListener('visibilitychange', onVisible)
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

async function callApi(url, options) {
  let res
  try {
    res = await fetch(url, options)
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new Error('Couldn’t reach StudyPack. Check your connection and try again.')
  }
  let data = null
  try {
    data = await res.json()
  } catch {
    // handled below
  }
  if (!res.ok || !data || data.error) {
    const err = new Error(data?.error || `Something went wrong (${res.status}). Please try again.`)
    // A job reported as failed comes back 200 with { status: 'error' }; that's
    // a result, not a failed request, so let the caller read it.
    if (res.ok && data?.status === 'error') return data
    // 5xx can be a passing hiccup (e.g. the store briefly unreachable), so
    // polling retries those; 4xx (expired, invalid) is final.
    err.fromServer = res.status < 500
    throw err
  }
  return data
}

function savePendingJob(job) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(job))
  } catch {
    // Without storage we can't resume after a reload, but polling still works.
  }
}

function clearPendingJob() {
  try {
    localStorage.removeItem(PENDING_KEY)
  } catch {
    // ignore
  }
}
