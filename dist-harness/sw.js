// The build writes its own id into this file. The URL's ?v= parameter is not
// trusted for it: an update check re-requests the URL the page registered with,
// which still carries the older build's id.
const BUILD_ID = '1792917136089';
const CACHE_BUSTER = BUILD_ID.startsWith('__CLEAR_WRITER_SW') ? new URL(self.location.href).searchParams.get('v') || 'dev' : BUILD_ID;
const SHELL_CACHE_PREFIX = 'clear-writer-shell-';
const CACHE_NAME = `${SHELL_CACHE_PREFIX}${CACHE_BUSTER}`;
// Records which builds are retained: the active one and the one it replaced.
const RETENTION_CACHE_NAME = 'clear-writer-retention';
const RETENTION_RECORD = 'retention.json';
const INDEX_PATH = new URL('index.html', self.registration.scope).pathname;

// Every file in the build, as scope-relative paths. vite.web.config.ts replaces the
// empty array below when it builds, so the list cannot drift from the output.
const BUILD_ASSETS = ["assets/compile.worker-HKPtoWq3.js","assets/harness-CTIrz3l_.js","favicon.svg","icon-192.png","icon-512.png","icons.svg","manifest.webmanifest","test/fixtures/compile-worker-harness.html"];

// Files the shell needs even before the build list is known.
const APP_SHELL = [
  './',
  'index.html',
  'favicon.svg',
  'icon-192.png',
  'icon-512.png',
  'manifest.webmanifest'
];

const scopedPath = relative => new URL(relative, self.registration.scope).pathname;
const BUILD_ASSET_PATHS = new Set(BUILD_ASSETS.map(scopedPath));
const PRECACHE = [...new Set([...APP_SHELL, ...BUILD_ASSETS])].map(relative => new URL(relative, self.registration.scope).href);

function isShellCacheName(name) {
  return name.startsWith(SHELL_CACHE_PREFIX);
}

/**
 * Looks up a request in the caches of retained builds, newest first. A build
 * that was replaced stays available to tabs that still run it.
 */
async function matchRetained(request) {
  const names = (await caches.keys()).filter(isShellCacheName);
  const newestFirst = [CACHE_NAME, ...names.filter(name => name !== CACHE_NAME)].filter(name => names.includes(name));
  for (const name of newestFirst) {
    const response = await (await caches.open(name)).match(request);
    if (response) return response;
  }
  return undefined;
}

async function readRetention(cache) {
  const response = await cache.match(RETENTION_RECORD);
  if (!response) return { current: null, previous: null };
  try {
    return JSON.parse(await response.text());
  } catch {
    return { current: null, previous: null };
  }
}

/**
 * Keeps the active build and the build it replaced. Hashed assets are not
 * read or parsed, so pruning cannot depend on what a cached file contains.
 */
async function retainBuilds() {
  const retention = await caches.open(RETENTION_CACHE_NAME);
  const record = await readRetention(retention);
  const previous = record.current && record.current !== CACHE_BUSTER ? record.current : record.previous;
  const keep = new Set([CACHE_BUSTER, previous].filter(Boolean).map(build => `${SHELL_CACHE_PREFIX}${build}`));

  await Promise.all((await caches.keys())
    .filter(name => isShellCacheName(name) && !keep.has(name))
    .map(name => caches.delete(name)));

  await retention.put(RETENTION_RECORD, new Response(JSON.stringify({ current: CACHE_BUSTER, previous })));
}

// Install never forces activation. A new build waits until the open page asks
// for it (see SKIP_WAITING), so an open tab cannot lose its chunks mid-session.
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // addAll is all-or-nothing: a partial precache leaves the previous worker in place.
    await cache.addAll(PRECACHE);
  })());
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await retainBuilds();
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  if (request.mode === 'navigate' || url.pathname === INDEX_PATH) {
    event.respondWith(networkFirstShell(request));
    return;
  }

  event.respondWith(cacheFirstAsset(request, url));
});

/**
 * Always asks the network first, so a deployed build is seen immediately. The
 * offline fallback is this build's own index, never an index from another build.
 * Network responses are not written into the cache: a response served while a
 * newer worker is waiting belongs to that newer build.
 */
async function networkFirstShell(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cached = (await cache.match(request)) ?? (await cache.match(INDEX_PATH));
    if (cached) return cached;
    throw error;
  }
}

/** Build assets are served from any retained build. Only this build's assets are stored. */
async function cacheFirstAsset(request, url) {
  const cached = await matchRetained(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && BUILD_ASSET_PATHS.has(url.pathname)) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}
