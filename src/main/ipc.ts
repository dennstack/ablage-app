import { stat } from 'node:fs/promises'
import { dialog, ipcMain, type IpcMainInvokeEvent, shell, type BrowserWindow } from 'electron'
import { z } from 'zod'
import type { AblageApi, Channel } from '@shared/ipc'
import type { ImportResult } from '@shared/types'
import type { AppContext } from './context'
import { checkOllama, OLLAMA_DOWNLOAD_URL, testModels } from './classifier/health'
import { rebuildFromLibrary } from './library/rebuild'
import { generateCode } from './lib/naming'

type Handler<C extends Channel> = (
  ...args: Parameters<AblageApi[C]>
) => ReturnType<AblageApi[C]> | Promise<ReturnType<AblageApi[C]>>

const dateOrNull = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()
const optText = z.string().trim().nullable().transform((v) => v || null)

const documentPatch = z
  .object({
    title: z.string().trim().min(1),
    category_id: z.string().min(1),
    doc_date: dateOrNull,
    sender: optText,
    amount: z.number().finite().nullable()
  })
  .partial()

const referenceInput = z.object({
  folder_code: z.string().trim().min(1),
  doc_id_code: z.string().trim().min(1),
  title: z.string().trim().min(1),
  category_id: z.string().min(1),
  description: optText,
  doc_date: dateOrNull,
  sender: optText
})

const folderInput = z.object({
  code: z.string().trim().min(1),
  label: z.string().trim().min(1),
  location: optText
})

const settingsPatch = z
  .object({
    pathTemplate: z.string().trim().min(1),
    ollamaUrl: z.string().url(),
    ollamaModel: z.string().trim().min(1),
    ollamaVisionModel: z.string().trim().min(1),
    classifierMode: z.enum(['ollama', 'rules']),
    watchInbox: z.boolean(),
    inboxPollSeconds: z.number().int().min(2).max(3600),
    setupCompleted: z.boolean()
  })
  .partial()

export function registerIpc(ctx: AppContext, getWindow: () => BrowserWindow | null, isTrusted: (url: string) => boolean): void {
  function handle<C extends Channel>(channel: C, fn: Handler<C>): void {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (!event.senderFrame || !isTrusted(event.senderFrame.url)) throw new Error('untrusted sender')
      return (fn as (...a: unknown[]) => unknown)(...args)
    })
  }

  const importPaths = async (paths: string[]): Promise<ImportResult[]> => {
    const results: ImportResult[] = []
    for (const p of paths) {
      if (!(await stat(p)).isFile()) continue
      results.push(await ctx.pipeline.importFile(p, false))
    }
    return results
  }

  handle('settings:get', () => ctx.settings.get())
  handle('settings:update', (patch) => ctx.updateSettings(settingsPatch.parse(patch)))
  handle('settings:pickLibrary', async () => {
    const win = getWindow()
    const opts = { title: 'Bibliotheksordner wählen', properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[] }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    if (res.canceled || !res.filePaths[0]) return null
    await ctx.setLibrary(res.filePaths[0])
    return res.filePaths[0]
  })
  handle('settings:testOllama', () => checkOllama(ctx.settings.get()))
  handle('settings:testModels', (png) => testModels(ctx.settings.get(), ctx.categories.all(), z.instanceof(Uint8Array).parse(png)))
  handle('settings:openOllamaDownload', () => shell.openExternal(OLLAMA_DOWNLOAD_URL))
  handle('settings:openLibrary', async () => {
    await shell.openPath(ctx.library().root)
  })

  handle('categories:list', () => {
    ctx.categories.reload()
    return ctx.categories.all()
  })
  handle('categories:openFile', async () => {
    await shell.openPath(ctx.categories.file)
  })

  handle('dashboard:get', () => ({
    recent: ctx.docs.list({ limit: 8 }).items,
    counts: { ...ctx.docs.counts(), references: ctx.refs.count() }
  }))

  handle('documents:list', (query) => ctx.docs.list(query ?? {}))
  handle('documents:get', (id) => ctx.docs.get(id))
  handle('documents:update', (id, patch) => ctx.pipeline.updateMetadata(id, documentPatch.parse(patch)))
  handle('documents:delete', (id) => ctx.pipeline.trash(id))
  handle('documents:reprocess', (id) => ctx.pipeline.enqueue(id, 'full'))
  handle('documents:reclassify', (id) => ctx.pipeline.enqueue(id, 'classify'))
  handle('documents:showInFolder', (id) => {
    const doc = ctx.docs.get(id)
    if (doc) shell.showItemInFolder(ctx.library().abs(doc.relative_path))
  })
  handle('documents:openExternal', async (id) => {
    const doc = ctx.docs.get(id)
    if (doc) await shell.openPath(ctx.library().abs(doc.relative_path))
  })
  handle('documents:pickAndImport', async () => {
    ctx.library()
    const win = getWindow()
    const opts = {
      title: 'Dokumente importieren',
      properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[],
      filters: [
        { name: 'Dokumente', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'webp', 'txt', 'docx', 'xlsx'] },
        { name: 'Alle Dateien', extensions: ['*'] }
      ]
    }
    const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
    return res.canceled ? [] : importPaths(res.filePaths)
  })
  handle('documents:importPaths', (paths) => importPaths(z.array(z.string()).parse(paths)))
  handle('documents:suggestions', (prefix) => ctx.docs.suggestions(prefix))

  handle('trash:list', () => ctx.docs.list({ limit: 500 }, true))
  handle('trash:restore', (id) => ctx.pipeline.restore(id))
  handle('trash:purge', (id) => ctx.pipeline.purge(id))

  handle('library:rebuild', async () => {
    await ctx.pipeline.idle()
    const result = await rebuildFromLibrary(ctx.db, ctx.docs, ctx.library())
    ctx.pipeline.resumeUnfinished()
    return result
  })

  handle('folders:list', () => ctx.refs.listFolders())
  handle('folders:create', async (input) => {
    const folder = ctx.refs.createFolder(folderInput.parse(input))
    await ctx.saveReferences()
    return folder
  })
  handle('folders:delete', async (code) => {
    ctx.refs.deleteFolder(code)
    await ctx.saveReferences()
  })
  handle('references:list', (folderCode) => ctx.refs.list(folderCode))
  handle('references:create', async (input) => {
    const ref = ctx.refs.create(referenceInput.parse(input))
    await ctx.saveReferences()
    return ref
  })
  handle('references:update', async (id, patch) => {
    const ref = ctx.refs.update(id, referenceInput.partial().parse(patch))
    await ctx.saveReferences()
    return ref
  })
  handle('references:delete', async (id) => {
    ctx.refs.remove(id)
    await ctx.saveReferences()
  })
  handle('references:generateCode', () => {
    let code = generateCode()
    while (ctx.refs.codeExists(code)) code = generateCode()
    return code
  })
}
