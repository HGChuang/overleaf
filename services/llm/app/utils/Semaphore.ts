export class Semaphore {
  max: number;
  current: number;
  queue: Array<() => void>;

  constructor(max: number) {
    this.max = Math.max(1, max || 5);
    this.current = 0;
    this.queue = [];
  }

  acquire(signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    if (this.current < this.max) {
      this.current += 1;
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const ready = () => {
        signal?.removeEventListener('abort', cancel);
        resolve();
      };
      const cancel = () => {
        const index = this.queue.indexOf(ready);
        if (index !== -1) this.queue.splice(index, 1);
        reject(signal?.reason);
      };
      this.queue.push(ready);
      signal?.addEventListener('abort', cancel, { once: true });
    });
  }

  release() {
    this.current = Math.max(0, this.current - 1);
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.current += 1;
      next?.();
    }
  }
}
