/**
 * A minimal async mutex used as the `busy` guard (SPEC §4b / G5): bridge calls run
 * through it so two never race. Serializes (queues) rather than rejecting.
 */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();
  private depth = 0;

  /** True while a critical section is in flight (reported by `status` as `busy`). */
  isLocked(): boolean {
    return this.depth > 0;
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    const prev = this.tail;
    let release!: () => void;
    this.tail = new Promise<void>((r) => {
      release = r;
    });
    await prev;
    this.depth += 1;
    try {
      return await fn();
    } finally {
      this.depth -= 1;
      release();
    }
  }
}
