import { toast } from 'sonner'
import type { ImportResult } from '@shared/types'
import { api, errorMessage, pathForFile } from './api'

export function reportImport(results: ImportResult[]): void {
  const queued = results.filter((r) => r.status === 'queued').length
  if (queued) toast.success(`${queued} Dokument${queued === 1 ? '' : 'e'} importiert`, { description: 'Verarbeitung läuft im Hintergrund' })
  for (const r of results) {
    if (r.status === 'duplicate') toast.warning(`${r.file} ist bereits vorhanden`, { description: r.existing_title })
    if (r.status === 'error') toast.error(`${r.file} konnte nicht importiert werden`, { description: r.error })
  }
}

export async function pickAndImport(): Promise<void> {
  try {
    reportImport(await api['documents:pickAndImport']())
  } catch (err) {
    toast.error(errorMessage(err))
  }
}

export async function importFiles(files: FileList | File[]): Promise<void> {
  const paths = Array.from(files).map(pathForFile).filter(Boolean)
  if (!paths.length) return
  try {
    reportImport(await api['documents:importPaths'](paths))
  } catch (err) {
    toast.error(errorMessage(err))
  }
}
