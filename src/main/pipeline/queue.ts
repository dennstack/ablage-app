/** Serial job queue; a key that is already queued is not added twice. */
export class SerialQueue {
  private tail: Promise<void> = Promise.resolve()
  private queued = new Set<string>()

  push(key: string, job: () => Promise<void>): void {
    if (this.queued.has(key)) return
    this.queued.add(key)
    this.tail = this.tail.then(async () => {
      this.queued.delete(key)
      try {
        await job()
      } catch (err) {
        console.error(`job ${key} failed:`, err)
      }
    })
  }

  idle(): Promise<void> {
    return this.tail
  }
}
