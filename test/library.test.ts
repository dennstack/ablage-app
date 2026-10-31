import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DatabaseSync } from 'node:sqlite'
import { migrate } from '../src/main/db'
import { DocumentRepo } from '../src/main/db/documents'
import { ReferenceRepo } from '../src/main/db/references'
import { Library } from '../src/main/library/library'
import { rebuildFromLibrary, writeReferencesSnapshot } from '../src/main/library/rebuild'
import { makeDoc } from './helpers'

let root: string
let lib: Library

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'ablage-'))
  lib = new Library(root)
  await lib.ensure()
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('Library', () => {
  it('creates the folder structure', async () => {
    expect(await readdir(root)).toEqual(expect.arrayContaining(['Eingang', 'Dokumente', '.ablage']))
  })

  it('places files with collision suffix and relocates them', async () => {
    const src = join(root, 'in.pdf')
    await writeFile(src, 'a')
    const a = await lib.place(src, 'Dokumente/Rechnung/2024/x', '.pdf', false)
    const b = await lib.place(src, 'Dokumente/Rechnung/2024/x', '.pdf', false)
    expect(a).toBe('Dokumente/Rechnung/2024/x.pdf')
    expect(b).toBe('Dokumente/Rechnung/2024/x_2.pdf')

    const moved = await lib.relocate(b, 'Dokumente/Vertrag/2023/y')
    expect(moved).toBe('Dokumente/Vertrag/2023/y.pdf')
    expect(await lib.relocate(moved, 'Dokumente/Vertrag/2023/y')).toBe(moved)
  })

  it('prunes empty directories after moving', async () => {
    const src = join(root, 'in.pdf')
    await writeFile(src, 'a')
    const rel = await lib.place(src, 'Dokumente/Alt/2020/x', '.pdf', true)
    await lib.relocate(rel, 'Dokumente/Neu/x')
    expect(await readdir(lib.abs('Dokumente'))).toEqual(['Neu'])
  })
})

describe('rebuild', () => {
  it('restores documents and references from the library', async () => {
    const db = new DatabaseSync(':memory:')
    migrate(db)
    const refs = new ReferenceRepo(db)

    const src = join(root, 'in.pdf')
    await writeFile(src, 'a')
    const present = makeDoc({ title: 'Vorhanden', relative_path: await lib.place(src, 'Dokumente/a', '.pdf', true) })
    const missing = makeDoc({ title: 'Fehlt', relative_path: 'Dokumente/weg.pdf' })
    await lib.writeSidecar(present)
    await lib.writeSidecar(missing)
    refs.createFolder({ code: 'F1', label: 'Ordner', location: null })
    await writeReferencesSnapshot(db, lib)

    const fresh = new DatabaseSync(':memory:')
    migrate(fresh)
    const freshDocs = new DocumentRepo(fresh)
    const result = await rebuildFromLibrary(fresh, freshDocs, lib)
    expect(result).toMatchObject({ restored: 1, missing: 1 })
    expect(freshDocs.get(present.id)?.title).toBe('Vorhanden')
    expect(new ReferenceRepo(fresh).listFolders()).toHaveLength(1)
  })
})
