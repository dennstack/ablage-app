import type { WorkerBridge } from './workerBridge'
import { visionOcr } from './vision'

/** Below this many characters per page the text layer is treated as missing. */
const MIN_CHARS_PER_PAGE = 50
const MAX_VISION_PAGES = 10

export type FileKind = 'pdf' | 'image' | 'other'

const imageExt = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'])

export function fileKind(ext: string): FileKind {
  const e = ext.toLowerCase()
  if (e === '.pdf') return 'pdf'
  if (imageExt.has(e)) return 'image'
  return 'other'
}

export function mimeFor(ext: string): string {
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.gif': 'image/gif',
    '.txt': 'text/plain',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  }
  return map[ext.toLowerCase()] ?? 'application/octet-stream'
}

export interface ExtractResult {
  text: string
  source: 'pdf-text' | 'ollama-vision' | 'plain' | 'none'
}

export interface ExtractHooks {
  onProgress?: (msg: string) => void
  /** Called as soon as a thumbnail exists, even if OCR fails afterwards. */
  onThumbnail?: (png: Uint8Array) => Promise<void>
}

export interface VisionConfig {
  url: string
  model: string
}

export async function extractText(
  worker: WorkerBridge,
  data: Uint8Array,
  ext: string,
  vision: VisionConfig,
  hooks: ExtractHooks = {}
): Promise<ExtractResult> {
  const kind = fileKind(ext)
  if (ext.toLowerCase() === '.txt') return { text: Buffer.from(data).toString('utf8'), source: 'plain' }
  if (kind === 'other') return { text: '', source: 'none' }

  if (kind === 'pdf') {
    const first = await worker.run({ kind, data, renderPages: false, maxPages: 0 })
    if (first.thumbnail) await hooks.onThumbnail?.(first.thumbnail)
    const text = joinPages(first.pages.map((p) => p.text))
    const pageCount = Math.max(first.pages.length, 1)
    if (text.replace(/\s/g, '').length / pageCount >= MIN_CHARS_PER_PAGE) {
      return { text, source: 'pdf-text' }
    }
    const rendered = await worker.run({ kind, data, renderPages: true, maxPages: MAX_VISION_PAGES })
    const ocr = await visionPages(rendered.pages.map((p) => p.png), vision, hooks.onProgress)
    return { text: ocr, source: 'ollama-vision' }
  }

  const rendered = await worker.run({ kind, data, renderPages: true, maxPages: 1 })
  if (rendered.thumbnail) await hooks.onThumbnail?.(rendered.thumbnail)
  const ocr = await visionPages(rendered.pages.map((p) => p.png), vision, hooks.onProgress)
  return { text: ocr, source: 'ollama-vision' }
}

async function visionPages(
  pngs: (Uint8Array | undefined)[],
  vision: VisionConfig,
  onProgress?: (msg: string) => void
): Promise<string> {
  const texts: string[] = []
  for (const [i, png] of pngs.entries()) {
    if (!png) continue
    onProgress?.(`Texterkennung Seite ${i + 1}/${pngs.length}`)
    texts.push(await visionOcr(vision.url, vision.model, png))
  }
  return joinPages(texts)
}

function joinPages(pages: string[]): string {
  return pages.map((p) => p.trim()).filter(Boolean).join('\n\n')
}
