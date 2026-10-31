import { describe, expect, it } from 'vitest'
import { renderTemplate, sanitizeSegment } from '../src/main/lib/naming'

describe('sanitizeSegment', () => {
  it('removes characters invalid on Windows', () => {
    expect(sanitizeSegment('A/B:C*D?"E<F>G|H')).toBe('A B C D E F G H')
  })
  it('strips trailing dots and spaces', () => {
    expect(sanitizeSegment('Rechnung. ')).toBe('Rechnung')
  })
  it('escapes reserved device names', () => {
    expect(sanitizeSegment('CON')).toBe('_CON')
  })
})

describe('renderTemplate', () => {
  const base = { category: 'Rechnung', date: '2024-05-17', sender: 'Telekom', title: 'Mobilfunk Mai', id: 'abcdef123456' }

  it('renders the default template', () => {
    expect(renderTemplate('{category}/{year}/{date}_{sender}_{title}', base)).toBe(
      'Rechnung/2024/2024-05-17_Telekom_Mobilfunk Mai'
    )
  })
  it('collapses empty placeholders', () => {
    expect(renderTemplate('{category}/{year}/{date}_{sender}_{title}', { ...base, date: null, sender: null })).toBe(
      'Rechnung/ohne-datum/Mobilfunk Mai'
    )
  })
  it('falls back to the id when everything is empty', () => {
    expect(renderTemplate('{sender}', { ...base, sender: null })).toBe('abcdef12')
  })
  it('cannot escape the target directory', () => {
    expect(renderTemplate('{title}', { ...base, title: '../../etc' })).not.toContain('..')
  })
})
