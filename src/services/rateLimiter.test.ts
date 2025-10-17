import { RateLimiter } from './rateLimiter';

describe('RateLimiter', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('基本的な動作', () => {
    it('最大同時実行数を守る', async () => {
      const limiter = new RateLimiter(2, 100); // 最大2並列、100ms間隔
      let activeCount = 0;
      let maxActiveCount = 0;

      const task = async () => {
        await limiter.acquire();
        activeCount++;
        maxActiveCount = Math.max(maxActiveCount, activeCount);

        // 50ms待機してからrelease
        setTimeout(() => {
          activeCount--;
          limiter.release();
        }, 50);
      };

      // 5つのタスクを同時実行
      const promises = [task(), task(), task(), task(), task()];

      // タイマーを進める
      jest.advanceTimersByTime(50);
      await Promise.resolve();

      jest.advanceTimersByTime(100);
      await Promise.resolve();

      expect(maxActiveCount).toBeLessThanOrEqual(2);
    });

    it('acquire()を呼ぶとスロットを取得する', async () => {
      const limiter = new RateLimiter(1, 100);

      const promise = limiter.acquire();
      jest.advanceTimersByTime(0);
      await promise;

      // スロット取得後、activeRequestsが1になっているはず
      expect(limiter['activeRequests']).toBe(1);
    });

    it('release()を呼ぶとスロットを解放する', async () => {
      const limiter = new RateLimiter(1, 100);

      await limiter.acquire();
      expect(limiter['activeRequests']).toBe(1);

      limiter.release();
      expect(limiter['activeRequests']).toBe(0);
    });
  });

  describe('最小間隔の制御', () => {
    it('minInterval経過前の連続リクエストは待機する', async () => {
      const limiter = new RateLimiter(5, 1000); // 最大5並列、1000ms間隔

      await limiter.acquire();
      const firstTime = limiter['lastRequestTime'];
      limiter.release();

      // 2回目のacquire（1000ms待つはず）
      const promise = limiter.acquire();

      // 999ms経過時点ではまだsleep中（activeRequestsは既に1）
      jest.advanceTimersByTime(999);
      await Promise.resolve();

      // スロットは確保されているがsleep中
      expect(limiter['activeRequests']).toBe(1);

      // 1ms進めて1000ms経過
      jest.advanceTimersByTime(1);
      await promise;

      // lastRequestTimeが更新されている
      expect(limiter['lastRequestTime']).toBeGreaterThan(firstTime);
      limiter.release();
    });

    it('minInterval経過後は即座にリクエスト可能', async () => {
      const limiter = new RateLimiter(5, 1000);

      await limiter.acquire();
      limiter.release();

      // 1000ms経過
      jest.advanceTimersByTime(1000);

      // 2回目のacquireは即座に完了
      await limiter.acquire();
      expect(limiter['activeRequests']).toBe(1);
      limiter.release();
    });
  });

  describe('キュー制御', () => {
    it('最大並列数を超えるとキューに入る', async () => {
      const limiter = new RateLimiter(1, 100); // 最大1並列

      // 1つ目のスロットを取得
      await limiter.acquire();
      expect(limiter['activeRequests']).toBe(1);

      // 2つ目はキューに入るべき
      const promise2 = limiter.acquire();
      jest.advanceTimersByTime(0);
      await Promise.resolve();

      // まだスロット取得できていない
      expect(limiter['activeRequests']).toBe(1);

      // 1つ目を解放
      limiter.release();
      jest.advanceTimersByTime(100);
      await promise2;

      // 2つ目がスロット取得
      expect(limiter['activeRequests']).toBe(1);
      limiter.release();
    });

    it('複数のリクエストがキューで公平に待機する', async () => {
      const limiter = new RateLimiter(1, 50);
      const executionOrder: number[] = [];

      const task = async (id: number) => {
        await limiter.acquire();
        executionOrder.push(id);
        limiter.release();
      };

      // 3つのタスクを並列実行
      const promises = [task(1), task(2), task(3)];

      // 十分な時間を進める
      for (let i = 0; i < 5; i++) {
        jest.advanceTimersByTime(50);
        await Promise.resolve();
      }

      await Promise.all(promises);

      // FIFO順で実行される
      expect(executionOrder).toEqual([1, 2, 3]);
    });
  });

  describe('エッジケース', () => {
    it('release()を余分に呼んでも負値にならない', () => {
      const limiter = new RateLimiter(1, 100);

      limiter.release();
      limiter.release();

      expect(limiter['activeRequests']).toBe(0);
    });

    it('同時に大量のリクエストが来ても正常動作する', async () => {
      const limiter = new RateLimiter(2, 50);
      const tasks = Array.from({ length: 10 }, (_, i) =>
        limiter.acquire().then(() => {
          limiter.release();
          return i;
        })
      );

      // タイマーを十分進める
      for (let i = 0; i < 10; i++) {
        jest.advanceTimersByTime(50);
        await Promise.resolve();
      }

      const results = await Promise.all(tasks);

      // 全タスクが完了していること
      expect(results.length).toBe(10);
    });
  });
});
