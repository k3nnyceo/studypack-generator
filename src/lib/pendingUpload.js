// Phones can discard and reload the page while the file picker is open (to
// free memory for the picker), or crash it while a large file is being read.
// Either way the file is silently lost and the visitor lands back on the home
// page. A marker in sessionStorage survives that reload, so the next load can
// explain what happened.
const KEY = 'studypack.pendingUpload.v1'
const MAX_AGE_MS = 10 * 60 * 1000

// stage: 'picking' (file picker open) | 'reading' (parsing the chosen file)
export function markPendingUpload(stage) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ stage, at: Date.now() }))
  } catch {
    // Storage blocked: we just lose the explanation, not the upload.
  }
}

export function clearPendingUpload() {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

// Called once on page load. Returns a message if the previous page load was
// interrupted mid-upload, otherwise null. Clears the marker either way.
export function takeInterruptedUploadMessage() {
  let pending = null
  try {
    pending = JSON.parse(sessionStorage.getItem(KEY) ?? 'null')
    sessionStorage.removeItem(KEY)
  } catch {
    return null
  }
  if (!pending || !(Date.now() - pending.at < MAX_AGE_MS)) return null
  if (pending.stage === 'reading') {
    return 'StudyPack stopped while reading your file, probably because it was too big for this phone’s memory. Close other apps and tabs and try again, or try a smaller file.'
  }
  if (pending.stage === 'picking') {
    return 'Your browser reloaded StudyPack while you were choosing a file, so the file didn’t come through. This usually means the phone was low on memory: close other apps and tabs, then try again.'
  }
  return null
}
