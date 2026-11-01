export const FALLBACK_CATEGORY = 'sonstiges'

const UMLAUTS: Record<string, string> = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

/** Slugs use `-` only: `_` separates parent and child in the id prefix filter. */
function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[äöüß]/g, (c) => UMLAUTS[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function categoryId(label: string, existingIds: Iterable<string>, parentId?: string): string {
  const slug = slugify(label) || 'kategorie'
  const base = parentId ? `${parentId}_${slug}` : slug
  const taken = new Set(existingIds)
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}
