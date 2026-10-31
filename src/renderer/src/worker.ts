import * as pdfjs from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { WorkerPage, WorkerRequest } from '@shared/ipc'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

/** Longest side for pages sent to the vision model. */
const OCR_MAX_PX = 1800
const THUMB_WIDTH = 360

async function canvasToPng(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Uint8Array> {
  const blob =
    canvas instanceof OffscreenCanvas
      ? await canvas.convertToBlob({ type: 'image/png' })
      : await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

function scaledCanvas(width: number, height: number, maxSide: number): { canvas: OffscreenCanvas; scale: number } {
  const scale = Math.min(1, maxSide / Math.max(width, height))
  return { canvas: new OffscreenCanvas(Math.round(width * scale), Math.round(height * scale)), scale }
}

async function renderPdfPage(page: pdfjs.PDFPageProxy, targetMaxPx: number): Promise<Uint8Array> {
  const base = page.getViewport({ scale: 1 })
  const scale = targetMaxPx / Math.max(base.width, base.height)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(viewport.width)
  canvas.height = Math.round(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, canvasContext: ctx, viewport }).promise
  return canvasToPng(canvas)
}

async function handlePdf(req: WorkerRequest): Promise<{ pages: WorkerPage[]; thumbnail?: Uint8Array }> {
  const task = pdfjs.getDocument({
    data: req.data,
    wasmUrl: './pdfjs/wasm/',
    cMapUrl: './pdfjs/cmaps/',
    standardFontDataUrl: './pdfjs/standard_fonts/'
  })
  const doc = await task.promise
  try {
    const pages: WorkerPage[] = []
    let thumbnail: Uint8Array | undefined
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const text = content.items
        .map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : ' ') : ''))
        .join('')
        .replace(/[ \t]+\n/g, '\n')
      const entry: WorkerPage = { text }
      if (req.renderPages && i <= req.maxPages) entry.png = await renderPdfPage(page, OCR_MAX_PX)
      if (i === 1) {
        const base = page.getViewport({ scale: 1 })
        thumbnail = await renderPdfPage(page, Math.max(base.width, base.height) * (THUMB_WIDTH / base.width))
      }
      pages.push(entry)
      page.cleanup()
    }
    return { pages, thumbnail }
  } finally {
    await task.destroy()
  }
}

async function handleImage(req: WorkerRequest): Promise<{ pages: WorkerPage[]; thumbnail?: Uint8Array }> {
  const bitmap = await createImageBitmap(new Blob([req.data as BlobPart]))
  const draw = async (maxSide: number): Promise<Uint8Array> => {
    const { canvas } = scaledCanvas(bitmap.width, bitmap.height, maxSide)
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    return canvasToPng(canvas)
  }
  const page: WorkerPage = { text: '' }
  if (req.renderPages) page.png = await draw(OCR_MAX_PX)
  const thumbMax = Math.max(bitmap.width, bitmap.height) * (THUMB_WIDTH / bitmap.width)
  const thumbnail = await draw(thumbMax)
  bitmap.close()
  return { pages: [page], thumbnail }
}

window.worker.onJob(async (req) => {
  try {
    const result = req.kind === 'pdf' ? await handlePdf(req) : await handleImage(req)
    window.worker.reply({ jobId: req.jobId, ...result })
  } catch (err) {
    window.worker.reply({ jobId: req.jobId, error: (err as Error).message ?? String(err) })
  }
})
window.worker.ready()
