import type { AblageEvents } from '@shared/ipc'

/** Typed bridge to the main process; every call is an IPC invoke. */
export const api = window.ablage.invoke

export function onEvent<E extends keyof AblageEvents>(event: E, cb: (p: AblageEvents[E]) => void): () => void {
  return window.ablage.on(event, cb)
}

export function pathForFile(file: File): string {
  return window.ablage.pathForFile(file)
}

/** Electron prefixes errors from ipcMain handlers; strip that for display. */
export function errorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
