import type { AblageBridge, WorkerRequest, WorkerResponse } from '../shared/ipc'

declare global {
  interface Window {
    ablage: AblageBridge
    worker: {
      ready(): void
      onJob(cb: (req: WorkerRequest) => void): void
      reply(res: WorkerResponse): void
    }
  }
}
