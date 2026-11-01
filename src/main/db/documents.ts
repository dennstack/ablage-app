import type { SQLInputValue } from 'node:sqlite'
import type { Document, DocumentListItem, DocumentPage, DocumentQuery } from '@shared/types'
import { type Db, now } from './index'

const listColumns = `d.id, d.title, d.category_id, d.status, d.status_message, d.ocr_source, d.relative_path,
  d.file_hash, d.original_filename, d.mime_type, d.doc_date, d.sender, d.amount, d.classifier_source,
  d.created_at, d.updated_at, d.deleted_at`

const docColumns = [
  'id', 'title', 'category_id', 'status', 'status_message', 'ocr_text', 'ocr_source', 'relative_path',
  'file_hash', 'original_filename', 'mime_type', 'doc_date', 'sender', 'amount', 'classifier_source',
  'classifier_response', 'created_at', 'updated_at', 'deleted_at'
] as const

/** Snippet highlight delimiters; the renderer splits on them instead of parsing HTML. */
export const MARK_START = '\u0002'
export const MARK_END = '\u0003'

/** Turns user input into an FTS5 query: every word must match as prefix. */
export function toFtsQuery(input: string): string | null {
  const terms = input
    .split(/\s+/)
    .map((t) => t.replace(/"/g, '').trim())
    .filter(Boolean)
  if (terms.length === 0) return null
  return terms.map((t) => `"${t}"*`).join(' ')
}

export class DocumentRepo {
  constructor(private db: Db) {}

  insert(doc: Document): void {
    const placeholders = docColumns.map(() => '?').join(', ')
    this.db
      .prepare(`INSERT INTO documents (${docColumns.join(', ')}) VALUES (${placeholders})`)
      .run(...docColumns.map((c) => doc[c] as SQLInputValue))
  }

  get(id: string): Document | null {
    const row = this.db.prepare(`SELECT ${docColumns.join(', ')} FROM documents WHERE id = ?`).get(id)
    return (row as Document | undefined) ?? null
  }

  findByHash(hash: string): Document | null {
    const row = this.db.prepare(`SELECT ${docColumns.join(', ')} FROM documents WHERE file_hash = ?`).get(hash)
    return (row as Document | undefined) ?? null
  }

  update(id: string, fields: Partial<Omit<Document, 'id'>>): Document {
    const entries = Object.entries(fields).filter(([k]) => (docColumns as readonly string[]).includes(k))
    if (entries.length > 0) {
      const set = [...entries.map(([k]) => `${k} = ?`), 'updated_at = ?'].join(', ')
      this.db
        .prepare(`UPDATE documents SET ${set} WHERE id = ?`)
        .run(...entries.map(([, v]) => (v ?? null) as SQLInputValue), now(), id)
    }
    const doc = this.get(id)
    if (!doc) throw new Error(`document ${id} not found`)
    return doc
  }

  remove(id: string): void {
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id)
  }

  list(query: DocumentQuery, deleted = false): DocumentPage {
    const where: string[] = [deleted ? 'd.deleted_at IS NOT NULL' : 'd.deleted_at IS NULL']
    const params: SQLInputValue[] = []
    let from = 'documents d'
    let snippet = ''
    let order = deleted ? 'd.deleted_at DESC' : 'd.created_at DESC'

    const fts = query.q ? toFtsQuery(query.q) : null
    if (fts) {
      from = 'documents_fts f JOIN documents d ON d.seq = f.rowid'
      where.push('documents_fts MATCH ?')
      params.push(fts)
      snippet = `, snippet(documents_fts, 2, '${MARK_START}', '${MARK_END}', '…', 24) AS snippet`
      order = 'bm25(documents_fts, 10.0, 5.0, 1.0)'
    }
    if (query.category) {
      where.push("(d.category_id = ? OR d.category_id LIKE ? || '\\_%' ESCAPE '\\')")
      params.push(query.category, query.category)
    }
    if (query.from) {
      where.push('d.doc_date >= ?')
      params.push(query.from)
    }
    if (query.to) {
      where.push('d.doc_date <= ?')
      params.push(query.to)
    }

    const whereSql = where.join(' AND ')
    const { total } = this.db
      .prepare(`SELECT COUNT(*) AS total FROM ${from} WHERE ${whereSql}`)
      .get(...params) as { total: number }
    const items = this.db
      .prepare(`SELECT ${listColumns}${snippet} FROM ${from} WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
      .all(...params, query.limit ?? 50, query.offset ?? 0) as unknown as DocumentListItem[]
    return { items, total }
  }

  listAll(): Document[] {
    return this.db.prepare(`SELECT ${docColumns.join(', ')} FROM documents`).all() as unknown as Document[]
  }

  listUnfinished(): string[] {
    const rows = this.db
      .prepare("SELECT id FROM documents WHERE status IN ('pending', 'processing') AND deleted_at IS NULL")
      .all() as { id: string }[]
    return rows.map((r) => r.id)
  }

  countByCategory(): { category_id: string; documents: number; trashed: number }[] {
    return this.db
      .prepare(
        `SELECT category_id,
          COALESCE(SUM(deleted_at IS NULL), 0) AS documents,
          COALESCE(SUM(deleted_at IS NOT NULL), 0) AS trashed
         FROM documents GROUP BY category_id`
      )
      .all() as unknown as { category_id: string; documents: number; trashed: number }[]
  }

  /** Includes trashed documents. */
  idsByCategories(ids: string[]): { id: string; category_id: string; deleted_at: string | null }[] {
    if (ids.length === 0) return []
    return this.db
      .prepare(`SELECT id, category_id, deleted_at FROM documents WHERE category_id IN (${ids.map(() => '?').join(', ')})`)
      .all(...ids) as unknown as { id: string; category_id: string; deleted_at: string | null }[]
  }

  counts(): { total: number; pending: number; errors: number } {
    return this.db
      .prepare(
        `SELECT COUNT(*) AS total,
          COALESCE(SUM(status IN ('pending', 'processing')), 0) AS pending,
          COALESCE(SUM(status = 'error'), 0) AS errors
         FROM documents WHERE deleted_at IS NULL`
      )
      .get() as { total: number; pending: number; errors: number }
  }

  suggestions(prefix: string, limit = 8): string[] {
    const p = prefix.trim()
    if (p.length < 2) return []
    const rows = this.db
      .prepare(
        `SELECT value FROM (
           SELECT sender AS value FROM documents WHERE sender LIKE ? || '%' AND deleted_at IS NULL
           UNION SELECT title FROM documents WHERE title LIKE ? || '%' AND deleted_at IS NULL
         ) LIMIT ?`
      )
      .all(p, p, limit) as { value: string }[]
    return rows.map((r) => r.value)
  }
}
