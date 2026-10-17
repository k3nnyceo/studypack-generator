// Object URLs for pictures in the source viewer, shared and reference
// counted: an image asks for its URL when it scrolls near the screen and
// gives it back when it scrolls away. A URL nobody holds is revoked after a
// short grace period (so scrolling back and forth doesn't rebuild it), and
// every URL is revoked when the viewer closes. A closed store can be used
// again (React runs effect cleanups twice in development), and loads that
// were in flight when it closed are dropped.
const GRACE_MS = 4000

export function createUrlStore() {
  const entries = new Map() // key -> { url, promise, holders, timer }

  return {
    async acquire(key, getBlob) {
      let entry = entries.get(key)
      if (!entry) {
        entry = { url: null, holders: 0, timer: null }
        entry.promise = Promise.resolve()
          .then(getBlob)
          .then((blob) => {
            if (entries.get(key) !== entry) return null
            entry.url = URL.createObjectURL(blob)
            return entry.url
          })
        entries.set(key, entry)
      }
      clearTimeout(entry.timer)
      entry.holders++
      return entry.promise
    },

    release(key) {
      const entry = entries.get(key)
      if (!entry) return
      entry.holders = Math.max(0, entry.holders - 1)
      if (entry.holders > 0) return
      clearTimeout(entry.timer)
      entry.timer = setTimeout(() => {
        if (entry.holders > 0) return
        entries.delete(key)
        if (entry.url) URL.revokeObjectURL(entry.url)
        else entry.promise.then((url) => url && URL.revokeObjectURL(url))
      }, GRACE_MS)
    },

    dispose() {
      for (const entry of entries.values()) {
        clearTimeout(entry.timer)
        if (entry.url) URL.revokeObjectURL(entry.url)
      }
      entries.clear()
    },
  }
}
