const CACHE_NAME = 'clear-writer-shell-v3';

function referencedAssetPaths(text, baseUrl) {
  const paths = new Set();
  const add = (value) => {
    try {
      const url = new URL(value, baseUrl);
      if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
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
    return url.origin === self.location.origin
      && url.pathname.startsWith('/assets/')
      && !keep.has(url.pathname)
      ? cache.delete(request)
      : Promise.resolve(false);
  }));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const scope = self.registration.scope;
    const appShell = [scope, new URL('index.html', scope).pathname, new URL('favicon.svg', scope).pathname, new URL('manifest.webmanifest', scope).pathname];
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(appShell);
  })());
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => pruneStaleAssets()).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  // Always check the network for the HTML shell so a new build is visible
  // immediately. Hashed assets remain cacheable through the fallback below.
  const scopePath = new URL(self.registration.scope).pathname;
  const indexPath = new URL('index.html', self.registration.scope).pathname;
  if (request.mode === 'navigate' || new URL(request.url).pathname === indexPath) {
    event.respondWith(
      fetch(request).then(response => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).then(() => pruneStaleAssets());
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
