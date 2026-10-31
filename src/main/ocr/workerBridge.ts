import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import type { WorkerPage, WorkerRequest, WorkerResponse } from '@shared/ipc'

interface Pending {
  resolve: (r: WorkerResponse) => void
  reject: (e: Error) => void
  timer: NodeJS.Timeout
}

/**
 * Hidden renderer that owns pdf.js and <canvas>: extracts PDF text layers,
 * renders pages to PNG and creates thumbnails. Avoids native image modules.
 */
export class WorkerBridge {
  private win: BrowserWindow | null = null
  private ready: Promise<void> | null = null
  private pending = new Map<string, Pending>()

  constructor() {
    ipcMain.on('worker:result', (event, res: WorkerResponse) => {
      if (event.sender !== this.win?.webContents) return
      const p = this.pending.get(res.jobId)
      if (!p) return
      clearTimeout(p.timer)
      this.pending.delete(res.jobId)
      if (res.error) p.reject(new Error(res.error))
      else p.resolve(res)
    })
  }

  private ensure(): Promise<void> {
    if (this.win && !this.win.isDestroyed() && this.ready) return this.ready
    this.win = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/worker.js'),
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false
      }
    })
    this.win.on('closed', () => {
      this.win = null
      this.ready = null
      for (const [id, p] of this.pending) {
        clearTimeout(p.timer)
        p.reject(new Error('Worker-Fenster wurde geschlossen'))
        this.pending.delete(id)
      }
    })
    const win = this.win
    this.ready = new Promise<void>((resolve) => ipcMain.once('worker:ready', () => resolve()))
    if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/worker.html`)
    else win.loadFile(join(__dirname, '../renderer/worker.html'))
    return this.ready
  }

  async run(req: Omit<WorkerRequest, 'jobId'>, timeoutMs = 120_000): Promise<{ pages: WorkerPage[]; thumbnail?: Uint8Array }> {
    await this.ensure()
    const jobId = randomUUID()
    const res = await new Promise<WorkerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(jobId)
        reject(new Error('Zeitüberschreitung bei der PDF-Verarbeitung'))
      }, timeoutMs)
      this.pending.set(jobId, { resolve, reject, timer })
      this.win!.webContents.send('worker:job', { ...req, jobId } satisfies WorkerRequest)
    })
    return { pages: res.pages ?? [], thumbnail: res.thumbnail }
  }

  destroy(): void {
    this.win?.destroy()
  }
}
