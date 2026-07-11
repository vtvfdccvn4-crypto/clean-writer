const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let ChangeCommitQueue;
let DraftRecoveryStore;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24684 } } });
  ({ ChangeCommitQueue } = await server.ssrLoadModule('/src/editor/ChangeCommitQueue.ts'));
  ({ DraftRecoveryStore } = await server.ssrLoadModule('/src/editor/DraftRecoveryStore.ts'));
});

after(async () => server?.close());

test('flush commits the newest debounced document exactly once before navigation', async () => {
  const commits = [];
  const queue = new ChangeCommitQueue(async value => commits.push(value), () => undefined, 60_000);

  queue.schedule('first draft');
  queue.schedule('final draft');
  await queue.flush();
  await queue.flush();

  assert.deepEqual(commits, ['final draft']);
});

test('flush waits for serialized persistence and reports its failure', async () => {
  const expected = new Error('disk full');
  const queue = new ChangeCommitQueue(async () => { throw expected; }, () => undefined, 60_000);
  queue.schedule('valuable text');

  await assert.rejects(queue.flush(), expected);
});

test('cancel prevents a destroyed editor from committing a stale callback', async () => {
  const commits = [];
  const queue = new ChangeCommitQueue(async value => commits.push(value), () => undefined, 5);
  queue.schedule('stale section');
  queue.cancel();
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.deepEqual(commits, []);
});

test('hasUnsavedChanges stays true while a commit is still in flight', async () => {
  let releaseCommit;
  const blockedCommit = new Promise(resolve => {
    releaseCommit = resolve;
  });
  const queue = new ChangeCommitQueue(
    async () => {
      await blockedCommit;
    },
    () => undefined,
    60_000
  );

  queue.schedule('draft in flight');
  const flushPromise = queue.flush();

  assert.equal(queue.hasUnsavedChanges(), true);

  releaseCommit();
  await flushPromise;

  assert.equal(queue.hasUnsavedChanges(), false);
});

test('a failed commit restores the dirty state allowing a successful retry', async () => {
  let shouldFail = true;
  const commits = [];
  const queue = new ChangeCommitQueue(
    async value => {
      if (shouldFail) throw new Error('Network error');
      commits.push(value);
    },
    () => undefined,
    60_000
  );

  queue.schedule('important edit');
  assert.equal(queue.hasUnsavedChanges(), true);

  await assert.rejects(queue.flush(), /Network error/);
  
  // The commit failed, but we should still have unsaved changes.
  assert.equal(queue.hasUnsavedChanges(), true);
  
  // Retry successfully
  shouldFail = false;
  await queue.flush();
  
  // Changes are now saved
  assert.equal(queue.hasUnsavedChanges(), false);
  assert.deepEqual(commits, ['important edit']);
});

test('draft recovery store saves, reads, and clears section drafts', () => {
  const storage = new Map();
  const previousLocalStorage = global.localStorage;
  global.localStorage = {
    setItem(key, value) { storage.set(key, String(value)); },
    getItem(key) { return storage.has(key) ? storage.get(key) : null; },
    removeItem(key) { storage.delete(key); }
  };

  try {
    DraftRecoveryStore.saveDraft('project-1', 'sections/a.md', 'temporary text');
    assert.equal(DraftRecoveryStore.getDraft('project-1', 'sections/a.md'), 'temporary text');
    DraftRecoveryStore.markSaved('project-1', 'sections/a.md');
    storage.set('cw-draft:project-1:sections/a.md', 'legacy stale draft');
    assert.equal(DraftRecoveryStore.getDraft('project-1', 'sections/a.md'), null);

    DraftRecoveryStore.clearDraft('project-1', 'sections/a.md');
    assert.equal(DraftRecoveryStore.getDraft('project-1', 'sections/a.md'), null);
  } finally {
    if (previousLocalStorage === undefined) {
      delete global.localStorage;
    } else {
      global.localStorage = previousLocalStorage;
    }
  }
});
