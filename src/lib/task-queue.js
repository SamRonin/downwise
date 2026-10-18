/**
 * Tiny zero-dependency task queue (semaphore).
 * Keeps heavy conversions from running all at once — several simultaneous
 * clicks must not spike memory across worker + offscreen document and crash
 * Chrome tabs. Pure module — also imported by Node tests.
 */

/**
 * @param {{ concurrency?: number, label?: string }} options
 * @returns {{ run: (fn: () => Promise|any) => Promise<any>, active: number, pending: number, concurrency: number, label?: string }}
 */
export function createTaskQueue({ concurrency = 2, label } = {}) {
  const limit = Math.max(1, Math.floor(Number(concurrency)) || 1);
  let active = 0;
  const waiting = [];

  function pump() {
    while (active < limit && waiting.length > 0) {
      const next = waiting.shift();
      active += 1;
      Promise.resolve()
        .then(next.fn)
        .then(
          (value) => {
            active -= 1;
            next.resolve(value);
            pump();
          },
          (err) => {
            active -= 1;
            next.reject(err);
            pump();
          },
        );
    }
  }

  return {
    run(fn) {
      return new Promise((resolve, reject) => {
        waiting.push({ fn, resolve, reject });
        pump();
      });
    },
    get active() {
      return active;
    },
    get pending() {
      return waiting.length;
    },
    get concurrency() {
      return limit;
    },
    label,
  };
}

/**
 * Shared queues for DownWise:
 * - conversions: image/audio/video decode+encode work (CPU & memory heavy)
 * - blobUrls:    blob URL round-trips to the offscreen document (cheap, but
 *                serialized so the offscreen doc is only started when needed)
 */
export const conversionQueue = createTaskQueue({ concurrency: 2, label: 'conversions' });
export const blobUrlQueue = createTaskQueue({ concurrency: 1, label: 'blobUrls' });
