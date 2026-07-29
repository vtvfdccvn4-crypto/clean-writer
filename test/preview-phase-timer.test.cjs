const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let PreviewPhaseTimer;

before(async () => {
  server = await createTestServer();
  ({ PreviewPhaseTimer } = await server.ssrLoadModule('/src/perf/preview-phase-timer.ts'));
});
after(async () => {
  await server?.close();
});

test('records completed and nested phase spans without throwing', () => {
  let now = 100;
  let wallClock = 1_000;
  const timer = new PreviewPhaseTimer({
    kind: 'document-preview',
    trigger: 'project-open',
    now: () => now,
    wallClock: () => wallClock,
    metadata: { sourceFileCount: 4 }
  });

  now = 110;
  const endCompile = timer.start('compile');
  now = 120;
  const endAssets = timer.start('asset-preload');
  now = 135;
  endAssets();
  now = 150;
  endCompile();
  wallClock = 1_050;

  const record = timer.finish('success', { metadata: { pageCount: 260 } });
  assert.equal(record.status, 'success');
  assert.equal(record.totalDurationMs, 50);
  assert.equal(record.metadata.sourceFileCount, 4);
  assert.equal(record.metadata.pageCount, 260);
  assert.equal(record.slowestPhase, 'compile');
  assert.equal(record.completedAt, 1_050);
  assert.deepEqual(record.phases.map(phase => phase.phase), [
    'asset-preload',
    'compile',
    'total'
  ]);
});

test('closes an unfinished phase safely during cancellation', () => {
  let now = 0;
  const timer = new PreviewPhaseTimer({
    kind: 'document-preview',
    now: () => now,
    wallClock: () => 2_000
  });

  now = 25;
  timer.start('paginate');
  now = 80;
  const record = timer.finish('cancelled');
  assert.equal(record.status, 'cancelled');
  assert.equal(record.errorMessage, undefined);
  assert.equal(record.phases.find(phase => phase.phase === 'paginate')?.durationMs, 55);
  assert.equal(record.totalDurationMs, 80);
});

test('finish is idempotent and missing phase completion is harmless', () => {
  let now = 10;
  const timer = new PreviewPhaseTimer({
    kind: 'page-guides',
    now: () => now,
    wallClock: () => 3_000
  });

  assert.equal(timer.end('paginate'), 0);
  now = 30;
  const first = timer.finish('failed', { error: new Error('test failure') });
  now = 50;
  const second = timer.finish('success');
  assert.strictEqual(second, first);
  assert.equal(first.status, 'failed');
  assert.equal(first.errorMessage, 'test failure');
});
