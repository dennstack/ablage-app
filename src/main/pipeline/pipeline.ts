import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { Document, DocumentPatch, ImportResult, Settings } from '@shared/types'
import type { Categories } from '../categories'
import type { Classifier } from '../classifier/types'
import type { DocumentRepo } from '../db/documents'
import { now } from '../db'
import { DIRS, type Library } from '../library/library'
import { renderTemplate, stripExtension } from '../lib/naming'
import { extractText, mimeFor } from '../ocr/extract'
import type { WorkerBridge } from '../ocr/workerBridge'
import { SerialQueue } from './queue'

export interface PipelineDeps {
  docs: DocumentRepo
  categories: Categories
  worker: WorkerBridge
  library: () => Library
  settings: () => Settings
  classifier: () => Classifier
  thumbsDir: string
  notify: (id: string) => void
}

export class Pipeline {
  private queue = new SerialQueue()

  constructor(private d: PipelineDeps) {}

  thumbPath(id: string): string {
    return join(this.d.thumbsDir, `${id}.png`)
  }

  /** Relative path (without extension) a document should live at. */
  targetBase(doc: Pick<Document, 'id' | 'category_id' | 'doc_date' | 'sender' | 'title'>): string {
    const top = this.d.categories.topLevel(doc.category_id)
    const rendered = renderTemplate(this.d.settings().pathTemplate, {
      category: top?.label ?? doc.category_id,
      date: doc.doc_date,
      sender: doc.sender,
      title: doc.title,
      id: doc.id
    })
    return `${DIRS.documents}/${rendered}`
  }

  async importFile(src: string, move: boolean): Promise<ImportResult> {
    const file = basename(src)
    const library = this.d.library()
    try {
      const data = await readFile(src)
      const hash = createHash('sha256').update(data).digest('hex')
      const existing = this.d.docs.findByHash(hash)
      if (existing) {
        if (move) await library.moveInboxFile(src, DIRS.inboxDuplicates)
        return { file, status: 'duplicate', existing_id: existing.id, existing_title: existing.title }
      }

      const ext = extname(file).toLowerCase()
      const ts = now()
      const doc: Document = {
        id: randomUUID(),
        title: stripExtension(file),
        category_id: 'sonstiges',
        status: 'pending',
        status_message: null,
        ocr_text: null,
        ocr_source: null,
        relative_path: '',
        file_hash: hash,
        original_filename: file,
        mime_type: mimeFor(ext),
        doc_date: null,
        sender: null,
        amount: null,
        classifier_source: null,
        classifier_response: null,
        created_at: ts,
        updated_at: ts,
        deleted_at: null
      }
      doc.relative_path = await library.place(src, this.targetBase(doc), ext, move)
      this.d.docs.insert(doc)
      await library.writeSidecar(doc)
      this.d.notify(doc.id)
      this.enqueue(doc.id, 'full')
      return { file, status: 'queued', id: doc.id }
    } catch (err) {
      if (move) await library.moveInboxFile(src, DIRS.inboxFailed).catch(() => undefined)
      return { file, status: 'error', error: (err as Error).message }
    }
  }

  enqueue(id: string, mode: 'full' | 'classify'): void {
    this.queue.push(`${mode}:${id}`, () => this.process(id, mode))
  }

  resumeUnfinished(): void {
    for (const id of this.d.docs.listUnfinished()) this.enqueue(id, 'full')
  }

  private setStatus(id: string, status: Document['status'], message: string | null): Document {
    const doc = this.d.docs.update(id, { status, status_message: message })
    this.d.notify(id)
    return doc
  }

  private async process(id: string, mode: 'full' | 'classify'): Promise<void> {
    let doc = this.d.docs.get(id)
    if (!doc || doc.deleted_at) return
    const library = this.d.library()
    const settings = this.d.settings()

    try {
      let text = doc.ocr_text ?? ''
      if (mode === 'full' || !doc.ocr_text) {
        doc = this.setStatus(id, 'processing', 'Text wird extrahiert')
        const data = new Uint8Array(await readFile(library.abs(doc.relative_path)))
        const extracted = await extractText(
          this.d.worker,
          data,
          extname(doc.relative_path),
          { url: settings.ollamaUrl, model: settings.ollamaVisionModel },
          {
            onProgress: (msg) => this.setStatus(id, 'processing', msg),
            onThumbnail: async (png) => {
              await mkdir(this.d.thumbsDir, { recursive: true })
              await writeFile(this.thumbPath(id), png)
            }
          }
        )
        text = extracted.text
        doc = this.d.docs.update(id, { ocr_text: text || null, ocr_source: extracted.source })
      }

      if (!text.trim()) {
        doc = this.d.docs.update(id, { status: 'done', status_message: 'Kein Text erkannt – bitte manuell einordnen' })
        await library.writeSidecar(doc)
        this.d.notify(id)
        return
      }

      this.setStatus(id, 'processing', 'Wird klassifiziert')
      const result = await this.d.classifier().classify(text)
      const category = this.d.categories.isKnown(result.category_id) ? result.category_id : 'sonstiges'
      const sender = result.sender ?? doc.sender
      const docDate = result.doc_date ?? doc.doc_date
      // without an LLM title keep the filename; date and sender are already part of the path template
      const title = result.title ?? doc.title
      const next = { ...doc, category_id: category, sender, doc_date: docDate, title }

      const rel = await library.relocate(doc.relative_path, this.targetBase(next))
      doc = this.d.docs.update(id, {
        category_id: category,
        sender,
        doc_date: docDate,
        amount: result.amount ?? doc.amount,
        title,
        relative_path: rel,
        classifier_source: result.source,
        classifier_response: JSON.stringify(result, null, 2),
        status: 'done',
        status_message: null
      })
      await library.writeSidecar(doc)
      this.d.notify(id)
    } catch (err) {
      console.error(`processing ${id} failed:`, err)
      const failed = this.setStatus(id, 'error', (err as Error).message)
      await library.writeSidecar(failed).catch(() => undefined)
    }
  }

  async updateMetadata(id: string, patch: DocumentPatch): Promise<Document> {
    const library = this.d.library()
    let doc = this.d.docs.update(id, patch)
    if (!doc.deleted_at) {
      const rel = await library.relocate(doc.relative_path, this.targetBase(doc))
      if (rel !== doc.relative_path) doc = this.d.docs.update(id, { relative_path: rel })
    }
    await library.writeSidecar(doc)
    this.d.notify(id)
    return doc
  }

  async trash(id: string): Promise<void> {
    const doc = this.d.docs.get(id)
    if (!doc || doc.deleted_at) return
    const library = this.d.library()
    const rel = await library.moveToTrash(doc.relative_path, id)
    const updated = this.d.docs.update(id, { relative_path: rel, deleted_at: now() })
    await library.writeSidecar(updated)
    this.d.notify(id)
  }

  async restore(id: string): Promise<void> {
    const doc = this.d.docs.get(id)
    if (!doc || !doc.deleted_at) return
    const library = this.d.library()
    const rel = await library.relocate(doc.relative_path, this.targetBase(doc))
    const updated = this.d.docs.update(id, { relative_path: rel, deleted_at: null })
    await library.writeSidecar(updated)
    this.d.notify(id)
  }

  async purge(id: string): Promise<void> {
    const doc = this.d.docs.get(id)
    if (!doc) return
    const library = this.d.library()
    await library.deleteFile(doc.relative_path)
    await library.deleteSidecar(id)
    await rm(this.thumbPath(id), { force: true })
    this.d.docs.remove(id)
    this.d.notify(id)
  }

  idle(): Promise<void> {
    return this.queue.idle()
  }
}
