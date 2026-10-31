import { contextBridge, ipcRenderer } from 'electron'
import type { WorkerRequest, WorkerResponse } from '../shared/ipc'

contextBridge.exposeInMainWorld('worker', {
  ready: () => ipcRenderer.send('worker:ready'),
  onJob: (cb: (req: WorkerRequest) => void) => ipcRenderer.on('worker:job', (_, req: WorkerRequest) => cb(req)),
  reply: (res: WorkerResponse) => ipcRenderer.send('worker:result', res)
})
