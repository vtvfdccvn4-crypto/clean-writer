const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let CoalescingTaskQueue;
let previewMetrics;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24688 } } });
  ({ CoalescingTaskQueue } = await server.ssrLoadModule('/src/utils/CoalescingTaskQueue.ts'));
  ({ previewMetrics } = await server.ssrLoadModule('/src/perf/preview-metrics.ts'));
});

after(async () => server?.close());

test('synchronous requests coalesce into one run with the newest value', async () => {
  const runs = [];
  const queue = new CoalescingTaskQueue(async value => runs.push(value), () => undefined);

  queue.request('selection');
  queue.request('tree');
  queue.request('settings');
  await queue.whenIdle();

  assert.deepEqual(runs, ['settings']);
});

test('a project-load event burst records one full-document compile and render', async () => {
  previewMetrics.reset();
  const queue = new CoalescingTaskQueue(async () => {
    previewMetrics.recordPreviewCompile('full-document', 4);
    previewMetrics.recordPreviewRender('force-render', 8);
  }, () => undefined);

  queue.request('project snapshot');
  queue.request('settings snapshot');
  queue.request('full-document selection');
  await queue.whenIdle();

  const buckets = previewMetrics.snapshot().buckets;
  assert.equal(buckets['previewCompile:full-document'].count, 1);
  assert.equal(buckets['previewRender:force-render'].count, 1);
});

test('a request arriving during work marks that work stale and runs once more', async () => {
  const runs = [];
  let releaseFirst;
  const firstBlocked = new Promise(resolve => { releaseFirst = resolve; });
  const queue = new CoalescingTaskQueue(async (value, isLatest) => {
    runs.push({ value, latestAtStart: isLatest() });
    if (value === 'first') {
      await firstBlocked;
      runs.push({ value, latestAtEnd: isLatest() });
    }
  }, () => undefined);

  queue.request('first');
  await Promise.resolve();
  queue.request('second');
  releaseFirst();
  await queue.whenIdle();

  assert.deepEqual(runs, [
    { value: 'first', latestAtStart: true },
    { value: 'first', latestAtEnd: false },
    { value: 'second', latestAtStart: true }
  ]);
});
