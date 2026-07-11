import { showNotice } from './ui/components/Notice';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

/**
 * Exposes the browser's install prompt as an explicit app action.
 *
 * Chromium only emits beforeinstallprompt after it has accepted the manifest
 * and service worker as installable, so the control remains hidden otherwise.
 */
export function setupAppInstallPrompt(): void {
  const button = document.getElementById('btn-install-app') as HTMLButtonElement | null;
  if (!button) return;

  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  button.hidden = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    button.hidden = false;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    button.hidden = true;
    showNotice('Clear Writer was installed successfully.');
  });

  button.addEventListener('click', async () => {
    if (!deferredPrompt) return;
    button.disabled = true;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'dismissed') button.hidden = false;
    } finally {
      // Chromium permits each deferred prompt to be used only once.
      deferredPrompt = null;
      button.disabled = false;
      button.hidden = true;
    }
  });
}
