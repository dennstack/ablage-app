import { copyFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { isScalar, isSeq, parse, parseDocument, visit } from 'yaml'
import { FALLBACK_CATEGORY } from '@shared/categories'
import type { Category } from '@shared/types'
import { sanitizeSegment } from './lib/naming'

export interface CategoryPlan {
  removed: string[]
  /** Existing ids whose documents need a new folder. */
  relocate: string[]
}

function parentMap(list: Category[]): Map<string, string | null> {
  const parents = new Map<string, string | null>()
  const add = (id: string, parent: string | null): void => {
    if (parents.has(id)) throw new Error(`Die ID „${id}“ ist mehrfach vergeben.`)
    parents.set(id, parent)
  }
  for (const c of list) {
    add(c.id, null)
    for (const s of c.subcategories ?? []) add(s.id, c.id)
  }
  return parents
}

function folderKey(label: string): string {
  return sanitizeSegment(label).toLowerCase()
}

/** Validates an edit against the current list. Throws a user-facing message. */
export function planChange(
  current: Category[],
  next: Category[],
  reassign: Record<string, string>,
  usedIds: ReadonlySet<string>
): CategoryPlan {
  const before = parentMap(current)
  const after = parentMap(next)

  if (after.get(FALLBACK_CATEGORY) !== null) {
    throw new Error(`Die Kategorie „${FALLBACK_CATEGORY}“ muss als Hauptkategorie erhalten bleiben.`)
  }

  const folders = new Set<string>()
  for (const c of next) {
    const key = folderKey(c.label)
    if (!key) throw new Error('Jede Hauptkategorie braucht einen Namen, der als Ordnername taugt.')
    if (folders.has(key)) throw new Error(`Der Name „${c.label}“ ist mehrfach vergeben.`)
    folders.add(key)
    for (const s of c.subcategories ?? []) {
      if (!s.label.trim()) throw new Error(`Eine Unterkategorie von „${c.label}“ hat keinen Namen.`)
    }
  }

  for (const [id, parent] of after) {
    if (before.has(id)) {
      if (before.get(id) !== parent) throw new Error(`„${id}“ darf nicht die Hauptkategorie wechseln.`)
      continue
    }
    const valid = parent === null ? /^[a-z0-9-]+$/.test(id) : id.startsWith(`${parent}_`) && /^[a-z0-9-]+$/.test(id.slice(parent.length + 1))
    if (!valid) throw new Error(`Die ID „${id}“ ist ungültig.`)
  }

  const removed = [...before.keys()].filter((id) => !after.has(id))
  for (const id of removed) {
    const target = reassign[id]
    if (target !== undefined && !after.has(target)) throw new Error(`Die Zielkategorie „${target}“ existiert nicht.`)
    if (target === undefined && usedIds.has(id)) throw new Error(`Für die gelöschte Kategorie „${id}“ fehlt eine Zielkategorie.`)
  }

  const relocate = next
    .filter((c) => {
      const old = current.find((o) => o.id === c.id)
      // Case-only renames stay put: the folder resolves to the same path on Windows.
      return old !== undefined && folderKey(old.label) !== folderKey(c.label)
    })
    .flatMap((c) => [c.id, ...(c.subcategories ?? []).map((s) => s.id)])

  return { removed, relocate }
}

export class Categories {
  private list: Category[] = []

  constructor(
    readonly file: string,
    bundled: string
  ) {
    if (!existsSync(file)) copyFileSync(bundled, file)
    this.reload()
  }

  reload(): void {
    const parsed = parse(readFileSync(this.file, 'utf8')) as { categories?: Category[] }
    this.list = parsed?.categories ?? []
  }

  save(list: Category[]): void {
    const doc = parseDocument(readFileSync(this.file, 'utf8'))
    const plain = list.map(({ subcategories, ...c }) => (subcategories?.length ? { ...c, subcategories } : c))
    doc.set('categories', doc.createNode(plain))
    visit(doc, {
      Pair(_, pair) {
        if (isScalar(pair.key) && pair.key.value === 'keywords' && isSeq(pair.value)) pair.value.flow = true
      }
    })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, doc.toString({ lineWidth: 0 }))
    renameSync(tmp, this.file)
    this.list = list
  }

  all(): Category[] {
    return this.list
  }

  label(id: string): string {
    for (const c of this.list) {
      if (c.id === id) return c.label
      const sub = c.subcategories?.find((s) => s.id === id)
      if (sub) return `${c.label} - ${sub.label}`
    }
    return id
  }

  /** Top-level id used as library folder name. */
  topLevel(id: string): Category | undefined {
    return this.list.find((c) => c.id === id || c.subcategories?.some((s) => s.id === id))
  }

  isKnown(id: string): boolean {
    return this.list.some((c) => c.id === id || c.subcategories?.some((s) => s.id === id))
  }
}
