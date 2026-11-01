import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, nativeTheme, net, protocol, shell } from 'electron'
import { AppContext } from './context'
import { registerIpc } from './ipc'
import { isInstalledWindowsBuild, loadAutoUpdater, Updater } from './updater'

protocol.registerSchemesAsPrivileged([
  { scheme: 'ablage', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

// German date inputs and number formats regardless of OS locale
app.commandLine.appendSwitch('lang', 'de-DE')

// separate profile for tests / parallel instances
if (process.env['ABLAGE_USER_DATA']) app.setPath('userData', process.env['ABLAGE_USER_DATA'])

const INSTALL_EXIT_TIMEOUT_MS = 5000

const devUrl = process.env['ELECTRON_RENDERER_URL']
let mainWindow: BrowserWindow | null = null
let ctx: AppContext
let updater: Updater

function isTrusted(url: string): boolean {
  if (devUrl) return url.startsWith(devUrl)
  return url.startsWith(pathToFileURL(join(__dirname, '../renderer')).href)
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 600,
    show: false,
    title: 'Ablage',
    // packaged builds take the icon from the executable
    icon: app.isPackaged ? undefined : join(app.getAppPath(), 'build/icon.png'),
    autoHideMenuBar: true,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#16181d' : '#f9fafb',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      plugins: true
    }
  })
  mainWindow.on('ready-to-show', () => mainWindow?.show())
  mainWindow.on('closed', () => {
    mainWindow = null
    app.quit() // the hidden worker window would otherwise keep the app alive
  })
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e, url) => {
    if (!isTrusted(url)) e.preventDefault()
  })

  if (devUrl) mainWindow.loadURL(devUrl)
  else mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
}

function registerProtocol(): void {
  // ablage://file/<id> and ablage://thumb/<id>; renderer never sees file system paths
  protocol.handle('ablage', async (req) => {
    const url = new URL(req.url)
    const id = decodeURIComponent(url.pathname.replace(/^\//, ''))
    if (url.host === 'thumb') {
      return net.fetch(pathToFileURL(ctx.pipeline.thumbPath(id)).href).catch(() => new Response(null, { status: 404 }))
    }
    if (url.host === 'file') {
      const doc = ctx.docs.get(id)
      if (!doc || !ctx.hasLibrary()) return new Response(null, { status: 404 })
      const res = await net.fetch(pathToFileURL(ctx.library().abs(doc.relative_path)).href)
      return new Response(res.body, { headers: { 'Content-Type': doc.mime_type } })
    }
    return new Response(null, { status: 404 })
  })
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  app.whenReady().then(async () => {
    app.setAppUserModelId('de.dennstack.ablage')
    const bundledCategories = app.isPackaged
      ? join(process.resourcesPath, 'categories.yaml')
      : join(app.getAppPath(), 'resources/categories.yaml')

    ctx = new AppContext({
      userData: app.getPath('userData'),
      bundledCategories,
      notify: (id) => mainWindow?.webContents.send('documents:changed', { id })
    })
    nativeTheme.themeSource = ctx.settings.get().theme
    registerProtocol()
    updater = new Updater({
      supported: isInstalledWindowsBuild(app.getPath('exe'), { packaged: app.isPackaged, platform: process.platform, productName: app.getName() }),
      autoEnabled: () => ctx.settings.get().autoUpdate,
      load: loadAutoUpdater,
      notify: (state) => mainWindow?.webContents.send('updates:changed', state),
      quit: () => app.quit()
    })
    registerIpc(ctx, updater, () => mainWindow, isTrusted)
    await ctx.start()
    createWindow()
    updater.applySettings()
  })

  let quitting = false
  app.on('will-quit', (event) => {
    if (!ctx || quitting) return
    quitting = true
    event.preventDefault()
    void ctx
      .shutdown()
      .catch((err) => console.error('shutdown failed:', err))
      .finally(() => {
        // the installer must not start before the shutdown has released the database
        if (!updater?.installRequested) return app.exit()
        updater.install()
        setTimeout(() => app.exit(), INSTALL_EXIT_TIMEOUT_MS)
      })
  })
}
