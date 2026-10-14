const CACHE_BUSTER = new URL(self.location.href).searchParams.get('v') || 'v3';
const CACHE_NAME = `clear-writer-shell-${CACHE_BUSTER}`;
const ASSET_ROOT_PATH = new URL('assets/', self.registration.scope).pathname;

// The shell files that must survive offline, as scope-relative paths.
// `install` caches exactly this list and `pruneStaleAssets` walks it to find the
// hashed assets still in use, so the two must never drift apart.
const APP_SHELL = [
  new URL('./', self.registration.scope).pathname,
  new URL('index.html', self.registration.scope).pathname,
  new URL('favicon.svg', self.registration.scope).pathname,
  new URL('icon-192.png', self.registration.scope).pathname,
  new URL('icon-512.png', self.registration.scope).pathname,
  new URL('manifest.webmanifest', self.registration.scope).pathname
];

function isScopedAsset(url) {
  return url.origin === self.location.origin && url.pathname.startsWith(ASSET_ROOT_PATH);
}

function referencedAssetPaths(text, baseUrl) {
  const paths = new Set();
  const add = (value) => {
    try {
      const url = new URL(value, baseUrl);
      if (isScopedAsset(url)) {
        paths.add(url.pathname);
      }
    } catch {
      // Ignore malformed asset references in cached source files.
    }
  };

  for (const match of text.matchAll(/(?:src|href)=["']([^"']+)["']/g)) add(match[1]);
  for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) add(match[1]);
  for (const match of text.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g)) add(match[1]);
  return paths;
}

async function pruneStaleAssets() {
  const cache = await caches.open(CACHE_NAME);
  const keep = new Set(APP_SHELL);
  const pending = [...APP_SHELL];
  const inspected = new Set();

  // Follow the shell's CSS and JS references so current fonts and lazy chunks
  // remain available offline while old hashed assets can be removed.
  while (pending.length) {
    const path = pending.pop();
    if (inspected.has(path)) continue;
    inspected.add(path);
    const response = await cache.match(path);
    if (!response) continue;

    const references = referencedAssetPaths(await response.text(), new URL(path, self.location.origin));
    for (const reference of references) {
      if (keep.has(reference)) continue;
      keep.add(reference);
      pending.push(reference);
    }
  }

  const requests = await cache.keys();
  await Promise.all(requests.map(request => {
    const url = new URL(request.url);
    return isScopedAsset(url)
      && !keep.has(url.pathname)
      ? cache.delete(request)
      : Promise.resolve(false);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)));
    // Pruning is an optimisation. It must never stop the new worker from taking
    // control of open pages, so a failure here is reported and then ignored.
    await pruneStaleAssets().catch(error => {
      console.warn('[Clear Writer] Pruning stale cached assets failed:', error);
    });
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Always check the network for the HTML shell so a new build is visible
  // immediately. Hashed assets remain cacheable through the fallback below.
  const indexPath = new URL('index.html', self.registration.scope).pathname;
  if (request.mode === 'navigate' || new URL(request.url).pathname === indexPath) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME)
            .then(cache => cache.put(request, copy))
            .then(() => pruneStaleAssets())
            .catch(error => console.warn('[Clear Writer] Refreshing the cached shell failed:', error));
        }
        return response;
      }).catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(response => {
      if (response.ok) {
        const copy = response.clone();
        void caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
      }
      return response;
    }))
  );
});
