import { join } from 'node:path'
import type { Settings } from '@shared/types'
import { Categories } from './categories'
import { FallbackClassifier } from './classifier/fallback'
import { OllamaClassifier } from './classifier/ollama'
import { RulesClassifier } from './classifier/rules'
import type { Classifier } from './classifier/types'
import { type Db, openDb } from './db'
import { DocumentRepo } from './db/documents'
import { ReferenceRepo } from './db/references'
import { DIRS, Library } from './library/library'
import { rebuildFromLibrary, writeReferencesSnapshot } from './library/rebuild'
import { WorkerBridge } from './ocr/workerBridge'
import { InboxWatcher } from './pipeline/inbox'
import { Pipeline } from './pipeline/pipeline'
import { SettingsStore } from './settings'

export interface ContextOptions {
  userData: string
  bundledCategories: string
  notify: (id: string) => void
}

/** Wires all main-process services together. */
export class AppContext {
  readonly settings: SettingsStore
  readonly db: Db
  readonly docs: DocumentRepo
  readonly refs: ReferenceRepo
  readonly categories: Categories
  readonly worker = new WorkerBridge()
  readonly pipeline: Pipeline
  readonly inbox: InboxWatcher
  private lib: Library | null = null

  constructor(opts: ContextOptions) {
    this.settings = new SettingsStore(opts.userData)
    this.db = openDb(join(opts.userData, 'ablage.db'))
    this.docs = new DocumentRepo(this.db)
    this.refs = new ReferenceRepo(this.db)
    this.categories = new Categories(join(opts.userData, 'categories.yaml'), opts.bundledCategories)

    const rules = new RulesClassifier(() => this.categories.all())
    const ollama = new OllamaClassifier(
      () => ({ url: this.settings.get().ollamaUrl, model: this.settings.get().ollamaModel }),
      () => this.categories.all()
    )
    const fallback = new FallbackClassifier(ollama, rules)

    this.pipeline = new Pipeline({
      docs: this.docs,
      categories: this.categories,
      worker: this.worker,
      library: () => this.library(),
      settings: () => this.settings.get(),
      classifier: (): Classifier => (this.settings.get().classifierMode === 'ollama' ? fallback : rules),
      thumbsDir: join(opts.userData, 'thumbs'),
      notify: opts.notify
    })

    this.inbox = new InboxWatcher(
      () => (this.lib ? this.lib.abs(DIRS.inbox) : null),
      () => this.settings.get().inboxPollSeconds,
      (path) => this.pipeline.importFile(path, true)
    )
  }

  async start(): Promise<void> {
    const path = this.settings.get().libraryPath
    if (path) {
      try {
        this.lib = new Library(path)
        await this.lib.ensure()
      } catch (err) {
        console.error('library not available:', err)
        this.lib = null
      }
    }
    if (this.lib) this.pipeline.resumeUnfinished()
    this.applyWatcher()
  }

  hasLibrary(): boolean {
    return this.lib !== null
  }

  library(): Library {
    if (!this.lib) throw new Error('Kein Bibliotheksordner konfiguriert oder nicht erreichbar')
    return this.lib
  }

  /** Switches to another library folder and rebuilds the DB from its sidecars. */
  async setLibrary(path: string): Promise<void> {
    const next = new Library(path)
    await next.ensure()
    await this.pipeline.idle()
    this.lib = next
    this.settings.update({ libraryPath: path })
    await rebuildFromLibrary(this.db, this.docs, next)
    this.applyWatcher()
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const s = this.settings.update(patch)
    this.applyWatcher()
    return s
  }

  async saveReferences(): Promise<void> {
    if (this.lib) await writeReferencesSnapshot(this.db, this.lib)
  }

  private applyWatcher(): void {
    if (this.lib && this.settings.get().watchInbox) this.inbox.start()
    else this.inbox.stop()
  }

  dispose(): void {
    this.inbox.stop()
    this.worker.destroy()
    this.db.close()
  }
}
