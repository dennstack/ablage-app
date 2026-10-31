import type { Category } from '@shared/types'
import type { ClassificationResult, Classifier } from './types'

export class RulesClassifier implements Classifier {
  constructor(private categories: () => Category[]) {}

  async classify(text: string): Promise<ClassificationResult> {
    const lower = text.toLowerCase()
    let best = 'sonstiges'
    let bestScore = 0

    for (const cat of this.categories()) {
      const parentScore = countKeywords(lower, cat.keywords)
      for (const sub of cat.subcategories ?? []) {
        const score = countKeywords(lower, sub.keywords) + parentScore
        if (score > bestScore) {
          bestScore = score
          best = sub.id
        }
      }
      if (parentScore > bestScore) {
        bestScore = parentScore
        best = cat.id
      }
    }

    return {
      category_id: best,
      confidence: Math.min(bestScore / 10, 1),
      title: null,
      sender: null,
      doc_date: extractDate(text),
      amount: extractAmount(text),
      deadlines: [],
      source: 'rules'
    }
  }
}

function countKeywords(text: string, keywords: string[] = []): number {
  return keywords.filter((kw) => text.includes(kw.toLowerCase())).length
}

export function extractAmount(text: string): number | null {
  const m = /(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:€|EUR)/.exec(text)
  if (!m) return null
  const v = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(v) ? v : null
}

export function extractDate(text: string): string | null {
  const re = /(\d{2})\.(\d{2})\.(\d{4})/g
  for (const m of text.matchAll(re)) {
    const iso = `${m[3]}-${m[2]}-${m[1]}`
    if (isValidDate(iso)) return iso
  }
  return null
}

export function isValidDate(iso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false
  const d = new Date(`${iso}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(iso)
}
