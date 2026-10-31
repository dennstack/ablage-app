import { constants } from 'node:fs'
import { access, copyFile, mkdir, readdir, readFile, rename, rm, rmdir, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, join, posix } from 'node:path'
import type { Document } from '@shared/types'

export const DIRS = {
  inbox: 'Eingang',
  inboxDuplicates: 'Eingang/_Duplikate',
  inboxFailed: 'Eingang/_Fehler',
  documents: 'Dokumente',
  meta: '.ablage/meta',
  trash: '.ablage/trash'
} as const

/** Sidecar format version; bump on breaking changes. */
const SIDECAR_VERSION = 1

export interface Sidecar {
  version: number
  document: Document
}

/**
 * The library folder is the source of truth: files plus one JSON sidecar per
 * document. All paths handed around are relative with `/` separators.
 */
export class Library {
  constructor(readonly root: string) {}

  abs(relative: string): string {
    return join(this.root, ...relative.split('/'))
  }

  async ensure(): Promise<void> {
    for (const dir of Object.values(DIRS)) await mkdir(this.abs(dir), { recursive: true })
    const probe = this.abs('.ablage/.write-test')
    await writeFile(probe, String(Date.now()))
    await unlink(probe)
  }

  /** Returns a free relative path `<base><ext>`, appending `_2`, `_3`… on collision. */
  async freePath(base: string, ext: string, ignore?: string): Promise<string> {
    for (let i = 1; ; i++) {
      const candidate = `${base}${i === 1 ? '' : `_${i}`}${ext}`
      if (candidate === ignore) return candidate
      if (!(await exists(this.abs(candidate)))) return candidate
    }
  }

  /** Copies or moves an external file into the library. */
  async place(src: string, targetBase: string, ext: string, move: boolean): Promise<string> {
    const rel = await this.freePath(targetBase, ext)
    const dest = this.abs(rel)
    await mkdir(dirname(dest), { recursive: true })
    if (move) await moveFile(src, dest)
    else await copyFile(src, dest, constants.COPYFILE_EXCL)
    return rel
  }

  /** Moves a library file to a new base path; returns the (possibly unchanged) relative path. */
  async relocate(currentRel: string, targetBase: string): Promise<string> {
    const ext = posix.extname(currentRel)
    if (stripExt(currentRel) === targetBase) return currentRel
    const rel = await this.freePath(targetBase, ext, currentRel)
    if (rel === currentRel) return currentRel
    const dest = this.abs(rel)
    await mkdir(dirname(dest), { recursive: true })
    await moveFile(this.abs(currentRel), dest)
    await this.pruneEmptyDirs(posix.dirname(currentRel))
    return rel
  }

  async moveToTrash(currentRel: string, id: string): Promise<string> {
    const rel = `${DIRS.trash}/${id}${posix.extname(currentRel)}`
    await moveFile(this.abs(currentRel), this.abs(rel))
    await this.pruneEmptyDirs(posix.dirname(currentRel))
    return rel
  }

  async moveInboxFile(absPath: string, targetDir: string): Promise<void> {
    const name = absPath.split(/[/\\]/).pop()!
    const ext = extname(name)
    const rel = await this.freePath(`${targetDir}/${name.slice(0, name.length - ext.length)}`, ext)
    await moveFile(absPath, this.abs(rel))
  }

  async deleteFile(rel: string): Promise<void> {
    await rm(this.abs(rel), { force: true })
  }

  fileExists(rel: string): Promise<boolean> {
    return exists(this.abs(rel))
  }

  async writeSidecar(doc: Document): Promise<void> {
    const data: Sidecar = { version: SIDECAR_VERSION, document: doc }
    const target = this.abs(`${DIRS.meta}/${doc.id}.json`)
    const tmp = `${target}.tmp`
    await writeFile(tmp, JSON.stringify(data, null, 2))
    await moveFile(tmp, target)
  }

  async deleteSidecar(id: string): Promise<void> {
    await rm(this.abs(`${DIRS.meta}/${id}.json`), { force: true })
  }

  async readSidecars(): Promise<{ sidecars: Sidecar[]; errors: string[] }> {
    const dir = this.abs(DIRS.meta)
    const sidecars: Sidecar[] = []
    const errors: string[] = []
    for (const name of await readdir(dir)) {
      if (!name.endsWith('.json')) continue
      try {
        const parsed = JSON.parse(await readFile(join(dir, name), 'utf8')) as Sidecar
        if (parsed?.document?.id) sidecars.push(parsed)
        else errors.push(`${name}: ungültiges Format`)
      } catch (err) {
        errors.push(`${name}: ${(err as Error).message}`)
      }
    }
    return { sidecars, errors }
  }

  /** Removes empty directories below Dokumente/ after a move. */
  private async pruneEmptyDirs(relDir: string): Promise<void> {
    let dir = relDir
    while (dir.startsWith(`${DIRS.documents}/`)) {
      try {
        if ((await readdir(this.abs(dir))).length > 0) return
        await rmdir(this.abs(dir))
      } catch {
        return
      }
      dir = posix.dirname(dir)
    }
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

/** rename() fails across volumes (e.g. local → NAS); fall back to copy + delete. */
async function moveFile(src: string, dest: string): Promise<void> {
  await mkdir(dirname(dest), { recursive: true })
  try {
    await rename(src, dest)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EXDEV') throw err
    await copyFile(src, dest)
    const [a, b] = await Promise.all([stat(src), stat(dest)])
    if (a.size !== b.size) throw new Error(`Kopie unvollständig: ${dest}`)
    await unlink(src)
  }
}

function stripExt(rel: string): string {
  const ext = posix.extname(rel)
  return ext ? rel.slice(0, -ext.length) : rel
}
