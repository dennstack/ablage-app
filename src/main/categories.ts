import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { parse } from 'yaml'
import type { Category } from '@shared/types'

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
