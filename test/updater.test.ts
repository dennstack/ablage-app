import { describe, expect, it, vi } from 'vitest'
import { isInstalledWindowsBuild, loadAutoUpdater, Updater, type UpdateEngine, type UpdaterDeps } from '../src/main/updater'

function fakeEngine() {
  const listeners = new Map<string, (arg: unknown) => void>()
  const engine = {
    autoDownload: false,
    on: (event: string, listener: (arg: unknown) => void) => listeners.set(event, listener),
    checkForUpdates: vi.fn(async () => {}),
    downloadUpdate: vi.fn(async () => {}),
    quitAndInstall: vi.fn()
  }
  return { engine, emit: (event: string, arg?: unknown) => listeners.get(event)!(arg) }
}

function setup(over: Partial<UpdaterDeps> = {}) {
  const fake = fakeEngine()
  const load = vi.fn(async () => fake.engine as unknown as UpdateEngine)
  const quit = vi.fn()
  const updater = new Updater({ supported: true, autoEnabled: () => false, load, notify: () => {}, quit, ...over })
  return { updater, load, quit, ...fake }
}

describe('loadAutoUpdater', () => {
  it('reads autoUpdater from the default export', async () => {
    const engine = { on: () => {} }
    vi.doMock('electron-updater', () => ({ default: { autoUpdater: engine } }))
    await expect(loadAutoUpdater()).resolves.toBe(engine)
    vi.doUnmock('electron-updater')
  })
})

describe('isInstalledWindowsBuild', () => {
  const opts = { packaged: true, platform: 'win32', productName: 'Ablage' }
  const exe = 'C:/Programs/Ablage/Ablage.exe'

  it('accepts a build with an uninstaller', () => {
    expect(isInstalledWindowsBuild(exe, opts, () => true)).toBe(true)
  })

  it('rejects portable and ZIP builds', () => {
    expect(isInstalledWindowsBuild(exe, opts, () => false)).toBe(false)
  })

  it('rejects dev runs and other platforms', () => {
    expect(isInstalledWindowsBuild(exe, { ...opts, packaged: false }, () => true)).toBe(false)
    expect(isInstalledWindowsBuild(exe, { ...opts, platform: 'linux' }, () => true)).toBe(false)
  })
})

describe('Updater', () => {
  it('never loads the engine while unsupported', async () => {
    const { updater, load } = setup({ supported: false, autoEnabled: () => true })
    updater.applySettings()
    await updater.check()
    expect(load).not.toHaveBeenCalled()
  })

  it('never contacts anything while the setting is off', () => {
    const { updater, load } = setup()
    updater.applySettings()
    expect(load).not.toHaveBeenCalled()
  })

  it('checks once when the setting turns on, not on every settings save', async () => {
    let enabled = true
    const { updater, engine } = setup({ autoEnabled: () => enabled })
    updater.applySettings()
    updater.applySettings()
    await vi.waitFor(() => expect(engine.checkForUpdates).toHaveBeenCalledTimes(1))
    enabled = false
    updater.applySettings()
    expect(engine.checkForUpdates).toHaveBeenCalledTimes(1)
  })

  it('waits for a click to download when the setting is off', async () => {
    const { updater, engine, emit } = setup()
    await updater.check()
    expect(engine.autoDownload).toBe(false)
    emit('update-available', { version: '2.0.0' })
    expect(updater.get()).toMatchObject({ phase: 'available', version: '2.0.0' })
    await updater.download()
    expect(engine.downloadUpdate).toHaveBeenCalled()
    emit('download-progress', { percent: 41.6 })
    expect(updater.get()).toMatchObject({ phase: 'downloading', version: '2.0.0', percent: 42 })
    emit('update-downloaded', { version: '2.0.0' })
    expect(updater.get()).toMatchObject({ phase: 'ready', version: '2.0.0' })
  })

  it('downloads on its own when the setting is on', async () => {
    const { updater, engine, emit } = setup({ autoEnabled: () => true })
    await updater.check()
    expect(engine.autoDownload).toBe(true)
    emit('update-available', { version: '2.0.0' })
    expect(updater.get().phase).toBe('downloading')
  })

  it('reports a failed check without throwing', async () => {
    const { updater, engine } = setup()
    engine.checkForUpdates.mockRejectedValueOnce(new Error('offline\nstack'))
    await updater.check()
    expect(updater.get()).toMatchObject({ phase: 'error', error: 'offline' })
  })

  it('can check again after an error', async () => {
    const { updater, engine, emit } = setup()
    engine.checkForUpdates.mockRejectedValueOnce(new Error('offline'))
    await updater.check()
    await updater.check()
    emit('update-not-available')
    expect(updater.get().phase).toBe('current')
  })

  it('quits first and installs only when asked after the shutdown', async () => {
    const { updater, engine, emit, quit } = setup()
    updater.requestInstall()
    expect(quit).not.toHaveBeenCalled()

    await updater.check()
    emit('update-downloaded', { version: '2.0.0' })
    updater.requestInstall()
    expect(quit).toHaveBeenCalled()
    expect(updater.installRequested).toBe(true)
    expect(engine.quitAndInstall).not.toHaveBeenCalled()

    updater.install()
    expect(engine.quitAndInstall).toHaveBeenCalledWith(true, true)
  })
})
