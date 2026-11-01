import { stat } from 'node:fs/promises'
import { dialog, ipcMain, type IpcMainInvokeEvent, nativeTheme, shell, type BrowserWindow } from 'electron'
import { z } from 'zod'
import type { AblageApi, Channel } from '@shared/ipc'
import type { CategoryUsage, ImportResult } from '@shared/types'
import { planChange } from './categories'
import type { AppContext } from './context'
import { transaction } from './db'
import { REFERENCES_SYNC_KEY } from './pipeline/pipeline'
import { checkOllama, OLLAMA_DOWNLOAD_URL, testModels } from './classifier/health'
import { rebuildFromLibrary } from './library/rebuild'
import { generateCode } from './lib/naming'
import { RELEASES_URL, type Updater } from './updater'

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

// Blank labels pass here: planChange rejects them with a readable message.
const categoryFields = {
  id: z.string().min(1),
  label: z.string().trim(),
  keywords: z.array(z.string().trim().min(1))
}

const categorySave = z.object({
  categories: z.array(z.object({ ...categoryFields, subcategories: z.array(z.object(categoryFields)).optional() })),
  reassign: z.record(z.string(), z.string()),
  version: z.string()
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
    setupCompleted: z.boolean(),
    autoUpdate: z.boolean(),
    theme: z.enum(['system', 'light', 'dark'])
  })
  .partial()

export function registerIpc(
  ctx: AppContext,
  updater: Updater,
  getWindow: () => BrowserWindow | null,
  isTrusted: (url: string) => boolean
): void {
  function handle<C extends Channel>(channel: C, fn: Handler<C>): void {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, ...args: unknown[]) => {
      if (!event.senderFrame || !isTrusted(event.senderFrame.url)) throw new Error('untrusted sender')
      return (fn as (...a: unknown[]) => unknown)(...args)
    })
  }

  const categoryUsage = (): Record<string, CategoryUsage> => {
    const usage: Record<string, CategoryUsage> = {}
    const entry = (id: string): CategoryUsage => (usage[id] ??= { documents: 0, trashed: 0, references: 0 })
    for (const { category_id, documents, trashed } of ctx.docs.countByCategory()) {
      Object.assign(entry(category_id), { documents, trashed })
    }
    for (const { category_id, references } of ctx.refs.countByCategory()) entry(category_id).references = references
    return usage
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
  handle('settings:update', (patch) => {
    const s = ctx.updateSettings(settingsPatch.parse(patch))
    nativeTheme.themeSource = s.theme
    updater.applySettings()
    return s
  })
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
  handle('updates:state', () => updater.get())
  handle('updates:check', () => updater.check())
  handle('updates:download', () => updater.download())
  handle('updates:install', () => updater.requestInstall())
  handle('updates:openDownloads', () => shell.openExternal(RELEASES_URL))
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
  handle('categories:load', () => {
    ctx.categories.reload()
    return {
      categories: ctx.categories.all(),
      usage: categoryUsage(),
      version: ctx.categories.version(),
      pendingSync: ctx.docs.pendingKeys().length
    }
  })
  handle('categories:retrySync', () => {
    ctx.library()
    return ctx.pipeline.exclusive(() => ctx.pipeline.syncPending())
  })
  handle('categories:save', (input) => {
    const { categories, reassign, version } = categorySave.parse(input)
    return ctx.pipeline.exclusive(async () => {
      if (ctx.categories.version() !== version) {
        throw new Error('categories.yaml wurde inzwischen geändert. Bitte „Verwerfen“ wählen und die Änderungen erneut vornehmen.')
      }
      ctx.categories.reload()
      const usage = categoryUsage()
      const plan = planChange(ctx.categories.all(), categories, reassign, new Set(Object.keys(usage)))
      // Without a library the journal could not be worked off and rebuilds would restore old ids.
      if ([...plan.removed, ...plan.relocate].some((id) => usage[id])) ctx.library()

      const removed = new Set(plan.removed)
      const targetOf = (id: string): string | undefined => (removed.has(id) ? reassign[id] : undefined)

      // Synchronous, so a quit cannot interrupt it. The YAML comes last: its failure rolls back the rest.
      transaction(ctx.db, () => {
        const affected = ctx.docs
          .idsByCategories([...plan.removed, ...plan.relocate])
          .filter((doc) => targetOf(doc.category_id) || !doc.deleted_at)
          .map((doc) => doc.id)
        let changedRefs = 0
        for (const id of plan.removed) {
          const target = targetOf(id)
          if (!target) continue
          changedRefs += ctx.refs.reassignCategory(id, target)
          ctx.docs.reassignCategory(id, target)
        }
        ctx.docs.markPending(changedRefs > 0 ? [...affected, REFERENCES_SYNC_KEY] : affected)
        ctx.categories.save(categories)
      })
      return ctx.pipeline.syncPending()
    })
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
    const library = ctx.library()
    const result = await ctx.pipeline.exclusive(async () => {
      await ctx.pipeline.syncPending()
      return rebuildFromLibrary(ctx.db, ctx.docs, library)
    })
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
