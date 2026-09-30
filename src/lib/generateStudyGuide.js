import { validateStudyGuide } from './studyGuideFormat.js'

// Only used when AI_GENERATION_ENABLED is on (src/config.js).
// Sends extracted lecture text to the StudyPack API, which calls Claude.
// Resolves to { guide, remaining }: a validated guide in the format defined in
// studyGuideFormat.js, and how many free guides the visitor has left today.
export async function generateStudyGuide({ text, fileName, signal }) {
  let res
  try {
    res = await fetch('/api/study-guide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, fileName }),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new Error('Couldn’t reach StudyPack. Check your connection and try again.')
  }

  // The server keeps the connection alive with spaces while Claude works, then
  // sends the JSON; errors that happen after that arrive as { error }.
  const raw = await res.text()
  let data = null
  try {
    data = JSON.parse(raw)
  } catch {
    // handled below
  }
  if (!res.ok || !data || data.error) {
    throw new Error(data?.error || `Something went wrong (${res.status}). Please try again.`)
  }

  const result = validateStudyGuide(data)
  if (!result.ok) {
    console.error('Invalid study guide from server:', result.errors)
    throw new Error('The study guide came back in an unexpected format. Please try again.')
  }
  const remaining = Number(res.headers.get('X-Guides-Remaining'))
  return { guide: result.guide, remaining: Number.isFinite(remaining) ? remaining : null }
}
