import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { type AblageBridge, type AblageEvents, channels } from '../shared/ipc'

const invoke = Object.fromEntries(
  channels.map((c) => [c, (...args: unknown[]) => ipcRenderer.invoke(c, ...args)])
) as AblageBridge['invoke']

const bridge: AblageBridge = {
  invoke,
  on(event, cb) {
    const listener = (_: unknown, payload: AblageEvents[typeof event]): void => cb(payload)
    ipcRenderer.on(event, listener)
    return () => ipcRenderer.removeListener(event, listener)
  },
  pathForFile: (file) => webUtils.getPathForFile(file)
}

contextBridge.exposeInMainWorld('ablage', bridge)
