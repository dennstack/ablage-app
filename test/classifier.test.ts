import { describe, expect, it } from 'vitest'
import { buildPrompt, parseResponse } from '../src/main/classifier/ollama'
import { extractAmount, extractDate, RulesClassifier } from '../src/main/classifier/rules'

const categories = [
  {
    id: 'rechnung',
    label: 'Rechnung',
    keywords: ['rechnung', 'betrag'],
    subcategories: [{ id: 'rechnung_telko', label: 'Telekommunikation', keywords: ['telekom', 'mobilfunk'] }]
  },
  { id: 'vertrag', label: 'Vertrag', keywords: ['vertrag', 'laufzeit'] }
]

describe('RulesClassifier', () => {
  it('prefers the matching subcategory', async () => {
    const r = await new RulesClassifier(() => categories).classify('Ihre Telekom Rechnung vom 03.02.2024 Betrag 49,99 €')
    expect(r.category_id).toBe('rechnung_telko')
    expect(r.amount).toBe(49.99)
    expect(r.doc_date).toBe('2024-02-03')
  })
  it('falls back to sonstiges', async () => {
    expect((await new RulesClassifier(() => categories).classify('Hallo Welt')).category_id).toBe('sonstiges')
  })
})

describe('extractors', () => {
  it('parses German amounts', () => expect(extractAmount('Summe 1.234,50 EUR')).toBe(1234.5))
  it('skips invalid dates', () => expect(extractDate('31.02.2024 und 01.03.2024')).toBe('2024-03-01'))
})

describe('Ollama response', () => {
  it('normalises loose model output', () => {
    const r = parseResponse(
      JSON.stringify({
        category_id: 'rechnung',
        confidence: 0.9,
        title: 'Stromrechnung',
        sender: 'null',
        doc_date: '2024-13-01',
        amount: '1.234,50',
        deadlines: [{ type: 'payment', due_date: '2024-06-01', description: 'Zahlung' }]
      })
    )
    expect(r.sender).toBeNull()
    expect(r.doc_date).toBeNull()
    expect(r.amount).toBe(1234.5)
    expect(r.deadlines[0]).toMatchObject({ type: 'payment', due_date: '2024-06-01', amount: null, notice_days: null })
  })
  it('lists categories in the prompt', () => {
    const p = buildPrompt(categories, 'Text')
    expect(p).toContain('- rechnung (Rechnung)')
    expect(p).toContain('  - rechnung_telko (Telekommunikation)')
  })
})
