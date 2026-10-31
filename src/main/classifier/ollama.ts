import { z } from 'zod'
import type { Category } from '@shared/types'
import { ollamaFetch } from '../ocr/vision'
import { isValidDate } from './rules'
import type { ClassificationResult, Classifier } from './types'

const MAX_TEXT = 12000

const nullableString = z.string().nullish().transform((v) => (v && v.trim() && v !== 'null' ? v.trim() : null))
const nullableDate = nullableString.transform((v) => (v && isValidDate(v) ? v : null))
const nullableNumber = z.union([z.number(), z.string()]).nullish().transform((v) => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
})

export const responseSchema = z.object({
  category_id: z.string(),
  confidence: z.number().min(0).max(1).catch(0),
  title: nullableString,
  sender: nullableString,
  doc_date: nullableDate,
  amount: nullableNumber,
  deadlines: z
    .array(
      z.object({
        type: z.string().catch('other'),
        due_date: nullableDate,
        amount: nullableNumber,
        notice_days: z.number().int().nullish().transform((v) => v ?? null),
        description: z.string().nullish().transform((v) => v ?? '')
      })
    )
    .nullish()
    .transform((v) => v ?? [])
})

const nullable = (type: string) => ({ type: [type, 'null'] })

/** JSON schema passed as Ollama `format` (structured outputs). */
const formatSchema = {
  type: 'object',
  properties: {
    category_id: { type: 'string' },
    confidence: { type: 'number' },
    title: nullable('string'),
    sender: nullable('string'),
    doc_date: nullable('string'),
    amount: nullable('number'),
    deadlines: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string' },
          due_date: nullable('string'),
          amount: nullable('number'),
          notice_days: nullable('integer'),
          description: { type: 'string' }
        },
        required: ['type', 'due_date', 'description']
      }
    }
  },
  required: ['category_id', 'confidence', 'title', 'sender', 'doc_date', 'amount', 'deadlines']
}

export interface OllamaConfig {
  url: string
  model: string
}

export class OllamaClassifier implements Classifier {
  constructor(
    private config: () => OllamaConfig,
    private categories: () => Category[]
  ) {}

  async classify(text: string, signal?: AbortSignal): Promise<ClassificationResult> {
    const { url, model } = this.config()
    const prompt = buildPrompt(this.categories(), text)
    const res = await ollamaFetch(url, '/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, format: formatSchema, options: { temperature: 0.1 } }),
      signal: signal ?? AbortSignal.timeout(180_000)
    })
    if (!res.ok) throw new Error(`Ollama antwortete mit Status ${res.status}: ${await res.text()}`)
    const body = (await res.json()) as { response?: string }
    if (!body.response) throw new Error('Ollama lieferte eine leere Antwort')
    return { ...parseResponse(body.response), source: 'ollama', raw_response: body.response, prompt }
  }
}

export function parseResponse(raw: string): Omit<ClassificationResult, 'source'> {
  return responseSchema.parse(JSON.parse(raw))
}

export function buildPrompt(categories: Category[], text: string): string {
  const catList = categories
    .flatMap((c) => [`- ${c.id} (${c.label})`, ...(c.subcategories ?? []).map((s) => `  - ${s.id} (${s.label})`)])
    .join('\n')
  const body = text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}\n[…gekürzt]` : text

  return `Analysiere den folgenden OCR-Text eines Dokuments und extrahiere die Metadaten.

Verfügbare Kategorien:
${catList}
- sonstiges (Sonstiges)

Antworte ausschließlich als JSON mit folgenden Feldern:
- category_id: Die passendste Kategorie-ID aus der Liste oben
- confidence: Konfidenz von 0.0 bis 1.0
- title: Kurzer, aussagekräftiger deutscher Titel (max. 6 Wörter), ohne Datum und ohne Absender
- sender: Erkannter Absender/Firma – NUR wenn explizit im Text vorhanden, sonst null. Niemals raten oder erfinden.
- doc_date: Datum des Dokuments im Format "2006-01-02" – NUR wenn explizit im Text vorhanden, sonst null. Niemals raten oder erfinden.
- amount: Geldbetrag als Zahl – NUR wenn explizit im Text vorhanden, sonst null. Niemals raten oder erfinden.
- deadlines: Array von Objekten mit {type, due_date, amount, notice_days, description}

Wichtig: Felder die nicht eindeutig aus dem Text hervorgehen MÜSSEN null sein. Keine Beispielwerte, keine Schätzungen.

OCR-Text:
---
${body}
---`
}

export async function listModels(url: string): Promise<{ models: string[]; latency_ms: number }> {
  const started = Date.now()
  const res = await ollamaFetch(url, '/api/tags', { signal: AbortSignal.timeout(5000) })
  if (!res.ok) throw new Error(`Status ${res.status}`)
  const body = (await res.json()) as { models?: { name: string }[] }
  return { models: (body.models ?? []).map((m) => m.name), latency_ms: Date.now() - started }
}
