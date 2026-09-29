import { validateStudyGuide } from './studyGuideFormat.js'

// Only used when AI_GENERATION_ENABLED is on (src/config.js).
// Sends extracted lecture text to the StudyPack API, which calls Claude.
// Resolves to a validated guide in the format defined in studyGuideFormat.js.
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
    throw new Error('Couldn’t reach the StudyPack server. Is it running?')
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(data?.error || `The server returned an error (${res.status}).`)
  }
  const result = validateStudyGuide(data)
  if (!result.ok) {
    console.error('Invalid study guide from server:', result.errors)
    throw new Error('The server returned a study guide in an unexpected format.')
  }
  return result.guide
}
