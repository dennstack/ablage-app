import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { AppUpdater } from 'electron-updater'
import type { UpdateState } from '@shared/types'

export const RELEASES_URL = 'https://github.com/dennstack/ablage-app/releases/latest'

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export type UpdateEngine = Pick<AppUpdater, 'autoDownload' | 'on' | 'checkForUpdates' | 'downloadUpdate' | 'quitAndInstall'>

export interface UpdaterDeps {
  supported: boolean
  autoEnabled(): boolean
  load(): Promise<UpdateEngine>
  notify(state: UpdateState): void
  quit(): void
}

/** Only the NSIS installer leaves an uninstaller next to the exe; portable and ZIP cannot replace themselves. */
export function isInstalledWindowsBuild(
  exePath: string,
  opts: { packaged: boolean; platform: string; productName: string },
  exists: (path: string) => boolean = existsSync
): boolean {
  if (!opts.packaged || opts.platform !== 'win32') return false
  return exists(join(dirname(exePath), `Uninstall ${opts.productName}.exe`))
}

export class Updater {
  private state: UpdateState
  private engine: UpdateEngine | null = null
  private timer: ReturnType<typeof setInterval> | null = null
  installRequested = false

  constructor(private d: UpdaterDeps) {
    this.state = { supported: d.supported, phase: 'idle' }
  }

  get(): UpdateState {
    return { ...this.state }
  }

  /** Starts or stops the periodic check. Nothing is loaded or contacted while the setting is off. */
  applySettings(): void {
    const enabled = this.d.supported && this.d.autoEnabled()
    if (enabled === (this.timer !== null)) return
    if (!enabled) {
      clearInterval(this.timer!)
      this.timer = null
      return
    }
    this.timer = setInterval(() => void this.check(), CHECK_INTERVAL_MS)
    this.timer.unref?.()
    void this.check()
  }

  async check(): Promise<UpdateState> {
    if (!this.d.supported || ['checking', 'downloading', 'ready'].includes(this.state.phase)) return this.get()
    this.set({ phase: 'checking' })
    await this.run(async (engine) => {
      engine.autoDownload = this.d.autoEnabled()
      await engine.checkForUpdates()
    })
    return this.get()
  }

  async download(): Promise<UpdateState> {
    if (this.state.phase !== 'available') return this.get()
    this.set({ phase: 'downloading', version: this.state.version, percent: 0 })
    await this.run((engine) => engine.downloadUpdate())
    return this.get()
  }

  requestInstall(): void {
    if (this.state.phase !== 'ready') return
    this.installRequested = true
    this.d.quit()
  }

  install(): void {
    try {
      this.engine?.quitAndInstall(true, true)
    } catch (err) {
      console.error('update install failed:', err)
    }
  }

  private async run(fn: (engine: UpdateEngine) => Promise<unknown>): Promise<void> {
    try {
      await fn(await this.getEngine())
    } catch (err) {
      this.fail(err)
    }
  }

  private async getEngine(): Promise<UpdateEngine> {
    if (this.engine) return this.engine
    const engine = await this.d.load()
    engine.on('update-available', (info) => {
      const phase = engine.autoDownload ? 'downloading' : 'available'
      this.set({ phase, version: info.version, percent: engine.autoDownload ? 0 : undefined })
    })
    engine.on('update-not-available', () => this.set({ phase: 'current' }))
    engine.on('download-progress', (p) => {
      this.set({ phase: 'downloading', version: this.state.version, percent: Math.round(p.percent) })
    })
    engine.on('update-downloaded', (info) => this.set({ phase: 'ready', version: info.version }))
    engine.on('error', (err) => this.fail(err))
    this.engine = engine
    return engine
  }

  private fail(err: unknown): void {
    const message = (err instanceof Error ? err.message : String(err)).split('\n')[0].slice(0, 200)
    console.warn('update failed:', message)
    this.set({ phase: 'error', error: message })
  }

  private set(next: Omit<UpdateState, 'supported'>): void {
    this.state = { supported: this.d.supported, ...next }
    this.d.notify(this.get())
  }
}
