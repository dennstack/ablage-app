import { randomUUID } from 'node:crypto'
import type { SQLInputValue } from 'node:sqlite'
import type {
  FolderInput,
  PhysicalFolder,
  PhysicalFolderWithCount,
  PhysicalReference,
  ReferenceInput
} from '@shared/types'
import { type Db, now } from './index'

const refFields = ['folder_code', 'doc_id_code', 'title', 'category_id', 'description', 'doc_date', 'sender'] as const

export class ReferenceRepo {
  constructor(private db: Db) {}

  listFolders(): PhysicalFolderWithCount[] {
    return this.db
      .prepare(
        `SELECT f.code, f.label, f.location, f.created_at, COUNT(r.id) AS reference_count
         FROM physical_folders f LEFT JOIN physical_references r ON r.folder_code = f.code
         GROUP BY f.code ORDER BY f.code`
      )
      .all() as unknown as PhysicalFolderWithCount[]
  }

  createFolder(input: FolderInput): PhysicalFolder {
    const folder: PhysicalFolder = {
      code: input.code.trim(),
      label: input.label.trim(),
      location: input.location?.trim() || null,
      created_at: now()
    }
    this.db
      .prepare('INSERT INTO physical_folders (code, label, location, created_at) VALUES (?, ?, ?, ?)')
      .run(folder.code, folder.label, folder.location, folder.created_at)
    return folder
  }

  deleteFolder(code: string): void {
    const { n } = this.db
      .prepare('SELECT COUNT(*) AS n FROM physical_references WHERE folder_code = ?')
      .get(code) as { n: number }
    if (n > 0) throw new Error(`Ordner ${code} enthält noch ${n} Referenzen`)
    this.db.prepare('DELETE FROM physical_folders WHERE code = ?').run(code)
  }

  list(folderCode?: string): PhysicalReference[] {
    const sql = `SELECT * FROM physical_references ${folderCode ? 'WHERE folder_code = ?' : ''} ORDER BY created_at DESC`
    const stmt = this.db.prepare(sql)
    return (folderCode ? stmt.all(folderCode) : stmt.all()) as unknown as PhysicalReference[]
  }

  get(id: string): PhysicalReference | null {
    return (this.db.prepare('SELECT * FROM physical_references WHERE id = ?').get(id) as PhysicalReference | undefined) ?? null
  }

  create(input: ReferenceInput): PhysicalReference {
    const ref: PhysicalReference = { ...input, id: randomUUID(), created_at: now() }
    this.db
      .prepare(
        `INSERT INTO physical_references (id, ${refFields.join(', ')}, created_at)
         VALUES (?, ${refFields.map(() => '?').join(', ')}, ?)`
      )
      .run(ref.id, ...refFields.map((f) => (ref[f] ?? null) as SQLInputValue), ref.created_at)
    return ref
  }

  update(id: string, patch: Partial<ReferenceInput>): PhysicalReference {
    const entries = Object.entries(patch).filter(([k]) => (refFields as readonly string[]).includes(k))
    if (entries.length > 0) {
      this.db
        .prepare(`UPDATE physical_references SET ${entries.map(([k]) => `${k} = ?`).join(', ')} WHERE id = ?`)
        .run(...entries.map(([, v]) => (v ?? null) as SQLInputValue), id)
    }
    const ref = this.get(id)
    if (!ref) throw new Error(`reference ${id} not found`)
    return ref
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM physical_references WHERE id = ?').run(id)
  }

  codeExists(code: string): boolean {
    return !!this.db.prepare('SELECT 1 FROM physical_references WHERE doc_id_code = ?').get(code)
  }

  count(): number {
    return (this.db.prepare('SELECT COUNT(*) AS n FROM physical_references').get() as { n: number }).n
  }
}
