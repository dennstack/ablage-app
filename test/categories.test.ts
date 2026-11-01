import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { categoryId } from '../src/shared/categories'
import type { Category } from '../src/shared/types'
import { Categories, planChange } from '../src/main/categories'

const cat = (id: string, label: string, subcategories?: Category[]): Category => ({ id, label, keywords: [], subcategories })

const current = [
  cat('rechnung', 'Rechnung', [cat('rechnung_telko', 'Telko')]),
  cat('vertrag', 'Vertrag', [cat('vertrag_miete', 'Miete')]),
  cat('sonstiges', 'Sonstiges')
]

const none = new Set<string>()

describe('categoryId', () => {
  it('transliterates umlauts and uses hyphens only', () => {
    expect(categoryId('Behörden & Ämter', [])).toBe('behoerden-aemter')
    expect(categoryId('Straße_Süd', [])).toBe('strasse-sued')
  })

  it('prefixes subcategories with the parent', () => {
    expect(categoryId('Gas', [], 'vertrag')).toBe('vertrag_gas')
  })

  it('suffixes collisions', () => {
    expect(categoryId('Foo', ['foo', 'foo-2'])).toBe('foo-3')
  })

  it('falls back when the label has no usable characters', () => {
    expect(categoryId('???', [])).toBe('kategorie')
  })
})

describe('planChange', () => {
  it('accepts unchanged lists', () => {
    expect(planChange(current, current, {}, none)).toEqual({ removed: [], relocate: [] })
  })

  it('relocates a renamed top level with its subcategories', () => {
    const next = [cat('rechnung', 'Belege', [cat('rechnung_telko', 'Telko')]), ...current.slice(1)]
    expect(planChange(current, next, {}, none).relocate).toEqual(['rechnung', 'rechnung_telko'])
  })

  it('relocates for case-only renames', () => {
    const next = [cat('rechnung', 'RECHNUNG', [cat('rechnung_telko', 'Telko')]), ...current.slice(1)]
    expect(planChange(current, next, {}, none).relocate).toEqual(['rechnung', 'rechnung_telko'])
  })

  it('does not relocate for subcategory renames', () => {
    const next = [cat('rechnung', 'Rechnung', [cat('rechnung_telko', 'Telefon')]), ...current.slice(1)]
    expect(planChange(current, next, {}, none).relocate).toEqual([])
  })

  it('judges folder names the way the path template renders them', () => {
    expect(() => planChange(current, [...current, cat('neu', '---')], {}, none)).toThrow('Ordnername')
    expect(() => planChange(current, [...current, cat('a', 'Foo Bar'), cat('b', 'Foo - Bar')], {}, none)).toThrow('mehrfach')
  })

  it('requires the fallback category at top level', () => {
    expect(() => planChange(current, current.slice(0, 2), {}, none)).toThrow('sonstiges')
    const nested = [cat('rechnung', 'Rechnung', [cat('sonstiges', 'Sonstiges')]), current[1]]
    expect(() => planChange(current, nested, { rechnung_telko: 'rechnung' }, none)).toThrow()
  })

  it('rejects duplicate ids and folder names', () => {
    expect(() => planChange(current, [...current, cat('vertrag', 'Andere')], {}, none)).toThrow('mehrfach')
    expect(() => planChange(current, [...current, cat('neu', 'rechnung')], {}, none)).toThrow('mehrfach')
  })

  it('rejects labels without a folder name', () => {
    expect(() => planChange(current, [...current, cat('neu', '...')], {}, none)).toThrow('Ordnername')
    const blankSub = [cat('rechnung', 'Rechnung', [cat('rechnung_telko', ' ')]), ...current.slice(1)]
    expect(() => planChange(current, blankSub, {}, none)).toThrow('keinen Namen')
  })

  it('forbids moving a subcategory to another parent', () => {
    const next = [cat('rechnung', 'Rechnung'), cat('vertrag', 'Vertrag', [cat('vertrag_miete', 'Miete'), cat('rechnung_telko', 'Telko')]), current[2]]
    expect(() => planChange(current, next, {}, none)).toThrow('wechseln')
  })

  it('validates the format of new ids only', () => {
    const legacy = [cat('alt_name', 'Alt', [cat('frei', 'Frei')]), cat('sonstiges', 'Sonstiges')]
    expect(() => planChange(legacy, legacy, {}, none)).not.toThrow()
    expect(() => planChange(current, [...current, cat('neu_name', 'Neu')], {}, none)).toThrow('ungültig')
    expect(() => planChange(current, [...current, cat('neu', 'Neu', [cat('falsch_x', 'X')])], {}, none)).toThrow('ungültig')
  })

  it('requires a target only for used deleted ids', () => {
    const next = [current[0], cat('vertrag', 'Vertrag'), current[2]]
    expect(planChange(current, next, {}, none).removed).toEqual(['vertrag_miete'])
    expect(() => planChange(current, next, {}, new Set(['vertrag_miete']))).toThrow('fehlt')
    expect(() => planChange(current, next, { vertrag_miete: 'weg' }, new Set(['vertrag_miete']))).toThrow('existiert nicht')
    expect(planChange(current, next, { vertrag_miete: 'vertrag' }, new Set(['vertrag_miete'])).removed).toEqual(['vertrag_miete'])
  })
})

describe('Categories.save', () => {
  const yaml = [
    '# Kopf',
    'categories:',
    '  # Finanzen',
    '  - id: a',
    '    label: A # inline',
    '    keywords: [x, y]',
    '',
    '  # Rest',
    '  - id: b',
    '    label: B',
    '    keywords: []',
    '    subcategories:',
    '      # Kind',
    '      - id: b_c',
    '        label: C',
    '        keywords: [z]',
    ''
  ].join('\n')

  const open = (): { file: string; categories: Categories } => {
    const file = join(mkdtempSync(join(tmpdir(), 'ablage-cat-')), 'categories.yaml')
    writeFileSync(file, yaml)
    return { file, categories: new Categories(file, file) }
  }

  it('keeps comments, spacing and flow style of untouched items', () => {
    const { file, categories } = open()
    const list = structuredClone(categories.all())
    list[0].label = 'Neu'
    list[1].subcategories![0].keywords = ['z', 'q']
    categories.save(list)
    expect(readFileSync(file, 'utf8')).toBe(
      yaml.replace('label: A # inline', 'label: Neu # inline').replace('keywords: [z]', 'keywords: [z, q]')
    )
  })

  it('does not touch the file when nothing changed', () => {
    const { file, categories } = open()
    writeFileSync(file, `${yaml}\n# nachgetragen\n`)
    categories.save(structuredClone(categories.all()))
    expect(readFileSync(file, 'utf8')).toContain('# nachgetragen')
  })

  it('removes items and adds new ones', () => {
    const { file, categories } = open()
    categories.save([{ id: 'b', label: 'B', keywords: [] }, { id: 'n', label: 'N', keywords: ['k'] }])
    const text = readFileSync(file, 'utf8')
    expect(text).not.toContain('id: a')
    expect(text).not.toContain('subcategories')
    expect(text).toContain('keywords: [k]')
    categories.reload()
    expect(categories.all().map((c) => c.id)).toEqual(['b', 'n'])
  })

  it('writes readable yaml, keeps the header comment and round-trips', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ablage-cat-'))
    const file = join(dir, 'categories.yaml')
    writeFileSync(file, '# Meine Kategorien\ncategories:\n  - id: alt\n    label: Alt\n    keywords: []\n')
    const categories = new Categories(file, file)

    const next = [{ id: 'neu', label: 'Neu', keywords: ['a', 'b'], subcategories: [] }]
    categories.save(next)

    const text = readFileSync(file, 'utf8')
    expect(text).toContain('# Meine Kategorien')
    expect(text).toContain('[a, b]')
    expect(text).not.toContain('subcategories')
    categories.reload()
    expect(categories.all()).toEqual([{ id: 'neu', label: 'Neu', keywords: ['a', 'b'] }])
  })
})
