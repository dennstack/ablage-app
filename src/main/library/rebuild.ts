import { readFile, writeFile } from 'node:fs/promises'
import type { Document, PhysicalFolder, PhysicalReference, RebuildResult } from '@shared/types'
import { type Db, transaction } from '../db'
import type { DocumentRepo } from '../db/documents'
import type { Library } from './library'

const REFERENCES_FILE = '.ablage/references.json'

interface ReferencesSnapshot {
  folders: PhysicalFolder[]
  references: PhysicalReference[]
}

/** Physical references live only in the DB; mirror them into the library for rebuilds. */
export async function writeReferencesSnapshot(db: Db, library: Library): Promise<void> {
  const snapshot: ReferencesSnapshot = {
    folders: db.prepare('SELECT * FROM physical_folders').all() as unknown as PhysicalFolder[],
    references: db.prepare('SELECT * FROM physical_references').all() as unknown as PhysicalReference[]
  }
  await writeFile(library.abs(REFERENCES_FILE), JSON.stringify(snapshot, null, 2))
}

/** Replaces all DB content with what the library folder contains. */
export async function rebuildFromLibrary(db: Db, docs: DocumentRepo, library: Library): Promise<RebuildResult> {
  const { sidecars, errors } = await library.readSidecars()
  const present: Document[] = []
  let missing = 0
  for (const s of sidecars) {
    if (await library.fileExists(s.document.relative_path)) present.push(s.document)
    else {
      missing++
      errors.push(`${s.document.id}: Datei fehlt (${s.document.relative_path})`)
    }
  }

  let snapshot: ReferencesSnapshot | null = null
  try {
    snapshot = JSON.parse(await readFile(library.abs(REFERENCES_FILE), 'utf8')) as ReferencesSnapshot
  } catch {
    // no references yet
  }

  transaction(db, () => {
    db.exec('DELETE FROM documents')
    for (const doc of present) {
      // documents that were mid-processing restart the pipeline on next launch
      docs.insert(doc)
    }
    if (snapshot) {
      db.exec('DELETE FROM physical_references; DELETE FROM physical_folders;')
      const f = db.prepare('INSERT INTO physical_folders (code, label, location, created_at) VALUES (?, ?, ?, ?)')
      for (const x of snapshot.folders) f.run(x.code, x.label, x.location, x.created_at)
      const r = db.prepare(
        `INSERT INTO physical_references (id, folder_code, doc_id_code, title, category_id, description, doc_date, sender, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      for (const x of snapshot.references) {
        r.run(x.id, x.folder_code, x.doc_id_code, x.title, x.category_id, x.description, x.doc_date, x.sender, x.created_at)
      }
    }
  })

  return { restored: present.length, missing, errors }
}
