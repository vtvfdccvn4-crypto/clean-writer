const CLEAR_WRITER_CACHE_PREFIX = 'clear-writer-shell-';
declare const __CLEAR_WRITER_BUILD_ID__: string;

async function unregisterDevelopmentServiceWorker(): Promise<void> {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);
  const serviceWorkerPath = new URL('sw.js', baseUrl).pathname;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => {
        const scriptUrl =
          registration.active?.scriptURL ||
          registration.waiting?.scriptURL ||
          registration.installing?.scriptURL ||
          '';
        if (!scriptUrl) return false;
        const url = new URL(scriptUrl);
        return url.origin === window.location.origin && url.pathname === serviceWorkerPath;
      })
      .map((registration) => registration.unregister())
  );

  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith(CLEAR_WRITER_CACHE_PREFIX))
        .map((key) => caches.delete(key))
    );
  }
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return;

  if (!import.meta.env.PROD) {
    void unregisterDevelopmentServiceWorker().catch(error => {
      console.warn('[Clear Writer] Development service worker cleanup failed:', error);
    });
    return;
  }

  // Vite's configured base is intentionally relative (`./`) so the app can
  // be deployed from any directory. Resolve it against the document before
  // constructing a URL; a relative string alone is not a valid URL base.
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href);
  const serviceWorkerUrl = new URL('sw.js', baseUrl);
  serviceWorkerUrl.searchParams.set('v', __CLEAR_WRITER_BUILD_ID__);
  void navigator.serviceWorker.register(serviceWorkerUrl, { updateViaCache: 'none' }).catch(error => {
    console.warn('[Clear Writer] Service worker registration failed:', error);
  });
}
