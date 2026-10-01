// Picks up a file shared into the installed app from another app's Share menu.
// public/sw.js receives the share, parks the file in the Cache API and opens
// the page with ?share=<status>. Must match the names used there.
const SHARE_CACHE = 'studypack-share-v1'
const SHARED_FILE_URL = '/shared-file'

// Resolves to null (nothing was shared), { file }, or { error }.
export async function takeSharedFile() {
  const params = new URLSearchParams(window.location.search)
  const status = params.get('share')
  if (!status) return null
  // Drop ?share from the address bar so a refresh doesn't re-run it.
  params.delete('share')
  const query = params.toString()
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`)

  const failed = { error: 'The shared file didn’t come through. Please try sharing it again.' }
  if (status !== '1' || !('caches' in window)) return failed
  try {
    const cache = await caches.open(SHARE_CACHE)
    const res = await cache.match(SHARED_FILE_URL)
    if (!res) return failed
    await cache.delete(SHARED_FILE_URL)
    const blob = await res.blob()
    const name = decodeURIComponent(res.headers.get('X-File-Name') || '') || 'Shared file'
    return { file: new File([blob], name, { type: blob.type }) }
  } catch {
    return failed
  }
}
