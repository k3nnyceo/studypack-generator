// Legacy build polyfills newer JS features (e.g. Uint8Array.toHex) for older browsers.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export { pdfjs }

// Opens a PDF File or Blob. `destroy` frees the worker's copy of it.
export async function loadPdf(file) {
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) })
  const doc = await task.promise
  return { doc, destroy: () => task.destroy() }
}
