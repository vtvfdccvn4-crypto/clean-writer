import { showNotice } from './components/Notice';

const NOTICE_KEY = 'clear-writer-browser-notice-shown-v1';

/** Returns true when the browser is Chromium-based (Chrome, Edge, Brave, Arc, …). */
function isChromiumBased(): boolean {
  if (typeof navigator === 'undefined') return true;
  const ua = navigator.userAgent;
  // Chromium-based browsers all include "Chrome/" in their user-agent string.
  // Safari includes "Safari/" but not "Chrome/". Firefox includes "Firefox/".
  return ua.includes('Chrome/');
}

/**
 * Shows a one-time info notice when the user is not on a Chromium-based browser.
 * The notice is stored in localStorage so it only appears on the first visit.
 * Call once at boot, after the Notice component is ready.
 */
export function showBrowserSupportNotice(): void {
  if (isChromiumBased()) return;
  try {
    if (localStorage.getItem(NOTICE_KEY)) return;
    localStorage.setItem(NOTICE_KEY, '1');
  } catch {
    // localStorage blocked — show the notice anyway (private browsing, etc.)
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const isSafari = ua.includes('Safari/') && !ua.includes('Chrome/');
  const browserName = isSafari ? 'Safari' : 'this browser';

  showNotice(
    `Clear Writer is designed for Chromium-based browsers (Chrome, Edge, Brave). It works in ${browserName}, but some performance features and local-folder projects are not available.`,
    'info'
  );
}
