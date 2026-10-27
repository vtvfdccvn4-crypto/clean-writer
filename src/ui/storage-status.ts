import { state } from '../state';
import {
  formatStorageBytes,
  readStorageStatus,
  requestPersistentStorage,
  storageLevel,
  type StorageLevel,
  type StorageStatus
} from '../platform/storage-quota';
import { showNotice } from './components/Notice';

/** Fired on the document when the shell preferences drawer opens, so its storage card refreshes. */
export const STORAGE_PANEL_OPENED_EVENT = 'clear-writer-shell-preferences-opened';

const QUOTA_CHECK_INTERVAL_MS = 5 * 60_000;
const LEVEL_RANK: Record<StorageLevel, number> = { unknown: 0, ok: 0, warning: 1, critical: 2 };

let persistenceRequested = false;
let warnedRank = 0;
let quotaTimer: ReturnType<typeof setInterval> | null = null;

const storageManager = (): StorageManager | undefined => (typeof navigator === 'undefined' ? undefined : navigator.storage);

/** Connects storage checks to project opening and the preferences card. Call once at boot. */
export function initStorageStatus(): void {
  state.onProjectChanged(() => {
    if (state.current.projectRef) void onProjectOpened();
    else stopQuotaTimer();
  });
  document.addEventListener(STORAGE_PANEL_OPENED_EVENT, () => { void refreshStoragePanel(); });
}

async function onProjectOpened(): Promise<void> {
  if (!persistenceRequested) {
    persistenceRequested = true;
    const protectedStorage = await requestPersistentStorage(storageManager());
    if (!protectedStorage && (await readStorageStatus(storageManager())).supported) {
      showNotice('This browser may clear Clear Writer\'s storage when disk space is low. Export a PDF of important work to keep a copy.', 'info');
    }
  }
  await checkStorageQuota();
  if (quotaTimer === null) {
    quotaTimer = setInterval(() => { void checkStorageQuota(); }, QUOTA_CHECK_INTERVAL_MS);
  }
}

function stopQuotaTimer(): void {
  if (quotaTimer !== null) clearInterval(quotaTimer);
  quotaTimer = null;
  warnedRank = 0;
}

/**
 * Warns once per rising level. Storage that stays at 80% does not warn again,
 * and a warning at 95% is shown even after the 80% one.
 */
export async function checkStorageQuota(): Promise<StorageLevel> {
  const status = await readStorageStatus(storageManager());
  const level = storageLevel(status);
  const rank = LEVEL_RANK[level];
  if (rank > warnedRank && status.ratio !== null && status.usageBytes !== null && status.quotaBytes !== null) {
    warnedRank = rank;
    const percent = Math.round(status.ratio * 100);
    const message = `Browser storage is ${percent}% full (${formatStorageBytes(status.usageBytes)} of ${formatStorageBytes(status.quotaBytes)}). Delete unused images or sections to free space, and export a PDF of important work to keep a copy.`;
    showNotice(message, level === 'critical' ? 'error' : 'info');
  }
  return level;
}

/** Fills the storage card in the shell preferences drawer. */
export async function refreshStoragePanel(): Promise<void> {
  const persistence = document.getElementById('storage-persistence-status');
  const meter = document.getElementById('storage-usage-meter');
  const summary = document.getElementById('storage-usage-summary');
  if (!persistence || !summary) return;
  const status: StorageStatus = await readStorageStatus(storageManager());
  persistence.textContent = describePersistence(status);
  if (meter instanceof HTMLProgressElement) {
    meter.hidden = status.ratio === null;
    meter.value = status.ratio === null ? 0 : Math.min(100, Math.round(status.ratio * 100));
  }
  summary.textContent = status.usageBytes !== null && status.quotaBytes !== null
    ? `${formatStorageBytes(status.usageBytes)} used of ${formatStorageBytes(status.quotaBytes)} available to this site.`
    : status.supported
      ? 'This browser does not report how much storage is used.'
      : 'This browser does not provide storage information.';
}

function describePersistence(status: StorageStatus): string {
  if (!status.supported) return 'Storage protection cannot be checked in this browser.';
  if (status.persisted === true) return 'Protected: the browser will not clear this storage to free space.';
  if (status.persisted === false) return 'Not protected: the browser may clear this storage when disk space is low.';
  return 'The browser does not report whether this storage is protected.';
}
