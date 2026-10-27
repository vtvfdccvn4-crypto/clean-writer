import { showConfirmDialog } from './ui/confirm-dialog';
import { showNotice } from './ui/components/Notice';

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

/**
 * Registers the worker and asks the user before activating an update. A new
 * build waits until the user accepts; accepting first saves the open document,
 * so no edit is lost on reload. A first install activates on its own, since no
 * page depends on the previous build yet.
 */
export function registerServiceWorker(flushBeforeReload: () => Promise<void>): void {
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

  const hadController = Boolean(navigator.serviceWorker.controller);
  // Activating a worker reaches every open tab. Only the tab where the user
  // accepted the update reloads, so other tabs keep their unsaved text.
  let reloadAfterActivation = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!reloadAfterActivation) return;
    reloadAfterActivation = false;
    window.location.reload();
  });

  void navigator.serviceWorker.register(serviceWorkerUrl, { updateViaCache: 'none' })
    .then(registration => {
      let offering = false;
      const offerUpdate = (worker: ServiceWorker) => {
        if (offering) return;
        offering = true;
        void acceptUpdate(worker, flushBeforeReload, () => { reloadAfterActivation = hadController; }).finally(() => {
          offering = false;
        });
      };

      if (registration.waiting && hadController) offerUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        installing?.addEventListener('statechange', () => {
          if (installing.state === 'installed' && navigator.serviceWorker.controller && registration.waiting) {
            offerUpdate(registration.waiting);
          }
        });
      });
    })
    .catch(error => {
      console.warn('[Clear Writer] Service worker registration failed:', error);
    });
}

/**
 * Activates a waiting worker after the user agrees. If the open document cannot
 * be saved, the update is postponed and the user is told why; the worker stays
 * waiting and the prompt can appear again.
 */
async function acceptUpdate(
  worker: ServiceWorker,
  flushBeforeReload: () => Promise<void>,
  beforeActivation: () => void
): Promise<void> {
  const accepted = await showConfirmDialog({
    title: 'Update Available',
    message: 'A newer version of Clear Writer is ready. Reload to use it now? Your open document is saved first.',
    confirmLabel: 'Reload now',
    cancelLabel: 'Later'
  });
  if (!accepted) return;
  try {
    await flushBeforeReload();
  } catch (error) {
    console.warn('[Clear Writer] Saving before the update failed:', error);
    showNotice('The update was postponed because your latest changes could not be saved.', 'error');
    return;
  }
  beforeActivation();
  worker.postMessage({ type: 'SKIP_WAITING' });
}
