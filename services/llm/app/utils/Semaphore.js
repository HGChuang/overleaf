export class Semaphore {
  constructor(max) {
    this.max = Math.max(1, max || 5);
    this.current = 0;
    this.queue = [];
  }

  acquire() {
    if (this.current < this.max) {
      this.current += 1;
      return Promise.resolve();
    }
    return new Promise(resolve => this.queue.push(resolve));
  }

  release() {
    this.current = Math.max(0, this.current - 1);
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.current += 1;
      next();
    }
  }
}
