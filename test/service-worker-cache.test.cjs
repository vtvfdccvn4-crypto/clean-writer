const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const SCOPE = 'https://clear-writer.test/app/';
const SW_URL = `${SCOPE}sw.js?v=build-1`;
const ORIGIN = new URL(SCOPE).origin;

const SERVICE_WORKER_SOURCE = fs.readFileSync(path.join(__dirname, '..', 'public', 'sw.js'), 'utf8');

function fakeResponse(body, ok = true) {
  return {
    ok,
    async text() {
      return body;
    },
    clone() {
      return fakeResponse(body, ok);
    }
  };
}

function createCache() {
  const entries = new Map();
  const resolve = request => new URL(typeof request === 'string' ? request : request.url, ORIGIN).toString();

  return {
    entries,
    seed(pathname, body = '') {
      entries.set(resolve(pathname), fakeResponse(body));
    },
    pathnames() {
      return [...entries.keys()].map(url => new URL(url).pathname).sort();
    },
    async addAll(paths) {
      for (const requestPath of paths) entries.set(resolve(requestPath), fakeResponse(''));
    },
    async match(request) {
      return entries.get(resolve(request));
    },
    async keys() {
      return [...entries.keys()].map(url => ({ url }));
    },
    async delete(request) {
      return entries.delete(resolve(request));
    },
    async put(request, response) {
      entries.set(resolve(request), response);
    }
  };
}

function createCacheStorage() {
  const store = new Map();
  return {
    store,
    async open(name) {
      if (!store.has(name)) store.set(name, createCache());
      return store.get(name);
    },
    async keys() {
      return [...store.keys()];
    },
    async delete(name) {
      return store.delete(name);
    }
  };
}

/** Evaluates public/sw.js against a fake service-worker global and returns its handlers. */
function loadServiceWorker() {
  const caches = createCacheStorage();
  const listeners = new Map();
  const warnings = [];
  const self = {
    location: { href: SW_URL, origin: ORIGIN },
    registration: { scope: SCOPE },
    clients: {
      claimed: false,
      async claim() {
        self.clients.claimed = true;
      }
    },
    skipWaitingCalled: false,
    skipWaiting() {
      self.skipWaitingCalled = true;
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    }
  };
  const console = { warn: (...args) => warnings.push(args.join(' ')) };

  new Function('self', 'caches', 'console', 'URL', SERVICE_WORKER_SOURCE)(self, caches, console, URL);

  return {
    self,
    caches,
    warnings,
    async dispatch(type) {
      const listener = listeners.get(type);
      assert.ok(listener, `no ${type} listener registered`);
      let settled = Promise.resolve();
      listener({
        waitUntil(promise) {
          settled = promise;
        }
      });
      await settled;
    }
  };
}

/** A built shell whose index.html reaches a font only through a lazily imported chunk. */
async function seedBuiltShell(caches, cacheName) {
  const cache = await caches.open(cacheName);
  cache.seed('/app/');
  cache.seed(
    '/app/index.html',
    '<link rel="stylesheet" href="./assets/style-BBB.css">' +
      '<script type="module" src="./assets/index-AAA.js"></script>'
  );
  cache.seed('/app/favicon.svg');
  cache.seed('/app/icon-192.png');
  cache.seed('/app/icon-512.png');
  cache.seed('/app/manifest.webmanifest');
  cache.seed('/app/assets/index-AAA.js', 'await import("./chunk-CCC.js");');
  cache.seed('/app/assets/chunk-CCC.js', '@font-face{src:url(./font-DDD.woff2)}');
  cache.seed('/app/assets/style-BBB.css');
  cache.seed('/app/assets/font-DDD.woff2');
  return cache;
}

test('install caches every app-shell file', async () => {
  const worker = loadServiceWorker();

  await worker.dispatch('install');

  const cache = await worker.caches.open('clear-writer-shell-build-1');
  assert.deepEqual(cache.pathnames(), [
    '/app/',
    '/app/favicon.svg',
    '/app/icon-192.png',
    '/app/icon-512.png',
    '/app/index.html',
    '/app/manifest.webmanifest'
  ]);
  assert.equal(worker.self.skipWaitingCalled, true);
});

test('activate prunes stale hashed assets and keeps everything still referenced', async () => {
  const worker = loadServiceWorker();
  const cache = await seedBuiltShell(worker.caches, 'clear-writer-shell-build-1');
  // Hashed leftovers from an earlier build, plus a cached file outside assets/.
  cache.seed('/app/assets/index-OLD.js');
  cache.seed('/app/assets/font-OLD.woff2');
  cache.seed('/app/other.json');
  await worker.caches.open('clear-writer-shell-build-0');

  await worker.dispatch('activate');

  assert.deepEqual(cache.pathnames(), [
    '/app/',
    '/app/assets/chunk-CCC.js',
    '/app/assets/font-DDD.woff2',
    '/app/assets/index-AAA.js',
    '/app/assets/style-BBB.css',
    '/app/favicon.svg',
    '/app/icon-192.png',
    '/app/icon-512.png',
    '/app/index.html',
    '/app/manifest.webmanifest',
    '/app/other.json'
  ]);
  assert.deepEqual([...worker.caches.store.keys()], ['clear-writer-shell-build-1']);
  assert.equal(worker.self.clients.claimed, true);
});

test('activate claims open pages even when pruning fails', async () => {
  const worker = loadServiceWorker();
  const cache = await seedBuiltShell(worker.caches, 'clear-writer-shell-build-1');
  cache.match = async () => {
    throw new Error('cache read failed');
  };

  await worker.dispatch('activate');

  assert.equal(worker.self.clients.claimed, true);
  assert.equal(worker.warnings.length, 1);
  assert.match(worker.warnings[0], /Pruning stale cached assets failed/);
});
