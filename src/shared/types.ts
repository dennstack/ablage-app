export type DocStatus = 'pending' | 'processing' | 'done' | 'error'

export interface Document {
  id: string
  title: string
  category_id: string
  status: DocStatus
  status_message: string | null
  ocr_text: string | null
  ocr_source: string | null
  relative_path: string
  file_hash: string
  original_filename: string
  mime_type: string
  doc_date: string | null
  sender: string | null
  amount: number | null
  classifier_source: string | null
  classifier_response: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface DocumentListItem extends Omit<Document, 'ocr_text' | 'classifier_response'> {
  snippet?: string
}

export type DocumentPatch = Partial<
  Pick<Document, 'title' | 'category_id' | 'doc_date' | 'sender' | 'amount'>
>

export interface DocumentQuery {
  q?: string
  category?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
}

export interface DocumentPage {
  items: DocumentListItem[]
  total: number
}

export interface Category {
  id: string
  label: string
  keywords: string[]
  subcategories?: Category[]
}

export interface CategoryUsage {
  documents: number
  trashed: number
  references: number
}

export interface CategorySaveInput {
  categories: Category[]
  /** Deleted category id → id that takes over its documents and references. */
  reassign: Record<string, string>
}

export interface CategorySaveResult {
  moved: number
  failed: { id: string; title: string; message: string }[]
}

export interface PhysicalFolder {
  code: string
  label: string
  location: string | null
  created_at: string
}

export interface PhysicalFolderWithCount extends PhysicalFolder {
  reference_count: number
}

export interface PhysicalReference {
  id: string
  folder_code: string
  doc_id_code: string
  title: string
  category_id: string
  description: string | null
  doc_date: string | null
  sender: string | null
  created_at: string
}

export type ReferenceInput = Omit<PhysicalReference, 'id' | 'created_at'>
export type FolderInput = Omit<PhysicalFolder, 'created_at'>

export type ClassifierMode = 'ollama' | 'rules'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface Settings {
  libraryPath: string | null
  pathTemplate: string
  ollamaUrl: string
  ollamaModel: string
  ollamaVisionModel: string
  classifierMode: ClassifierMode
  watchInbox: boolean
  inboxPollSeconds: number
  theme: ThemeMode
  /** First-run wizard (library + Ollama check) finished. */
  setupCompleted: boolean
}

export interface ImportResult {
  file: string
  status: 'queued' | 'duplicate' | 'error'
  id?: string
  existing_id?: string
  existing_title?: string
  error?: string
}

export interface OllamaStatus {
  reachable: boolean
  models: string[]
  /** Configured text/vision models that are not pulled yet. */
  missingModels: string[]
  /** URL points to this machine. */
  local: boolean
  /** Ollama binary found locally; null when the URL is remote. */
  installed: boolean | null
  platform: string
  error?: string
  latency_ms?: number
}

export interface ModelCheck {
  model: string
  installed: boolean
  ok: boolean
  latency_ms?: number
  detail?: string
  error?: string
}

export interface ModelTestResult {
  text: ModelCheck
  vision: ModelCheck
}

export interface RebuildResult {
  restored: number
  missing: number
  errors: string[]
}

export interface DashboardData {
  recent: DocumentListItem[]
  counts: { total: number; pending: number; errors: number; references: number }
}
