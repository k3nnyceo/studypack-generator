// Asks a question about a pack (/api/ask, server/ask.js) and streams the
// answer: onText(piece) for each piece as it's written. Resolves to the whole
// answer. A refusal (signed out, plan limit) throws an Error with `status`,
// and for a plan limit `reason` and `resetsAt`, like generating a pack.
export async function askAboutPack({ question, history, context, kind, title, signal, onText }) {
  let res
  try {
    res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history, context, kind, title }),
      signal,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new Error('Couldn’t reach StudyPack. Check your connection and try again.')
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => null)
    const err = new Error(data?.error || `Something went wrong (${res.status}). Please try again.`)
    err.status = res.status
    err.reason = data?.reason
    err.resetsAt = data?.resetsAt
    throw err
  }

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  let answer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (value) buffer += value
    const lines = buffer.split('\n')
    buffer = done ? '' : lines.pop()
    for (const line of lines) {
      if (!line.trim()) continue
      const message = JSON.parse(line)
      if (message.error) throw new Error(message.error)
      if (message.text) {
        answer += message.text
        onText?.(message.text)
      }
    }
    if (done) break
  }
  return answer
}
