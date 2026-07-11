const CLEAR_WRITER_CACHE_PREFIX = 'clear-writer-shell-';

async function unregisterDevelopmentServiceWorker(): Promise<void> {
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
        return url.origin === window.location.origin && url.pathname === '/sw.js';
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

  void navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).catch(error => {
    console.warn('[Clear Writer] Service worker registration failed:', error);
  });
}
