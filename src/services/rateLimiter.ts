interface QueueItem {
  resolve: () => void;
}

export class RateLimiter {
  private activeRequests = 0;
  private lastRequestTime = 0;
  private queue: QueueItem[] = [];

  constructor(
    private maxConcurrent: number,
    private minInterval: number
  ) {
    // ガード: 最小値を保証
    if (isNaN(maxConcurrent) || maxConcurrent <= 0) {
      throw new Error('RateLimiter: maxConcurrent must be a positive number');
    }
    if (isNaN(minInterval) || minInterval < 0) {
      throw new Error('RateLimiter: minInterval must be a non-negative number');
    }
    this.maxConcurrent = Math.max(1, Math.floor(maxConcurrent));
    this.minInterval = Math.max(0, Math.floor(minInterval));
  }

  async acquire(): Promise<void> {
    // スロットを確保してから待機処理に入る
    while (this.activeRequests >= this.maxConcurrent) {
      // キューに追加して待機
      await new Promise<void>((resolve) => {
        this.queue.push({ resolve });
      });
    }

    // スロット確保（他のリクエストがこれ以上入れないようにする）
    this.activeRequests++;

    // 最小間隔を確保
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < this.minInterval) {
      await this.sleep(this.minInterval - elapsed);
    }

    this.lastRequestTime = Date.now();
  }

  release(): void {
    // 負値にならないようにガード
    this.activeRequests = Math.max(this.activeRequests - 1, 0);

    // キューにあるリクエストを1つ解放
    const next = this.queue.shift();
    if (next) {
      next.resolve();
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
