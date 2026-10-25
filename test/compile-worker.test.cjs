const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let compilePreviewDocument;
let documentCompileSettings;
let DEFAULT_APP_STATE;
let compileJob;
let CompileResultCache;
let compileCacheKey;
let createSnapshotAssetResolver;
let CompileClient;
let isAbortError;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24698 } } });
  ({ compilePreviewDocument, documentCompileSettings } = await server.ssrLoadModule('/src/compiler/index.ts'));
  ({ DEFAULT_APP_STATE } = await server.ssrLoadModule('/src/config/defaults.ts'));
  ({ compileJob, CompileResultCache, compileCacheKey, createSnapshotAssetResolver } = await server.ssrLoadModule('/src/workers/compile-core.ts'));
  ({ CompileClient, isAbortError } = await server.ssrLoadModule('/src/workers/CompileClient.ts'));
});

after(async () => server?.close());

const settings = () => documentCompileSettings({ ...DEFAULT_APP_STATE, customStyles: [{ id: 's', name: 'Red', openingPair: '{{', closingPair: '}}', color: '#ff0000', isBold: true, isItalic: false, fontFamily: '', fontSize: 0 }] });
const DOC = '# Title\n\nA {{styled}} paragraph with a [ref][r] and a note[^n].\n\n![pic](images/a.png)\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n[r]: https://example.com\n\n[^n]: Footnote text.\n';

function job(markdown = DOC, overrides = {}) {
  return { jobId: `job-${Math.random()}`, markdown, settings: settings(), assets: { 'images/a.png': 'blob:resolved/a' }, sourceLineOffset: 0, ...overrides };
}

/**
 * A worker stand-in that runs the real worker core in this process. Messages are
 * cloned, as the browser does, so anything that is not structured-cloneable fails here too.
 */
function createFakeWorker(options = {}) {
  const cache = new CompileResultCache();
  const received = [];
  const worker = {
    received,
    terminated: false,
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(message) {
      if (options.failPost) throw new DOMException('object could not be cloned', 'DataCloneError');
      const copy = structuredClone(message);
      received.push(copy);
      if (copy.type === 'cancel' || options.silent) return;
      setTimeout(async () => {
        if (options.crashOnCompile) return worker.onerror?.({ message: 'crash' });
        const reply = await runCore(copy, cache);
        worker.onmessage?.({ data: structuredClone(reply) });
      }, 0);
    },
    terminate() {
      worker.terminated = true;
    }
  };
  setTimeout(() => {
    if (options.protocol !== undefined) worker.onmessage?.({ data: { type: 'ready', protocol: options.protocol } });
    else worker.onmessage?.({ data: { type: 'ready', protocol: 1 } });
  }, 0);
  return worker;
}

/** The same message handling as src/workers/compile.worker.ts, without the global scope. */
async function runCore(request, cache) {
  if (request.type !== 'compile') return { type: 'error', jobId: '', message: 'unsupported' };
  try {
    const outcome = await compileJob(request.job, cache);
    return { type: 'result', jobId: request.job.jobId, ...outcome };
  } catch (error) {
    return { type: 'error', jobId: request.job.jobId, message: error.message };
  }
}

function request(markdown = DOC, lane = 'full') {
  return { lane, markdown, settings: settings(), assets: { 'images/a.png': 'blob:resolved/a' }, sourceLineOffset: 0 };
}

test('the worker core produces the same HTML and manifest as the page compiler', async () => {
  const resolver = createSnapshotAssetResolver({ 'images/a.png': 'blob:resolved/a' });
  const onPage = await compilePreviewDocument(DOC, resolver, settings(), {});
  const outcome = await compileJob(job(), new CompileResultCache());
  assert.equal(outcome.compiled.html, onPage.html);
  assert.deepEqual(outcome.compiled.manifest, onPage.manifest);
  assert.equal(outcome.cacheHit, false);
});

test('the worker core reports the phases it measured and serves a repeat from its cache', async () => {
  const cache = new CompileResultCache();
  const first = await compileJob(job(), cache);
  assert.ok(Object.keys(first.phases).includes('compile-parse-markdown'));
  const second = await compileJob(job(), cache);
  assert.equal(second.cacheHit, true);
  assert.equal(second.compiled.html, first.compiled.html);
});

test('a non-text job is an explicit error, not a silent empty document', async () => {
  await assert.rejects(compileJob(job(42), new CompileResultCache()), /must carry Markdown text/);
});

test('the cache key changes with the text, the settings, the assets, and the line offsets', async () => {
  const base = job();
  const key = await compileCacheKey(base);
  assert.notEqual(key, await compileCacheKey({ ...base, markdown: base.markdown + ' ' }));
  assert.notEqual(key, await compileCacheKey({ ...base, settings: { ...base.settings, customStyles: [] } }));
  assert.notEqual(key, await compileCacheKey({ ...base, assets: {} }));
  assert.notEqual(key, await compileCacheKey({ ...base, sourceLineOffset: 2 }));
});

test('the cache evicts the least recently used entry past its entry limit', () => {
  const cache = new CompileResultCache();
  const value = html => ({ html, manifest: [] });
  for (let index = 0; index < 60; index += 1) cache.set(`k${index}`, value('x'));
  assert.ok(cache.size <= 48);
  assert.equal(cache.get('k0'), undefined);
  assert.ok(cache.get('k59'));
});

test('a snapshot resolver maps known sources and passes unknown ones through', () => {
  const resolver = createSnapshotAssetResolver({ 'images/a.png': 'blob:a' });
  assert.equal(resolver.resolveSync('images/a.png'), 'blob:a');
  assert.equal(resolver.resolveSync('images/missing.png'), 'images/missing.png');
  assert.equal(resolver.resolveSync('constructor'), 'constructor', 'prototype names are not assets');
});

test('the client resolves a result from the worker', async () => {
  const client = new CompileClient({ createWorker: () => createFakeWorker(), compileLocal: async () => assert.fail('no local run') });
  const outcome = await client.compile(request());
  assert.match(outcome.compiled.html, /Title/);
  client.dispose();
});

test('a newer job on the same lane supersedes the older one, which rejects as aborted', async () => {
  const client = new CompileClient({ createWorker: () => createFakeWorker(), compileLocal: async () => assert.fail('no local run') });
  const older = client.compile(request('# Older'));
  const newer = client.compile(request('# Newer'));
  await assert.rejects(older, error => isAbortError(error));
  assert.match((await newer).compiled.html, /Newer/);
  client.dispose();
});

test('jobs on different lanes do not supersede each other', async () => {
  const client = new CompileClient({ createWorker: () => createFakeWorker(), compileLocal: async () => assert.fail('no local run') });
  const [single, full] = await Promise.all([client.compile(request('# Single', 'single')), client.compile(request('# Full', 'full'))]);
  assert.match(single.compiled.html, /Single/);
  assert.match(full.compiled.html, /Full/);
  client.dispose();
});

test('superseding a job sends a cancel for it, so the worker does not finish it for nobody', async () => {
  const worker = createFakeWorker({ silent: true });
  const client = new CompileClient({ createWorker: () => worker, compileLocal: async () => assert.fail('no local run') });
  const older = client.compile(request('# A'));
  client.compile(request('# B')).catch(() => undefined);
  await assert.rejects(older, error => isAbortError(error));
  assert.ok(worker.received.some(message => message.type === 'cancel'));
  client.dispose();
});

test('a long superseded job is abandoned by replacing the worker', async () => {
  const workers = [];
  const client = new CompileClient({
    createWorker: () => { const worker = createFakeWorker({ silent: true }); workers.push(worker); return worker; },
    compileLocal: async () => assert.fail('no local run'),
    recycleAfterMs: 0
  });
  const older = client.compile(request('# Slow'));
  client.compile(request('# Fast')).catch(() => undefined);
  await assert.rejects(older, error => isAbortError(error));
  assert.equal(workers[0].terminated, true, 'the slow worker must be terminated');
  client.dispose();
});

test('a crashed worker re-runs its pending job on the page', async () => {
  let localRuns = 0;
  const client = new CompileClient({
    createWorker: () => createFakeWorker({ crashOnCompile: true }),
    compileLocal: async jobData => {
      localRuns += 1;
      return { compiled: { html: `<p>local ${jobData.markdown.length}</p>`, manifest: [] }, cacheHit: false, phases: {} };
    }
  });
  const outcome = await client.compile(request('# Crash'));
  assert.equal(localRuns, 1);
  assert.match(outcome.compiled.html, /local/);
  client.dispose();
});

test('repeated crashes switch the client to the page for the rest of the session', async () => {
  let workersCreated = 0;
  const client = new CompileClient({
    createWorker: () => { workersCreated += 1; return createFakeWorker({ crashOnCompile: true }); },
    compileLocal: async () => ({ compiled: { html: '<p>page</p>', manifest: [] }, cacheHit: false, phases: {} }),
    maxCrashes: 1
  });
  await client.compile(request('# one'));
  await client.compile(request('# two'));
  assert.equal(client.usesFallback, true);
  const created = workersCreated;
  const outcome = await client.compile(request('# three'));
  assert.equal(outcome.compiled.html, '<p>page</p>');
  assert.equal(workersCreated, created, 'no new worker once the client has fallen back');
  client.dispose();
});

test('a worker speaking another protocol version is not used, and its job runs on the page', async () => {
  // The worker is created on the first compile, and its handshake arrives after that job is posted.
  const client = new CompileClient({
    createWorker: () => createFakeWorker({ protocol: 99 }),
    compileLocal: async () => ({ compiled: { html: '<p>page</p>', manifest: [] }, cacheHit: false, phases: {} })
  });
  const outcome = await client.compile(request('# mismatch'));
  assert.equal(outcome.compiled.html, '<p>page</p>');
  assert.equal(client.usesFallback, true);
  client.dispose();
});

test('a request that cannot be cloned fails that job only, with a clear message', async () => {
  const client = new CompileClient({ createWorker: () => createFakeWorker({ failPost: true }), compileLocal: async () => assert.fail('no local run') });
  const unclonable = { ...request('# Unclonable'), settings: { ...settings(), onChange() {} } };
  await assert.rejects(client.compile(unclonable), /could not be sent to the compile worker/);
  client.dispose();
});

test('a compile error inside the worker reaches the caller with its message', async () => {
  const client = new CompileClient({ createWorker: () => createFakeWorker(), compileLocal: async () => assert.fail('no local run') });
  await assert.rejects(client.compile({ ...request(), markdown: 7 }), /must carry Markdown text/);
  client.dispose();
});

test('disposing the client resolves its waiting jobs as aborted', async () => {
  const client = new CompileClient({ createWorker: () => createFakeWorker({ silent: true }), compileLocal: async () => assert.fail('no local run') });
  const waiting = client.compile(request('# waiting'));
  client.dispose();
  await assert.rejects(waiting, error => isAbortError(error));
});
