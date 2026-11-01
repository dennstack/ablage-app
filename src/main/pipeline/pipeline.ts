import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import type { CategorySaveResult, Document, DocumentPatch, ImportResult, Settings } from '@shared/types'
import type { Categories } from '../categories'
import type { Classifier } from '../classifier/types'
import type { DocumentRepo } from '../db/documents'
import { now } from '../db'
import { DIRS, type Library } from '../library/library'
import { renderTemplate, stripExtension } from '../lib/naming'
import { extractText, mimeFor } from '../ocr/extract'
import type { WorkerBridge } from '../ocr/workerBridge'
import { Gate, SerialQueue } from './queue'

/** Journal key for `.ablage/references.json`; document keys are UUIDs. */
export const REFERENCES_SYNC_KEY = 'references'

export interface PipelineDeps {
  docs: DocumentRepo
  categories: Categories
  worker: WorkerBridge
  library: () => Library
  settings: () => Settings
  classifier: () => Classifier
  thumbsDir: string
  notify: (id: string) => void
  saveReferences: () => Promise<void>
}

export class Pipeline {
  private queue = new SerialQueue()
  private gate = new Gate()
  private stopping = false

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

  importFile(src: string, move: boolean): Promise<ImportResult> {
    return this.gate.shared(() => this.doImportFile(src, move))
  }

  private async doImportFile(src: string, move: boolean): Promise<ImportResult> {
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
    this.queue.push(`${mode}:${id}`, () => this.gate.shared(() => this.process(id, mode)))
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
    if (this.stopping) return
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
      // Shutdown tears down the worker; the document resumes on next launch.
      if (this.stopping) return
      console.error(`processing ${id} failed:`, err)
      const failed = this.setStatus(id, 'error', (err as Error).message)
      await library.writeSidecar(failed).catch(() => undefined)
    }
  }

  /** Moves first, so a failed move leaves the document, its DB row and its sidecar untouched. */
  updateMetadata(id: string, patch: DocumentPatch): Promise<Document> {
    return this.gate.shared(async () => {
      const library = this.d.library()
      const before = this.d.docs.get(id)
      if (!before) throw new Error(`document ${id} not found`)
      const rel = before.deleted_at ? before.relative_path : await library.relocate(before.relative_path, this.targetBase({ ...before, ...patch }))
      const doc = this.d.docs.update(id, rel === before.relative_path ? patch : { ...patch, relative_path: rel })
      try {
        await library.writeSidecar(doc)
        this.d.docs.clearPending(id)
      } catch (err) {
        this.d.docs.markPending([id])
        throw err
      }
      this.d.notify(id)
      return doc
    })
  }

  /** Blocks all file and document changes while `fn` runs. */
  exclusive<T>(fn: () => Promise<T>): Promise<T> {
    return this.gate.exclusive(fn)
  }

  /** Works off the journal; entries that fail stay for the next attempt. Caller holds `exclusive`. */
  async syncPending(): Promise<CategorySaveResult> {
    const result: CategorySaveResult = { moved: 0, failed: [] }
    for (const key of this.d.docs.pendingKeys()) {
      if (this.stopping) break
      if (key === REFERENCES_SYNC_KEY) {
        try {
          await this.d.saveReferences()
          this.d.docs.clearPending(key)
        } catch (err) {
          result.failed.push({ id: key, title: 'Referenzliste', message: (err as Error).message })
        }
        continue
      }
      const before = this.d.docs.get(key)
      if (!before) {
        this.d.docs.clearPending(key)
        continue
      }
      try {
        if (await this.syncDocument(before)) result.moved++
      } catch (err) {
        result.failed.push({ id: key, title: before.title, message: (err as Error).message })
      }
      this.d.notify(key)
    }
    return result
  }

  /** The sidecar is written even after a failed move: a rebuild must not restore a deleted category. */
  private async syncDocument(before: Document): Promise<boolean> {
    const library = this.d.library()
    let doc = before
    let moveError: Error | null = null
    if (!doc.deleted_at) {
      try {
        const rel = await library.relocate(await this.locate(doc), this.targetBase(doc))
        if (rel !== doc.relative_path) doc = this.d.docs.update(doc.id, { relative_path: rel })
      } catch (err) {
        moveError = err as Error
      }
    }
    await library.writeSidecar(doc)
    if (moveError) throw moveError
    this.d.docs.clearPending(doc.id)
    return doc.relative_path !== before.relative_path
  }

  /** A crash can land between moving a file and recording its new path. */
  private async locate(doc: Document): Promise<string> {
    const library = this.d.library()
    if (await library.fileExists(doc.relative_path)) return doc.relative_path
    const candidate = `${this.targetBase(doc)}${extname(doc.relative_path)}`
    if (!(await library.fileExists(candidate))) return doc.relative_path
    const hash = createHash('sha256').update(await readFile(library.abs(candidate))).digest('hex')
    return hash === doc.file_hash ? candidate : doc.relative_path
  }

  /** Retries what a previous session left in the journal. */
  resumeSync(): void {
    if (this.d.docs.pendingKeys().length === 0) return
    void this.exclusive(() => this.syncPending()).catch((err) => console.error('resuming sync failed:', err))
  }

  trash(id: string): Promise<void> {
    return this.gate.shared(async () => {
      const doc = this.d.docs.get(id)
      if (!doc || doc.deleted_at) return
      const library = this.d.library()
      const rel = await library.moveToTrash(doc.relative_path, id)
      const updated = this.d.docs.update(id, { relative_path: rel, deleted_at: now() })
      await library.writeSidecar(updated)
      this.d.notify(id)
    })
  }

  restore(id: string): Promise<void> {
    return this.gate.shared(async () => {
      const doc = this.d.docs.get(id)
      if (!doc || !doc.deleted_at) return
      const library = this.d.library()
      const rel = await library.relocate(doc.relative_path, this.targetBase(doc))
      const updated = this.d.docs.update(id, { relative_path: rel, deleted_at: null })
      await library.writeSidecar(updated)
      this.d.notify(id)
    })
  }

  purge(id: string): Promise<void> {
    return this.gate.shared(async () => {
      const doc = this.d.docs.get(id)
      if (!doc) return
      const library = this.d.library()
      await library.deleteFile(doc.relative_path)
      await library.deleteSidecar(id)
      await rm(this.thumbPath(id), { force: true })
      this.d.docs.remove(id)
      this.d.notify(id)
    })
  }

  /** Stops after the current document; the journal resumes the rest on next launch. */
  shutdown(): Promise<void> {
    this.stopping = true
    return this.gate.exclusive(async () => undefined)
  }
}
