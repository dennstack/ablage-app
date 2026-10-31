import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { findOllamaBinary, hasModel } from '../src/main/classifier/health'

describe('hasModel', () => {
  it('treats missing tag as :latest', () => {
    expect(hasModel(['mistral:latest'], 'mistral')).toBe(true)
    expect(hasModel(['mistral'], 'mistral:latest')).toBe(true)
    expect(hasModel(['qwen2.5vl:7b'], 'qwen2.5vl')).toBe(false)
    expect(hasModel(['qwen2.5vl:7b'], 'qwen2.5vl:7b')).toBe(true)
  })
})

describe('findOllamaBinary', () => {
  it('finds the binary on PATH', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ollama-'))
    writeFileSync(join(dir, 'ollama'), '')
    expect(findOllamaBinary({ PATH: dir }, 'freebsd')).toBe(join(dir, 'ollama'))
  })

  it('returns null when absent', () => {
    expect(findOllamaBinary({ PATH: mkdtempSync(join(tmpdir(), 'empty-')) }, 'freebsd')).toBeNull()
  })
})
