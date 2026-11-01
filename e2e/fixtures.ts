import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { _electron as electron, test as base, type ElectronApplication, type Page } from '@playwright/test'
import type { AblageBridge } from '@shared/ipc'
import type { Document } from '@shared/types'

declare global {
  interface Window {
    ablage: AblageBridge
  }
}

const ROOT = resolve(__dirname, '..')

export interface AblageApp {
  page: Page
  library: string
  userData: string
  invoke(channel: string, ...args: unknown[]): Promise<any> // eslint-disable-line @typescript-eslint/no-explicit-any
  /** Imports a text file and assigns it to a category, independent of the classifier. */
  addDocument(name: string, categoryId: string): Promise<Document>
  addReference(categoryId: string): Promise<void>
  openEditor(): Promise<void>
  save(): Promise<void>
  files(): string[]
  sidecar(id: string): Document
  yaml(): string
}

export const test = base.extend<{ app: AblageApp }>({
  app: async ({}, use, testInfo) => {
    const userData = testInfo.outputPath('userData')
    const library = testInfo.outputPath('library')
    const inbox = testInfo.outputPath('input')
    for (const dir of [userData, library, inbox]) mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(userData, 'settings.json'),
      JSON.stringify({ libraryPath: library, setupCompleted: true, classifierMode: 'rules', watchInbox: false })
    )

    const electronApp = await electron.launch({
      args: [ROOT, ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
      env: { ...process.env, ABLAGE_USER_DATA: userData } as Record<string, string>
    })
    const main = await mainWindow(electronApp)
    await main.waitForLoadState()

    const invoke: AblageApp['invoke'] = (channel, ...args) =>
      main.evaluate(([c, a]) => (window.ablage.invoke as any)[c as string](...(a as unknown[])), [channel, args] as const) // eslint-disable-line @typescript-eslint/no-explicit-any

    const app: AblageApp = {
      page: main,
      library,
      userData,
      invoke,
      addDocument: async (name, categoryId) => {
        const file = join(inbox, `${name}.txt`)
        writeFileSync(file, `Inhalt von ${name}`)
        const [result] = await invoke('documents:importPaths', [file])
        await expectIdle(invoke)
        return invoke('documents:update', result.id, { category_id: categoryId })
      },
      addReference: async (categoryId) => {
        await invoke('folders:create', { code: 'A1', label: 'Ordner', location: null })
        await invoke('references:create', {
          folder_code: 'A1',
          doc_id_code: 'C0DE',
          title: 'Papier',
          category_id: categoryId,
          description: null,
          doc_date: null,
          sender: null
        })
      },
      openEditor: async () => {
        await main.evaluate(() => {
          location.hash = '#/settings'
        })
        await main.getByRole('button', { name: 'Kategorien bearbeiten' }).click()
        await main.locator('#rechnung-label').waitFor()
      },
      save: async () => {
        await main.getByRole('button', { name: 'Speichern' }).click()
        await main.getByRole('alertdialog').getByRole('button', { name: 'Speichern' }).click()
      },
      files: () => listFiles(join(library, 'Dokumente')),
      sidecar: (id) => JSON.parse(readFileSync(join(library, '.ablage/meta', `${id}.json`), 'utf8')).document,
      yaml: () => readFileSync(join(userData, 'categories.yaml'), 'utf8')
    }

    await use(app)
    await electronApp.close()
  }
})

/** The app also opens a hidden pdf worker window. */
async function mainWindow(app: ElectronApplication): Promise<Page> {
  for (let i = 0; i < 120; i++) {
    const page = app.windows().find((w) => !w.url().includes('worker'))
    if (page) return page
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('main window did not open')
}

async function expectIdle(invoke: AblageApp['invoke']): Promise<void> {
  for (let i = 0; i < 80; i++) {
    if ((await invoke('dashboard:get')).counts.pending === 0) return
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('pipeline did not become idle')
}

function listFiles(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]
  )
}

export { expect } from '@playwright/test'
