import { useEffect, useState } from 'react'

// The diagram pages of the notes on screen (src/lib/diagramPages.js), found on
// the device as soon as a PDF or PowerPoint is read: [] when there are none,
// null while looking. Loaded on demand so the landing page doesn't pay for it.
export function useDiagramPages(result) {
  const [found, setFound] = useState({ result: null, pages: [] })
  const eligible = Boolean(result?.file) && ['pdf', 'pptx'].includes(result?.type) && !result?.scanned

  useEffect(() => {
    if (!eligible) return
    const controller = new AbortController()
    import('./diagramPages.js')
      .then(({ findDiagramPages }) => findDiagramPages(result, { signal: controller.signal }))
      .then((pages) => setFound({ result, pages }))
      .catch((err) => {
        if (err.name !== 'AbortError') {
          console.warn('Couldn’t look for diagram pages:', err)
          setFound({ result, pages: [] })
        }
      })
    return () => controller.abort()
  }, [result, eligible])

  if (!eligible) return []
  return found.result === result ? found.pages : null
}

// Renders the first `limit` diagram pages for sending, best first.
export async function prepareDiagramPages(result, pages, limit, { signal } = {}) {
  if (!pages?.length || limit <= 0) return []
  const { renderDiagramPages } = await import('./diagramPages.js')
  return renderDiagramPages(result, pages.slice(0, limit), { signal })
}
