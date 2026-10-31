import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

const STABLE_WAIT_MS = 1500

/**
 * Polls the inbox folder. Polling instead of fs.watch because change
 * notifications are unreliable on SMB/NAS shares.
 */
export class InboxWatcher {
  private timer: NodeJS.Timeout | null = null
  private busy = false

  constructor(
    private dir: () => string | null,
    private intervalSeconds: () => number,
    private importFile: (path: string) => Promise<unknown>
  ) {}

  start(): void {
    this.stop()
    const tick = async (): Promise<void> => {
      await this.scan()
      this.timer = setTimeout(tick, Math.max(this.intervalSeconds(), 2) * 1000)
    }
    this.timer = setTimeout(tick, 1000)
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  async scan(): Promise<void> {
    const dir = this.dir()
    if (!dir || this.busy) return
    this.busy = true
    try {
      const entries = await readdir(dir, { withFileTypes: true })
      for (const e of entries) {
        if (!e.isFile() || e.name.startsWith('.') || e.name.startsWith('~$') || e.name.endsWith('.tmp')) continue
        const full = join(dir, e.name)
        if (await isStable(full)) await this.importFile(full)
      }
    } catch (err) {
      console.warn('inbox scan failed:', err)
    } finally {
      this.busy = false
    }
  }
}

/** A file still being copied (scanner, Explorer) changes size between two checks. */
async function isStable(path: string): Promise<boolean> {
  try {
    const a = await stat(path)
    await new Promise((r) => setTimeout(r, STABLE_WAIT_MS))
    const b = await stat(path)
    return a.size === b.size && a.mtimeMs === b.mtimeMs && a.size > 0
  } catch {
    return false
  }
}
