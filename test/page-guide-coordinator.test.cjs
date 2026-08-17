const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let PageGuideCoordinator;

before(async () => {
  server = await createTestServer({ server: { hmr: false } });
  ({ PageGuideCoordinator } = await server.ssrLoadModule('/src/ui/PageGuideCoordinator.ts'));
});

after(async () => server?.close());

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const guide = { pageNumber: 2, anchor: 'preview-source-1' };

test('typing bursts coalesce into one idle page-guide pass', async () => {
  let computeCount = 0;
  const applied = [];
  const snapshot = { projectId: 'project', documentPath: 'chapter.md', markdown: 'Draft', layoutRevision: 1 };
  const coordinator = new PageGuideCoordinator({
    getSnapshot: () => snapshot,
    compute: async () => {
      computeCount += 1;
      return { status: 'rendered', guides: [guide] };
    },
    isCurrent: () => true,
    apply: guides => applied.push(guides)
  }, { typingIdleMs: 10, layoutIdleMs: 5 });

  coordinator.schedule();
  coordinator.schedule();
  coordinator.schedule();
  await wait(35);

  assert.equal(computeCount, 1);
  assert.equal(applied.length, 1);
});

test('an already completed source and layout snapshot is not repaginated', async () => {
  let computeCount = 0;
  const snapshot = { projectId: 'project', documentPath: 'chapter.md', markdown: 'Draft', layoutRevision: 1 };
  const coordinator = new PageGuideCoordinator({
    getSnapshot: () => snapshot,
    compute: async () => {
      computeCount += 1;
      return { status: 'rendered', guides: [guide] };
    },
    isCurrent: () => true,
    apply: () => {}
  }, { typingIdleMs: 5, layoutIdleMs: 5 });

  coordinator.schedule();
  await wait(25);
  coordinator.schedule();
  await wait(25);

  assert.equal(computeCount, 1);
});

test('foreground cancellation stops an active guide pass without clearing valid guides', async () => {
  let started;
  let wasAborted = false;
  let applyCount = 0;
  const snapshot = { projectId: 'project', documentPath: 'chapter.md', markdown: 'Draft', layoutRevision: 1 };
  const coordinator = new PageGuideCoordinator({
    getSnapshot: () => snapshot,
    compute: (_snapshot, signal) => new Promise(resolve => {
      started = () => resolve({ status: 'rendered', guides: [guide] });
      signal.addEventListener('abort', () => { wasAborted = true; }, { once: true });
    }),
    isCurrent: () => true,
    apply: () => { applyCount += 1; }
  }, { typingIdleMs: 5, layoutIdleMs: 5 });

  coordinator.schedule('layout');
  await wait(20);
  coordinator.cancel();
  started();
  await wait(10);

  assert.equal(wasAborted, true);
  assert.equal(applyCount, 0);
});

test('a stale guide result cannot replace newer guides', async () => {
  let snapshot = { projectId: 'project', documentPath: 'chapter.md', markdown: 'First', layoutRevision: 1 };
  const resolvers = [];
  const applied = [];
  const coordinator = new PageGuideCoordinator({
    getSnapshot: () => snapshot,
    compute: () => new Promise(resolve => resolvers.push(resolve)),
    isCurrent: candidate => candidate.markdown === snapshot.markdown,
    apply: guides => applied.push(guides)
  }, { typingIdleMs: 5, layoutIdleMs: 5 });

  coordinator.schedule();
  await wait(15);
  snapshot = { ...snapshot, markdown: 'Second' };
  coordinator.schedule();
  await wait(15);
  resolvers[0]({ status: 'rendered', guides: [guide] });
  resolvers[1]({ status: 'rendered', guides: [{ ...guide, pageNumber: 3 }] });
  await wait(10);

  assert.deepEqual(applied, [[{ ...guide, pageNumber: 3 }]]);
});
