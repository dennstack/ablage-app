import { mkdtemp, readFile, rename, mkdir, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Category, Settings } from '../src/shared/types'
import type { Categories } from '../src/main/categories'
import { migrate } from '../src/main/db'
import { DocumentRepo } from '../src/main/db/documents'
import { Library } from '../src/main/library/library'
import { Pipeline, REFERENCES_SYNC_KEY, type PipelineDeps } from '../src/main/pipeline/pipeline'
import { Gate } from '../src/main/pipeline/queue'
import { makeDoc } from './helpers'

const list: Category[] = [
  { id: 'alt', label: 'Alt', keywords: [] },
  { id: 'neu', label: 'Neu', keywords: [] }
]

const categories = {
  topLevel: (id: string) => list.find((c) => c.id === id),
  isKnown: (id: string) => list.some((c) => c.id === id)
} as unknown as Categories

describe('Gate', () => {
  it('runs exclusive after active holders and before later ones', async () => {
    const gate = new Gate()
    const order: string[] = []
    let release!: () => void
    const held = new Promise<void>((r) => (release = r))

    const first = gate.shared(async () => {
      await held
      order.push('shared-1')
    })
    const excl = gate.exclusive(async () => {
      order.push('exclusive')
    })
    const later = gate.shared(async () => {
      order.push('shared-2')
    })
    release()
    await Promise.all([first, excl, later])
    expect(order).toEqual(['shared-1', 'exclusive', 'shared-2'])
  })

  it('releases after a failing holder', async () => {
    const gate = new Gate()
    await expect(gate.exclusive(() => Promise.reject(new Error('x')))).rejects.toThrow('x')
    await expect(gate.shared(async () => 1)).resolves.toBe(1)
  })
})

describe('Pipeline', () => {
  let library: Library
  let docs: DocumentRepo
  let pipeline: Pipeline
  let saveReferences: ReturnType<typeof vi.fn<() => Promise<void>>>

  const add = async (category_id: string) => {
    const relative_path = `Dokumente/Alt/${crypto.randomUUID()}.txt`
    const content = crypto.randomUUID()
    await mkdir(library.abs('Dokumente/Alt'), { recursive: true })
    await writeFile(library.abs(relative_path), content)
    const doc = makeDoc({ category_id, relative_path, title: 'datei', file_hash: createHash('sha256').update(content).digest('hex') })
    docs.insert(doc)
    return doc
  }
  const sidecar = async (id: string) => JSON.parse(await readFile(library.abs(`.ablage/meta/${id}.json`), 'utf8')).document

  beforeEach(async () => {
    library = new Library(await mkdtemp(join(tmpdir(), 'ablage-pipe-')))
    await library.ensure()
    const db = new DatabaseSync(':memory:')
    migrate(db)
    docs = new DocumentRepo(db)
    saveReferences = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
    pipeline = new Pipeline({
      docs,
      categories,
      worker: {},
      library: () => library,
      settings: () => ({ pathTemplate: '{category}/{title}' }) as Settings,
      classifier: () => {
        throw new Error('unused')
      },
      thumbsDir: join(library.root, 'thumbs'),
      notify: () => undefined,
      saveReferences
    } as unknown as PipelineDeps)
  })

  it('keeps a failed move retryable and records the new category in the sidecar', async () => {
    const doc = await add('alt')
    docs.reassignCategory('alt', 'neu')
    docs.markPending([doc.id])
    const relocate = vi.spyOn(library, 'relocate').mockRejectedValueOnce(new Error('gesperrt'))

    const first = await pipeline.syncPending()
    expect(first.failed.map((f) => f.message)).toEqual(['gesperrt'])
    expect(docs.pendingKeys()).toEqual([doc.id])
    expect(await sidecar(doc.id)).toMatchObject({ category_id: 'neu', relative_path: doc.relative_path })

    relocate.mockRestore()
    const second = await pipeline.syncPending()
    expect(second).toEqual({ moved: 1, failed: [] })
    expect(docs.pendingKeys()).toEqual([])
    expect(await sidecar(doc.id)).toMatchObject({ category_id: 'neu', relative_path: 'Dokumente/Neu/datei.txt' })
  })

  it('adopts a file that was moved before a crash', async () => {
    const doc = await add('neu')
    await mkdir(library.abs('Dokumente/Neu'), { recursive: true })
    await rename(library.abs(doc.relative_path), library.abs('Dokumente/Neu/datei.txt'))
    docs.markPending([doc.id])

    expect((await pipeline.syncPending()).failed).toEqual([])
    expect(docs.get(doc.id)?.relative_path).toBe('Dokumente/Neu/datei.txt')
  })

  it('retries the references snapshot and drops entries of removed documents', async () => {
    docs.markPending([REFERENCES_SYNC_KEY, crypto.randomUUID()])
    saveReferences.mockRejectedValueOnce(new Error('offline'))

    expect((await pipeline.syncPending()).failed.map((f) => f.id)).toEqual([REFERENCES_SYNC_KEY])
    expect(docs.pendingKeys()).toEqual([REFERENCES_SYNC_KEY])
    expect((await pipeline.syncPending()).failed).toEqual([])
    expect(docs.pendingKeys()).toEqual([])
  })

  it('moves trashed documents never, but updates their sidecar', async () => {
    const doc = await add('neu')
    docs.update(doc.id, { deleted_at: new Date().toISOString() })
    docs.markPending([doc.id])
    await pipeline.syncPending()
    expect(docs.get(doc.id)?.relative_path).toBe(doc.relative_path)
    expect((await sidecar(doc.id)).category_id).toBe('neu')
  })

  it('leaves the document untouched when an edit cannot move the file', async () => {
    const doc = await add('alt')
    vi.spyOn(library, 'relocate').mockRejectedValueOnce(new Error('gesperrt'))
    await expect(pipeline.updateMetadata(doc.id, { category_id: 'neu' })).rejects.toThrow('gesperrt')
    expect(docs.get(doc.id)?.category_id).toBe('alt')
  })

  it('journals an edit whose sidecar cannot be written', async () => {
    const doc = await add('alt')
    vi.spyOn(library, 'writeSidecar').mockRejectedValueOnce(new Error('voll'))
    await expect(pipeline.updateMetadata(doc.id, { category_id: 'neu' })).rejects.toThrow('voll')
    expect(docs.pendingKeys()).toEqual([doc.id])
    await pipeline.syncPending()
    expect(docs.pendingKeys()).toEqual([])
    expect((await sidecar(doc.id)).relative_path).toBe('Dokumente/Neu/datei.txt')
  })

  it('stops the sync on shutdown and keeps the rest journaled', async () => {
    const a = await add('alt')
    const b = await add('alt')
    docs.markPending([a.id, b.id])
    await pipeline.shutdown()
    expect((await pipeline.syncPending()).moved).toBe(0)
    expect(docs.pendingKeys().sort()).toEqual([a.id, b.id].sort())
  })
})
