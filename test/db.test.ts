import { describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { migrate } from '../src/main/db'
import { DocumentRepo, MARK_START, toFtsQuery } from '../src/main/db/documents'
import { ReferenceRepo } from '../src/main/db/references'
import { makeDoc } from './helpers'

function setup() {
  const db = new DatabaseSync(':memory:')
  migrate(db)
  return { db, docs: new DocumentRepo(db), refs: new ReferenceRepo(db) }
}

describe('documents', () => {
  it('migrates idempotently', () => {
    const { db } = setup()
    migrate(db)
    expect((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(1)
  })

  it('finds documents by prefix and umlaut-insensitive full text', () => {
    const { docs } = setup()
    docs.insert(makeDoc({ title: 'Angebot', ocr_text: 'Angebot für den Zaunbau bei Müller' }))
    docs.insert(makeDoc({ title: 'Rechnung', ocr_text: 'Stromrechnung' }))
    const page = docs.list({ q: 'zaun muller' })
    expect(page.total).toBe(1)
    expect(page.items[0].snippet).toContain(MARK_START)
  })

  it('keeps the FTS index in sync on update and delete', () => {
    const { docs } = setup()
    const d = makeDoc({ title: 'Alt' })
    docs.insert(d)
    docs.update(d.id, { title: 'Neu' })
    expect(docs.list({ q: 'alt' }).total).toBe(0)
    expect(docs.list({ q: 'neu' }).total).toBe(1)
    docs.remove(d.id)
    expect(docs.list({ q: 'neu' }).total).toBe(0)
  })

  it('filters by parent category including subcategories, and separates trash', () => {
    const { docs } = setup()
    docs.insert(makeDoc({ category_id: 'rechnung' }))
    docs.insert(makeDoc({ category_id: 'rechnung_telko' }))
    docs.insert(makeDoc({ category_id: 'rechnungen' }))
    docs.insert(makeDoc({ category_id: 'rechnung', deleted_at: new Date().toISOString() }))
    expect(docs.list({ category: 'rechnung' }).total).toBe(2)
    expect(docs.list({}, true).total).toBe(1)
  })

  it('builds safe FTS queries', () => {
    expect(toFtsQuery('foo "bar')).toBe('"foo"* "bar"*')
    expect(toFtsQuery('   ')).toBeNull()
  })
})

describe('references', () => {
  it('refuses to delete non-empty folders', () => {
    const { refs } = setup()
    refs.createFolder({ code: 'A1', label: 'Ordner', location: null })
    refs.create({ folder_code: 'A1', doc_id_code: 'C0DE', title: 'Mietvertrag', category_id: 'vertrag', description: null, doc_date: null, sender: null })
    expect(() => refs.deleteFolder('A1')).toThrow()
    expect(refs.listFolders()[0].reference_count).toBe(1)
    expect(refs.codeExists('C0DE')).toBe(true)
  })
})
