// A part of the app that's loaded on demand failed to download: almost always
// because StudyPack was updated while the page was open, and the old
// version's files are no longer on the server (public/sw.js keeps recent
// versions' files, but not on a first visit or in a browser without it).
// Messages differ by browser: Chrome "Failed to fetch dynamically imported
// module", Firefox "error loading dynamically imported module", Safari
// "Importing a module script failed", and Vite's own preload error.
export function isStaleBuildError(error) {
  const message = String(error?.message ?? error ?? '')
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS|ChunkLoadError|Loading chunk/i.test(message)
}

export const STALE_BUILD_MESSAGE = 'StudyPack has been updated since this page was opened. Reload the page, then try again.'

// For errors shown to students: the stale-build case in plain words.
export const friendlyError = (error, fallback) => (isStaleBuildError(error) ? STALE_BUILD_MESSAGE : error?.message || fallback)
