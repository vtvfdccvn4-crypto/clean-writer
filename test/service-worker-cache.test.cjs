const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const SCOPE = 'https://clear-writer.test/app/';
const ORIGIN = new URL(SCOPE).origin;
const WORKER_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');
const ASSET_MARKER = '/*__CLEAR_WRITER_BUILD_ASSETS__*/ []';

class FakeResponse {
  constructor(body = '', { ok = true } = {}) {
    this.body = body;
    this.ok = ok;
  }
  async text() {
    return this.body;
  }
  clone() {
    return new FakeResponse(this.body, { ok: this.ok });
  }
}

/** Relative paths resolve against the app's scope, as they do for the worker. */
function absolute(request) {
  return new URL(typeof request === 'string' ? request : request.url, SCOPE).toString();
}

function createCache(storage) {
  return {
    seed(pathname, body = '') {
      storage.set(absolute(pathname), new FakeResponse(body));
    },
    async addAll(requests) {
      for (const request of requests) storage.set(absolute(request), new FakeResponse(`precached ${absolute(request)}`));
    },
    async match(request) {
      return storage.get(absolute(request));
    },
    async put(request, response) {
      storage.set(absolute(request), response);
    }
  };
}

/** Caches shared across worker versions, the way one origin's caches are shared. */
function createCacheStorage() {
  const store = new Map();
  return {
    store,
    async open(name) {
      if (!store.has(name)) store.set(name, { entries: new Map(), api: null });
      const record = store.get(name);
      record.api ??= createCache(record.entries);
      return record.api;
    },
    async keys() {
      return [...store.keys()];
    },
    async delete(name) {
      return store.delete(name);
    },
    async match(request) {
      for (const record of store.values()) {
        const response = record.entries.get(absolute(request));
        if (response) return response;
      }
      return undefined;
    },
    seed(name, pathname, body) {
      if (!store.has(name)) store.set(name, { entries: new Map(), api: null });
      store.get(name).entries.set(absolute(pathname), new FakeResponse(body));
    }
  };
}

/**
 * Evaluates public/sw.js as a worker for one build. Passing the same `caches`
 * object to several loads simulates successive builds on one origin.
 */
function loadWorker({ version, caches = createCacheStorage(), buildAssets = [], network = {}, builtAs = null } = {}) {
  let source = WORKER_SOURCE.replace(ASSET_MARKER, JSON.stringify(buildAssets));
  // builtAs simulates the build step writing its id into the worker file.
  if (builtAs) source = source.replace("'__CLEAR_WRITER_SW_BUILD_ID__'", `'${builtAs}'`);
  const listeners = new Map();
  const fetches = [];
  const worker = {
    caches,
    fetches,
    self: null,
    skipWaitingCalled: false,
    clientsClaimed: false
  };
  const self = {
    location: { href: `${SCOPE}sw.js?v=${version}`, origin: ORIGIN },
    registration: { scope: SCOPE },
    clients: {
      claim: async () => {
        worker.clientsClaimed = true;
      }
    },
    skipWaiting: () => {
      worker.skipWaitingCalled = true;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    }
  };
  worker.self = self;
  const fetchStub = async request => {
    const url = absolute(request);
    fetches.push(url);
    const response = network[url];
    if (response === 'offline') throw new TypeError('network offline');
    return response ?? new FakeResponse(`network ${url}`, { ok: true });
  };
  new Function('self', 'caches', 'fetch', 'Response', 'URL', 'console', source)(
    self, caches, fetchStub, FakeResponse, URL, console
  );
  worker.dispatch = async (type, event = {}) => {
    const listener = listeners.get(type);
    assert.ok(listener, `no ${type} listener registered`);
    let settled = Promise.resolve();
    listener({
      ...event,
      waitUntil(promise) {
        settled = promise;
      }
    });
    await settled;
  };
  worker.fetch = async (url, { method = 'GET', mode = 'cors', origin = ORIGIN } = {}) => {
    const listener = listeners.get('fetch');
    assert.ok(listener, 'no fetch listener registered');
    let response;
    let handled = false;
    const request = { url: origin === ORIGIN ? absolute(url) : new URL(url, origin).toString(), method, mode };
    listener({
      request,
      respondWith(promise) {
        handled = true;
        response = promise;
      }
    });
    return { handled, response: handled ? await response : undefined };
  };
  return worker;
}

const BUILD_ASSETS = ['assets/index-AAA.js', 'assets/style-BBB.css'];
const INDEX_URL = `${SCOPE}index.html`;

test('install precaches the shell and every build file, and never forces activation', async () => {
  const worker = loadWorker({ version: 'build-1', buildAssets: BUILD_ASSETS });

  await worker.dispatch('install');

  const cache = await worker.caches.open('clear-writer-shell-build-1');
  for (const pathname of ['index.html', 'favicon.svg', 'assets/index-AAA.js', 'assets/style-BBB.css']) {
    assert.ok(await cache.match(`${SCOPE}${pathname}`), `${pathname} must be precached`);
  }
  assert.equal(worker.skipWaitingCalled, false, 'install must not activate a new build by itself');
});

test('a failed precache rejects install, so the previous worker keeps running', async () => {
  const worker = loadWorker({ version: 'build-2', buildAssets: BUILD_ASSETS });
  const caches = worker.caches;
  const cache = await caches.open('clear-writer-shell-build-2');
  cache.addAll = async () => {
    throw new TypeError('asset missing');
  };

  await assert.rejects(worker.dispatch('install'), /asset missing/);
});

test('a SKIP_WAITING message from the page activates a waiting build', async () => {
  const worker = loadWorker({ version: 'build-1' });

  await worker.dispatch('message', { data: { type: 'SKIP_WAITING' } });

  assert.equal(worker.skipWaitingCalled, true);
});

test('activation keeps the active build and the one it replaced, and deletes older builds', async () => {
  // Each build is installed before it activates, as the browser does.
  const caches = createCacheStorage();
  for (const version of ['build-1', 'build-2']) {
    const worker = loadWorker({ version, caches });
    await worker.dispatch('install');
    await worker.dispatch('activate');
  }
  assert.deepEqual([...caches.store.keys()].sort(), [
    'clear-writer-retention',
    'clear-writer-shell-build-1',
    'clear-writer-shell-build-2'
  ]);

  const third = loadWorker({ version: 'build-3', caches });
  await third.dispatch('install');
  await third.dispatch('activate');
  assert.deepEqual([...caches.store.keys()].sort(), [
    'clear-writer-retention',
    'clear-writer-shell-build-2',
    'clear-writer-shell-build-3'
  ]);
});

test('activation claims open pages', async () => {
  const worker = loadWorker({ version: 'build-1' });

  await worker.dispatch('activate');

  assert.equal(worker.clientsClaimed, true);
});

test('navigation is network-first and a network response is not written into the cache', async () => {
  const worker = loadWorker({ version: 'build-1', buildAssets: BUILD_ASSETS });
  await worker.dispatch('install');

  const result = await worker.fetch(INDEX_URL, { mode: 'navigate' });

  assert.equal(result.handled, true);
  assert.equal(await result.response.text(), `network ${INDEX_URL}`);
  const cache = await worker.caches.open('clear-writer-shell-build-1');
  assert.equal(await (await cache.match(INDEX_URL)).text(), `precached ${INDEX_URL}`);
});

test('offline navigation fails rather than serve an older build\'s index when this build\'s index is evicted', async () => {
  const caches = createCacheStorage();
  caches.seed('clear-writer-shell-build-1', 'index.html', 'OLD INDEX');
  // Install never ran for this build's cache: browsers can evict caches under
  // storage pressure, which leaves exactly this state.
  const worker = loadWorker({ version: 'build-2', caches, network: { [INDEX_URL]: 'offline' } });

  await assert.rejects(worker.fetch(INDEX_URL, { mode: 'navigate' }), /network offline/);
});

test('offline navigation serves this build\'s own index', async () => {
  const caches = createCacheStorage();
  caches.seed('clear-writer-shell-build-1', 'index.html', 'OLD INDEX');
  const worker = loadWorker({
    version: 'build-2',
    caches,
    network: { [INDEX_URL]: 'offline' }
  });
  await worker.dispatch('install');

  const result = await worker.fetch(INDEX_URL, { mode: 'navigate' });

  assert.equal(await result.response.text(), `precached ${INDEX_URL}`);
});

test('build assets come from a retained older build when the current build lacks them', async () => {
  const caches = createCacheStorage();
  caches.seed('clear-writer-shell-build-1', 'assets/old-chunk.js', 'OLD CHUNK');
  await loadWorker({ version: 'build-1', caches, buildAssets: ['assets/old-chunk.js'] }).dispatch('activate');
  const worker = loadWorker({ version: 'build-2', caches, buildAssets: BUILD_ASSETS });
  await worker.dispatch('activate');

  const result = await worker.fetch(`${SCOPE}assets/old-chunk.js`);

  assert.equal(await result.response.text(), 'OLD CHUNK', 'a tab still running build 1 must load its chunk');
  assert.deepEqual(worker.fetches, [], 'a retained build must answer without the network');
});

test('a build asset missing from every cache is fetched and stored in the current build', async () => {
  const worker = loadWorker({ version: 'build-1', buildAssets: BUILD_ASSETS });

  const result = await worker.fetch(`${SCOPE}assets/index-AAA.js`);

  assert.equal(await result.response.text(), `network ${SCOPE}assets/index-AAA.js`);
  const cache = await worker.caches.open('clear-writer-shell-build-1');
  assert.ok(await cache.match(`${SCOPE}assets/index-AAA.js`));
});

test('a same-origin file outside the build is fetched but never stored', async () => {
  const worker = loadWorker({ version: 'build-1', buildAssets: BUILD_ASSETS });

  await worker.fetch(`${SCOPE}notes/unlisted.json`);

  const cache = await worker.caches.open('clear-writer-shell-build-1');
  assert.equal(await cache.match(`${SCOPE}notes/unlisted.json`), undefined);
});

test('cross-origin and non-GET requests are left to the browser', async () => {
  const worker = loadWorker({ version: 'build-1', buildAssets: BUILD_ASSETS });

  const crossOrigin = await worker.fetch('https://fonts.example.test/font.woff2', { origin: 'https://fonts.example.test' });
  const post = await worker.fetch(`${SCOPE}assets/index-AAA.js`, { method: 'POST' });

  assert.equal(crossOrigin.handled, false);
  assert.equal(post.handled, false);
});

test('the worker source keeps its build-list marker for the build to replace', () => {
  assert.ok(WORKER_SOURCE.includes(ASSET_MARKER));
  assert.ok(WORKER_SOURCE.includes("'__CLEAR_WRITER_SW_BUILD_ID__'"));
});

test('a worker built as build two uses build two\'s cache even when an update check requests it with build one\'s URL', async () => {
  // The update check fetches the URL the page registered with, so the URL still
  // names build one. The worker must name its cache from its own build instead.
  const worker = loadWorker({ version: 'build-1', builtAs: 'build-2', buildAssets: BUILD_ASSETS });

  await worker.dispatch('install');

  assert.ok(await worker.caches.open('clear-writer-shell-build-2').then(cache => cache.match(INDEX_URL)));
  assert.equal(worker.caches.store.has('clear-writer-shell-build-1'), false, 'the old build\'s cache must not be written');
});
