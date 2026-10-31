import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import type { Category, ModelCheck, ModelTestResult, OllamaStatus, Settings } from '@shared/types'
import { visionOcr } from '../ocr/vision'
import { listModels, OllamaClassifier } from './ollama'

export const OLLAMA_DOWNLOAD_URL = 'https://ollama.com/download'

const SAMPLE_TEXT = `Stadtwerke Musterstadt GmbH
Hauptstraße 1, 12345 Musterstadt

Rechnung Nr. 4711
Rechnungsdatum: 15.03.2026

Stromabrechnung Februar 2026
Gesamtbetrag: 89,90 EUR
Zahlbar bis 31.03.2026`

/** The vision sample image rendered by the renderer contains this token. */
export const VISION_TOKEN = '4711'

/** Ollama tags omit `:latest`; settings may contain either form. */
export function hasModel(installed: string[], name: string): boolean {
  const norm = (n: string): string => (n.includes(':') ? n : `${n}:latest`)
  return installed.some((m) => norm(m) === norm(name))
}

function isLocalUrl(url: string): boolean {
  try {
    return ['localhost', '127.0.0.1', '[::1]', '0.0.0.0'].includes(new URL(url).hostname)
  } catch {
    return false
  }
}

/** Looks for an Ollama binary on PATH and at the default install locations. */
export function findOllamaBinary(env = process.env, platform = process.platform): string | null {
  const exe = platform === 'win32' ? 'ollama.exe' : 'ollama'
  const candidates = (env.PATH ?? '').split(delimiter).filter(Boolean).map((d) => join(d, exe))
  if (platform === 'win32' && env.LOCALAPPDATA) candidates.push(join(env.LOCALAPPDATA, 'Programs', 'Ollama', exe))
  if (platform === 'darwin') candidates.push('/Applications/Ollama.app', '/usr/local/bin/ollama', '/opt/homebrew/bin/ollama')
  if (platform === 'linux') candidates.push('/usr/local/bin/ollama', '/usr/bin/ollama')
  return candidates.find((c) => existsSync(c)) ?? null
}

export async function checkOllama(settings: Settings): Promise<OllamaStatus> {
  const local = isLocalUrl(settings.ollamaUrl)
  const base = { platform: process.platform, local, installed: local ? !!findOllamaBinary() : null }
  try {
    const { models, latency_ms } = await listModels(settings.ollamaUrl)
    const missingModels = [settings.ollamaModel, settings.ollamaVisionModel].filter((m) => !hasModel(models, m))
    return { ...base, reachable: true, models, latency_ms, missingModels: [...new Set(missingModels)] }
  } catch (err) {
    return { ...base, reachable: false, models: [], missingModels: [], error: (err as Error).message }
  }
}

async function timed(model: string, installed: string[], fn: () => Promise<{ ok: boolean; detail: string }>): Promise<ModelCheck> {
  if (!hasModel(installed, model)) {
    return { model, installed: false, ok: false, error: `Modell nicht installiert – „ollama pull ${model}“ ausführen` }
  }
  const started = Date.now()
  try {
    const r = await fn()
    return { model, installed: true, latency_ms: Date.now() - started, ...r }
  } catch (err) {
    return { model, installed: true, ok: false, latency_ms: Date.now() - started, error: (err as Error).message }
  }
}

/** Runs one real classification and one vision OCR request against the configured models. */
export async function testModels(settings: Settings, categories: Category[], samplePng: Uint8Array): Promise<ModelTestResult> {
  const { models } = await listModels(settings.ollamaUrl)
  const classifier = new OllamaClassifier(() => ({ url: settings.ollamaUrl, model: settings.ollamaModel }), () => categories)

  // sequential: Ollama swaps models in memory, parallel requests only slow both down
  const text = await timed(settings.ollamaModel, models, async () => {
    const r = await classifier.classify(SAMPLE_TEXT, AbortSignal.timeout(180_000))
    const detail = [`Kategorie: ${r.category_id}`, r.sender && `Absender: ${r.sender}`, r.amount !== null && `Betrag: ${r.amount}`]
      .filter(Boolean)
      .join(' · ')
    return { ok: true, detail }
  })
  const vision = await timed(settings.ollamaVisionModel, models, async () => {
    const out = await visionOcr(settings.ollamaUrl, settings.ollamaVisionModel, samplePng, AbortSignal.timeout(300_000))
    const snippet = out.replace(/\s+/g, ' ').slice(0, 80)
    return out.includes(VISION_TOKEN)
      ? { ok: true, detail: `Erkannt: „${snippet}“` }
      : { ok: false, detail: `Text nicht korrekt erkannt: „${snippet || '(leer)'}“` }
  })
  return { text, vision }
}
