import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Settings } from '@shared/types'

export const defaultSettings: Settings = {
  libraryPath: null,
  pathTemplate: '{category}/{year}/{date}_{sender}_{title}',
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'mistral',
  ollamaVisionModel: 'qwen2.5vl',
  classifierMode: 'ollama',
  watchInbox: true,
  inboxPollSeconds: 10,
  theme: 'system',
  setupCompleted: false
}

export class SettingsStore {
  private file: string
  private value: Settings

  constructor(dir: string) {
    this.file = join(dir, 'settings.json')
    this.value = { ...defaultSettings }
    if (existsSync(this.file)) {
      try {
        this.value = { ...defaultSettings, ...JSON.parse(readFileSync(this.file, 'utf8')) }
      } catch {
        // corrupt file: keep defaults, overwritten on next save
      }
    }
  }

  get(): Settings {
    return { ...this.value }
  }

  update(patch: Partial<Settings>): Settings {
    this.value = { ...this.value, ...patch }
    writeFileSync(this.file, JSON.stringify(this.value, null, 2))
    return this.get()
  }
}
