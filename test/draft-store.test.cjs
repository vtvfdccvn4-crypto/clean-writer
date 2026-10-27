const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let DraftStore;
let MemoryDraftBackend;
let DraftWriter;
let draftMaxWaitMs;
let FaultyBackend;
let decideDraftRestore;
let hashDraftText;
let DRAFT_MAX_AGE_MS;
let DRAFT_ORPHAN_MAX_AGE_MS;

function defineFaultyBackend() {
  /** Backend whose operations fail on demand, to exercise health transitions. */
  return class FaultyBackend extends MemoryDraftBackend {
    constructor() {
      super();
      this.failPut = null;
      this.failGet = null;
    }

    async put(record) {
      const error = this.failPut?.();
      if (error) throw error;
      return super.put(record);
    }

    async get(key) {
      const error = this.failGet?.();
      if (error) throw error;
      return super.get(key);
    }
  };
}

const target = { projectId: 'project-1', path: 'sections/a.md' };

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24691 } } });
  ({ DraftStore, MemoryDraftBackend, decideDraftRestore, hashDraftText, DRAFT_MAX_AGE_MS, DRAFT_ORPHAN_MAX_AGE_MS } =
    await server.ssrLoadModule('/src/editor/DraftStore.ts'));
  ({ DraftWriter, draftMaxWaitMs } = await server.ssrLoadModule('/src/editor/DraftWriter.ts'));
  FaultyBackend = defineFaultyBackend();
});

after(async () => server?.close());

const quotaError = () => new DOMException('quota', 'QuotaExceededError');

test('a written draft reads back intact with its hashes and byte length', async () => {
  const store = new DraftStore(new MemoryDraftBackend(), () => 1_000);
  const baseHash = await hashDraftText('file text');
  assert.equal(await store.write(target, 'draft text é', baseHash), true);

  const lookup = await store.read(target);
  assert.equal(lookup.intact, true);
  assert.equal(lookup.record.content, 'draft text é');
  assert.equal(lookup.record.baseHash, baseHash);
  assert.equal(lookup.record.contentHash, await hashDraftText('draft text é'));
  assert.equal(lookup.record.byteLength, new TextEncoder().encode('draft text é').byteLength);
  assert.equal(lookup.record.updatedAt, 1_000);
  assert.equal(store.health, 'ok');
});

test('a record whose content no longer matches its hash is reported as damaged', async () => {
  const backend = new MemoryDraftBackend();
  const store = new DraftStore(backend);
  await store.write(target, 'original', '');
  const record = await backend.get(target);
  await backend.put({ ...record, content: 'corrupted' });

  const lookup = await store.read(target);
  assert.equal(lookup.intact, false);
  assert.equal(lookup.record.content, 'corrupted');
});

test('a draft from a newer schema is left alone and not returned', async () => {
  const backend = new MemoryDraftBackend();
  const store = new DraftStore(backend);
  await store.write(target, 'future', '');
  const record = await backend.get(target);
  await backend.put({ ...record, schema: 99 });
  assert.equal(await store.read(target), null);
  assert.ok(await backend.get(target), 'the newer record must not be deleted');
});

test('discardIfSaved removes a draft only when it holds the saved text', async () => {
  const backend = new MemoryDraftBackend();
  const store = new DraftStore(backend);
  await store.write(target, 'newer edit', '');
  await store.discardIfSaved(target, 'older save');
  assert.ok(await backend.get(target), 'a draft with different text must survive');
  await store.discardIfSaved(target, 'newer edit');
  assert.equal(await backend.get(target), undefined);
});

test('restore decisions: equal content is discarded, same base is restored, anything else conflicts', () => {
  const draft = (contentHash, baseHash) => ({ contentHash, baseHash });
  assert.equal(decideDraftRestore(draft('h-file', 'h-old'), 'h-file'), 'discard');
  assert.equal(decideDraftRestore(draft('h-draft', 'h-file'), 'h-file'), 'restore');
  assert.equal(decideDraftRestore(draft('h-draft', 'h-other'), 'h-file'), 'conflict');
  // Migrated drafts have no base hash and must never be restored silently.
  assert.equal(decideDraftRestore(draft('h-file', ''), 'h-file'), 'discard');
  assert.equal(decideDraftRestore(draft('h-draft', ''), 'h-file'), 'conflict');
});

test('a quota failure prunes and retries once, then succeeds', async () => {
  const backend = new FaultyBackend();
  const store = new DraftStore(backend);
  const healthStates = [];
  store.onHealthChange(health => healthStates.push(health));
  let attempts = 0;
  backend.failPut = () => (attempts++ === 0 ? quotaError() : null);

  assert.equal(await store.write(target, 'fits after pruning', ''), true);
  assert.equal(attempts, 2);
  assert.equal(store.health, 'ok');
  assert.deepEqual(healthStates, []);
});

test('a quota failure that persists makes the store unavailable and says so', async () => {
  const backend = new FaultyBackend();
  const store = new DraftStore(backend);
  const healthStates = [];
  store.onHealthChange(health => healthStates.push(health));
  backend.failPut = quotaError;

  assert.equal(await store.write(target, 'does not fit', ''), false);
  assert.equal(store.health, 'unavailable');
  assert.deepEqual(healthStates, ['unavailable']);
});

test('other write failures degrade health and recover on the next successful write', async () => {
  const backend = new FaultyBackend();
  const store = new DraftStore(backend);
  const transitions = [];
  store.onHealthChange((health, error) => transitions.push([health, error?.message]));
  backend.failPut = () => new Error('transaction aborted');

  assert.equal(await store.write(target, 'text', ''), false);
  assert.equal(store.health, 'degraded');
  backend.failPut = null;
  assert.equal(await store.write(target, 'text', ''), true);
  assert.equal(store.health, 'ok');
  assert.deepEqual(transitions, [['degraded', 'transaction aborted'], ['ok', undefined]]);
});

test('a store without browser storage is unavailable from the start', async () => {
  const store = new DraftStore(null);
  assert.equal(store.health, 'unavailable');
  assert.equal(await store.write(target, 'text', ''), false);
  assert.equal(await store.read(target), null);
});

test('a read failure makes the store unavailable and returns no draft', async () => {
  const backend = new FaultyBackend();
  const store = new DraftStore(backend);
  backend.failGet = () => new Error('database blocked');
  assert.equal(await store.read(target), null);
  assert.equal(store.health, 'unavailable');
});

test('pruning removes orphaned, expired, and oversized drafts but keeps live recent ones', async () => {
  const backend = new MemoryDraftBackend();
  const now = 10 * DRAFT_MAX_AGE_MS;
  const store = new DraftStore(backend, () => now);
  const live = { projectId: 'p', path: 'live.md' };
  const orphan = { projectId: 'p', path: 'gone.md' };
  const closed = { projectId: 'closed', path: 'old.md' };
  const expired = { projectId: 'p', path: 'expired.md' };
  const big = { projectId: 'p', path: 'big.md' };
  await backend.put({ schema: 1, ...live, content: 'a', contentHash: 'x', baseHash: '', updatedAt: now - 1000, byteLength: 10 });
  await backend.put({ schema: 1, ...orphan, content: 'b', contentHash: 'x', baseHash: '', updatedAt: now - DRAFT_ORPHAN_MAX_AGE_MS - 1, byteLength: 10 });
  await backend.put({ schema: 1, ...closed, content: 'c', contentHash: 'x', baseHash: '', updatedAt: now - DRAFT_ORPHAN_MAX_AGE_MS + 1000, byteLength: 10 });
  await backend.put({ schema: 1, ...expired, content: 'd', contentHash: 'x', baseHash: '', updatedAt: now - DRAFT_MAX_AGE_MS - 1, byteLength: 10 });
  // The byte cap removes the oldest survivors first, so the large draft is made the oldest.
  await backend.put({ schema: 1, ...big, content: 'e', contentHash: 'x', baseHash: '', updatedAt: now - 10 * 24 * 60 * 60 * 1000, byteLength: 500 });

  const deleted = await store.prune({
    isLive: draftTarget => (draftTarget.projectId === 'closed' ? undefined : draftTarget.path === 'live.md' || draftTarget.path === 'big.md'),
    maxTotalBytes: 400
  });

  assert.equal(deleted, 3);
  assert.ok(await backend.get(live));
  assert.ok(await backend.get(closed), 'unknown projects keep drafts within the age limit');
  assert.equal(await backend.get(orphan), undefined);
  assert.equal(await backend.get(expired), undefined);
  assert.equal(await backend.get(big), undefined, 'the oldest drafts above the cap are removed first');
});

test('legacy localStorage drafts migrate into the store and their keys are removed', async () => {
  const backend = new MemoryDraftBackend();
  const store = new DraftStore(backend, () => 5_000);
  const values = new Map([
    ['cw-draft:project-1:sections/a.md', JSON.stringify({ content: 'recovered', updatedAt: 4_000 })],
    ['cw-draft:project-1:sections/saved.md', JSON.stringify({ content: 'already saved', updatedAt: 1_000 })],
    ['cw-draft-saved:project-1:sections/saved.md', '2000'],
    ['cw-draft:project-1:sections/raw.md', 'plain legacy text'],
    ['unrelated', 'keep']
  ]);
  const storage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => (values.has(key) ? values.get(key) : null),
    removeItem: key => { values.delete(key); }
  };

  assert.equal(await store.migrateLegacy(storage), 2);
  const migrated = await store.read({ projectId: 'project-1', path: 'sections/a.md' });
  assert.equal(migrated.record.content, 'recovered');
  assert.equal(migrated.record.baseHash, '');
  assert.equal(await store.read({ projectId: 'project-1', path: 'sections/saved.md' }), null);
  assert.equal((await store.read({ projectId: 'project-1', path: 'sections/raw.md' })).record.content, 'plain legacy text');
  assert.deepEqual([...values.keys()], ['unrelated']);
});

test('the writer coalesces edits into one write of the latest content', async () => {
  const backend = new MemoryDraftBackend();
  const writes = [];
  const originalPut = backend.put.bind(backend);
  backend.put = async record => { writes.push(record.content); return originalPut(record); };
  const store = new DraftStore(backend);
  const writer = new DraftWriter(store, { debounceMs: 20, maxWaitMs: 1_000 });

  writer.schedule(target, 'a', '');
  writer.schedule(target, 'ab', '');
  writer.schedule(target, 'abc', '');
  await new Promise(resolve => setTimeout(resolve, 60));

  assert.deepEqual(writes, ['abc']);
});

test('the writer writes during continuous typing once the maximum wait elapses', async () => {
  const backend = new MemoryDraftBackend();
  const writes = [];
  const originalPut = backend.put.bind(backend);
  backend.put = async record => { writes.push(record.content); return originalPut(record); };
  const writer = new DraftWriter(new DraftStore(backend), { debounceMs: 1_000, maxWaitMs: 40 });

  for (let index = 0; index < 12; index += 1) {
    writer.schedule(target, `text ${index}`, '');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.ok(writes.length >= 1, 'a draft must be written before the debounce could ever fire');
  await writer.flush();
  assert.equal(writes.at(-1), 'text 11');
});

test('flush writes pending drafts immediately and waits for them', async () => {
  const backend = new MemoryDraftBackend();
  const store = new DraftStore(backend);
  const writer = new DraftWriter(store, { debounceMs: 60_000 });
  writer.schedule(target, 'pending', '');
  await writer.flush();
  assert.equal((await store.read(target)).record.content, 'pending');
});

test('a failed write is retried while the draft is still the latest', async () => {
  const backend = new FaultyBackend();
  const store = new DraftStore(backend);
  const writer = new DraftWriter(store, { debounceMs: 1, retryMs: 5 });
  let attempts = 0;
  backend.failPut = () => (attempts++ === 0 ? new Error('transient') : null);

  writer.schedule(target, 'survives a transient failure', '');
  await new Promise(resolve => setTimeout(resolve, 80));
  assert.equal(attempts, 2);
  assert.equal((await store.read(target)).record.content, 'survives a transient failure');
});

test('discardWhenSaved keeps a draft that holds newer text than the save', async () => {
  const backend = new MemoryDraftBackend();
  const store = new DraftStore(backend);
  const writer = new DraftWriter(store, { debounceMs: 60_000 });
  writer.schedule(target, 'typed after the save started', '');
  await writer.discardWhenSaved(target, 'saved text');
  await writer.flush();
  assert.equal((await store.read(target)).record.content, 'typed after the save started');
});

test('discardWhenSaved cancels a pending draft of the saved text, so nothing is written for it', async () => {
  const backend = new MemoryDraftBackend();
  const store = new DraftStore(backend);
  const writer = new DraftWriter(store, { debounceMs: 60_000 });
  writer.schedule(target, 'saved text', '');
  await writer.discardWhenSaved(target, 'saved text');
  await writer.flush();
  assert.equal(await backend.get(target), undefined);
});

test('discardWhenSaved(latest) removes a draft written for text typed before the save', async () => {
  const backend = new MemoryDraftBackend();
  const store = new DraftStore(backend);
  const writer = new DraftWriter(store, { debounceMs: 1 });
  writer.schedule(target, 'halfway through typing', '');
  await writer.flush();
  assert.equal((await store.read(target)).record.content, 'halfway through typing');
  await writer.discardWhenSaved(target, 'the final saved text', true);
  assert.equal(await backend.get(target), undefined);
});

test('continuous typing in an ordinary document may wait one second for a draft, a very large one up to five', () => {
  assert.equal(draftMaxWaitMs(0), 1_000);
  assert.equal(draftMaxWaitMs(200_000), 1_000);
  assert.equal(draftMaxWaitMs(600_000), 3_000);
  assert.equal(draftMaxWaitMs(1_000_000), 5_000);
  assert.equal(draftMaxWaitMs(5_000_000), 5_000);
});

test('a draft is written within a second of continuous typing by default', async () => {
  const backend = new MemoryDraftBackend();
  const writer = new DraftWriter(new DraftStore(backend), { debounceMs: 60_000 });
  const target = { projectId: 'p', path: 'sections/typing.md' };
  // Keystrokes arrive faster than the quiet period, so only the maximum wait can write the draft.
  const deadline = Date.now() + 1_600;
  let version = 0;
  while (Date.now() < deadline) {
    version += 1;
    writer.schedule(target, { toString: () => `text ${version}` }, 'hash', 1_000);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  const stored = await new DraftStore(backend).read(target);
  assert.ok(stored, 'a draft must exist after 1.6 s of continuous typing');
  assert.match(stored.record.content, /^text \d+$/);
});
