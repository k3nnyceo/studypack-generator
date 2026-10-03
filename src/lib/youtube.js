// YouTube lectures (server/youtube.js): the video's captions become notes,
// grouped into 5-minute sections labelled with their times.

const clock = (ms) => {
  const s = Math.round(ms / 1000)
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

// Resolves to a notes result (like parseDocument's). Errors carry
// reason/resetsAt for plan limits.
export async function youtubeNotes(url) {
  let res
  try {
    res = await fetch('/api/youtube', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
  } catch {
    throw new Error('Couldn’t reach StarterPack. Check your connection and try again.')
  }
  const data = await res.json().catch(() => null)
  if (!res.ok || !data) {
    const err = new Error(data?.error || `Something went wrong (${res.status}). Please try again.`)
    Object.assign(err, { status: res.status, reason: data?.reason, resetsAt: data?.resetsAt })
    throw err
  }
  const sections = data.sections.map((s, i) => ({ index: i + 1, title: `${clock(s.start)}–${clock(s.end)}`, text: s.text, notes: '' }))
  const fullText = sections.map((s) => `[${s.title}]\n${s.text}`).join('\n\n')
  return {
    fileName: data.title,
    type: 'video',
    youtube: { videoId: data.videoId, minutes: data.minutes, coveredMinutes: data.coveredMinutes, truncated: data.truncated },
    sections,
    fullText,
    wordCount: fullText.split(/\s+/).filter(Boolean).length,
  }
}
