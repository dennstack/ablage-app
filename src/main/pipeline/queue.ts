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
}

/** Shared holders run concurrently; an exclusive holder waits for them and blocks new ones. */
export class Gate {
  private active = new Set<Promise<unknown>>()
  private writer: Promise<void> | null = null

  async shared<T>(fn: () => Promise<T>): Promise<T> {
    while (this.writer) await this.writer
    const run = fn()
    this.active.add(run)
    try {
      return await run
    } finally {
      this.active.delete(run)
    }
  }

  /** Not reentrant: `fn` must not call `shared` or `exclusive`. */
  async exclusive<T>(fn: () => Promise<T>): Promise<T> {
    while (this.writer) await this.writer
    const run = Promise.allSettled([...this.active]).then(fn)
    const done = run.then(
      () => undefined,
      () => undefined
    )
    this.writer = done
    try {
      return await run
    } finally {
      this.writer = null
    }
  }
}
