import type {
  Category,
  CategorySaveInput,
  CategorySaveResult,
  CategoryUsage,
  DashboardData,
  Document,
  DocumentPage,
  DocumentPatch,
  DocumentQuery,
  FolderInput,
  ImportResult,
  ModelTestResult,
  OllamaStatus,
  PhysicalFolder,
  PhysicalFolderWithCount,
  PhysicalReference,
  RebuildResult,
  ReferenceInput,
  Settings
} from './types'

/** Every method maps 1:1 to an `ipcMain.handle(<name>)` channel. */
export interface AblageApi {
  'settings:get'(): Settings
  'settings:update'(patch: Partial<Settings>): Settings
  'settings:pickLibrary'(): string | null
  'settings:testOllama'(): OllamaStatus
  'settings:testModels'(samplePng: Uint8Array): ModelTestResult
  'settings:openOllamaDownload'(): void
  'settings:openLibrary'(): void

  'categories:list'(): Category[]
  'categories:openFile'(): void
  'categories:usage'(): Record<string, CategoryUsage>
  'categories:save'(input: CategorySaveInput): CategorySaveResult

  'dashboard:get'(): DashboardData

  'documents:list'(query: DocumentQuery): DocumentPage
  'documents:get'(id: string): Document | null
  'documents:update'(id: string, patch: DocumentPatch): Document
  'documents:delete'(id: string): void
  'documents:reprocess'(id: string): void
  'documents:reclassify'(id: string): void
  'documents:showInFolder'(id: string): void
  'documents:openExternal'(id: string): void
  'documents:pickAndImport'(): ImportResult[]
  'documents:importPaths'(paths: string[]): ImportResult[]
  'documents:suggestions'(prefix: string): string[]

  'trash:list'(): DocumentPage
  'trash:restore'(id: string): void
  'trash:purge'(id: string): void

  'library:rebuild'(): RebuildResult

  'folders:list'(): PhysicalFolderWithCount[]
  'folders:create'(input: FolderInput): PhysicalFolder
  'folders:delete'(code: string): void
  'references:list'(folderCode?: string): PhysicalReference[]
  'references:create'(input: ReferenceInput): PhysicalReference
  'references:update'(id: string, patch: Partial<ReferenceInput>): PhysicalReference
  'references:delete'(id: string): void
  'references:generateCode'(): string
}

export type Channel = keyof AblageApi

export const channels: Channel[] = [
  'settings:get',
  'settings:update',
  'settings:pickLibrary',
  'settings:testOllama',
  'settings:testModels',
  'settings:openOllamaDownload',
  'settings:openLibrary',
  'categories:list',
  'categories:openFile',
  'categories:usage',
  'categories:save',
  'dashboard:get',
  'documents:list',
  'documents:get',
  'documents:update',
  'documents:delete',
  'documents:reprocess',
  'documents:reclassify',
  'documents:showInFolder',
  'documents:openExternal',
  'documents:pickAndImport',
  'documents:importPaths',
  'documents:suggestions',
  'trash:list',
  'trash:restore',
  'trash:purge',
  'library:rebuild',
  'folders:list',
  'folders:create',
  'folders:delete',
  'references:list',
  'references:create',
  'references:update',
  'references:delete',
  'references:generateCode'
]

/** Main → renderer events. */
export interface AblageEvents {
  'documents:changed': { id: string }
}

export type Promisified<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => infer R ? (...args: A) => Promise<Awaited<R>> : never
}

export interface AblageBridge {
  invoke: Promisified<AblageApi>
  on<E extends keyof AblageEvents>(event: E, cb: (payload: AblageEvents[E]) => void): () => void
  /** Resolves the absolute path of a dropped File (Electron webUtils). */
  pathForFile(file: File): string
}

/** Worker window protocol (main ↔ hidden pdf renderer). */
export interface WorkerRequest {
  jobId: string
  kind: 'pdf' | 'image'
  data: Uint8Array
  /** Render pages to PNG for vision OCR. */
  renderPages: boolean
  maxPages: number
}

export interface WorkerPage {
  text: string
  png?: Uint8Array
}

export interface WorkerResponse {
  jobId: string
  pages?: WorkerPage[]
  thumbnail?: Uint8Array
  error?: string
}
