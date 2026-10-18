import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTaskQueue } from '../src/lib/task-queue.js';

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

test('runs tasks immediately when below the concurrency limit', async () => {
  const q = createTaskQueue({ concurrency: 2 });
  let concurrent = 0;
  let peak = 0;

  const task = async () => {
    concurrent += 1;
    peak = Math.max(peak, concurrent);
    await delay(20);
    concurrent -= 1;
  };

  await Promise.all([q.run(task), q.run(task)]);
  assert.equal(peak, 2);
  assert.ok(peak <= q.concurrency);
});

test('never exceeds the concurrency limit under load', async () => {
  const q = createTaskQueue({ concurrency: 2 });
  let concurrent = 0;
  let peak = 0;

  const task = async () => {
    concurrent += 1;
    peak = Math.max(peak, concurrent);
    await delay(5);
    concurrent -= 1;
  };

  await Promise.all(Array.from({ length: 12 }, () => q.run(task)));
  assert.equal(peak, 2);
  assert.equal(q.active, 0);
  assert.equal(q.pending, 0);
});

test('preserves FIFO ordering for queued work', async () => {
  const q = createTaskQueue({ concurrency: 1 });
  const order = [];
  const jobs = [1, 2, 3, 4, 5].map((n) => q.run(async () => {
    await delay(n === 1 ? 15 : 1);
    order.push(n);
    return n;
  }));
  const results = await Promise.all(jobs);
  assert.deepEqual(order, [1, 2, 3, 4, 5]);
  assert.deepEqual(results, [1, 2, 3, 4, 5]);
});

test('a failing task does not break the queue', async () => {
  const q = createTaskQueue({ concurrency: 1 });
  await assert.rejects(q.run(async () => { throw new Error('boom'); }), /boom/);
  assert.equal(q.active, 0);
  const value = await q.run(() => 'still-alive');
  assert.equal(value, 'still-alive');
});

test('supports sync task functions and propagates their results', async () => {
  const q = createTaskQueue({ concurrency: 3 });
  assert.equal(await q.run(() => 42), 42);
});

test('rejects a queued task without killing parallel siblings', async () => {
  const q = createTaskQueue({ concurrency: 2 });
  const first = q.run(() => delay(10).then(() => 'first'));
  const second = q.run(async () => { throw new Error('second failed'); });
  const third = q.run(() => 'third');

  // allSettled attaches handlers synchronously — no unhandled-rejection window.
  const results = await Promise.allSettled([first, second, third]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[0].value, 'first');
  assert.equal(results[1].status, 'rejected');
  assert.match(results[1].reason?.message || '', /second failed/);
  assert.equal(results[2].status, 'fulfilled');
  assert.equal(results[2].value, 'third');
});
