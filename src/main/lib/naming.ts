import { randomBytes } from 'node:crypto'

const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i

/** Makes a string safe as a single Windows/SMB path segment. */
export function sanitizeSegment(input: string, maxLength = 60): string {
  const cleaned = input
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
    .replace(/^[. ]+|[. ]+$/g, '')
  if (!cleaned || RESERVED.test(cleaned)) return cleaned ? `_${cleaned}` : ''
  return cleaned
}

export interface TemplateValues {
  category: string
  date: string | null
  sender: string | null
  title: string
  id: string
}

/**
 * Renders a path template like `{category}/{year}/{date}_{sender}_{title}` to a
 * relative path without extension. Empty placeholders collapse with their separators.
 */
export function renderTemplate(template: string, v: TemplateValues): string {
  const year = v.date?.slice(0, 4) ?? 'ohne-datum'
  const values: Record<string, string> = {
    category: sanitizeSegment(v.category),
    year,
    month: v.date?.slice(5, 7) ?? '',
    date: v.date ?? '',
    sender: sanitizeSegment(v.sender ?? '', 40),
    title: sanitizeSegment(v.title),
    id: v.id.slice(0, 8)
  }
  const segments = template
    .split(/[/\\]/)
    .map((seg) =>
      seg
        .replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? '')
        .replace(/([_\- ])[_\- ]+/g, '$1')
        .replace(/^[_\- ]+|[_\- ]+$/g, '')
    )
    .map((seg) => sanitizeSegment(seg, 120))
    .filter(Boolean)
  if (segments.length === 0) return values.id
  return segments.join('/')
}

/** 8 hex chars, uppercase – physical document code for the post-it. */
export function generateCode(): string {
  return randomBytes(4).toString('hex').toUpperCase()
}

export function stripExtension(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i > 0 ? filename.slice(0, i) : filename
}
