// Legacy build polyfills newer JS features (e.g. Uint8Array.toHex) for older browsers.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

// Extracts text page by page. Returns one section per page.
export async function parsePdf(file) {
  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjs.getDocument({ data })
  const doc = await loadingTask.promise

  try {
    const sections = []
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum)
      const content = await page.getTextContent()

      let text = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        text += item.str
        text += item.hasEOL ? '\n' : ' '
      }

      sections.push({
        index: pageNum,
        title: '',
        text: normalize(text),
        notes: '',
      })
      page.cleanup()
    }
    return sections
  } finally {
    await loadingTask.destroy()
  }
}

function normalize(text) {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
