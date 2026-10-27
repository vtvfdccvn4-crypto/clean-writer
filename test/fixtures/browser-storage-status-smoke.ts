import { readStorageStatus, requestPersistentStorage, storageLevel } from '../../src/platform/storage-quota';
import { checkStorageQuota, refreshStoragePanel } from '../../src/ui/storage-status';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

async function run(): Promise<void> {
  // Real StorageManager in the browser, not a stub.
  const status = await readStorageStatus(navigator.storage);
  const persisted = await requestPersistentStorage(navigator.storage);

  // The card fills from the same reads, so its text must agree with the module.
  const panel = document.getElementById('storage-panel');
  if (!panel) throw new Error('Storage panel missing.');
  panel.innerHTML = `
    <p id="storage-persistence-status"></p>
    <progress id="storage-usage-meter" max="100" value="0"></progress>
    <p id="storage-usage-summary"></p>`;
  await refreshStoragePanel();
  const meter = document.getElementById('storage-usage-meter') as HTMLProgressElement;

  // Quota warning: 90% used warns once, and a repeat check at the same level stays quiet.
  const notices = () => document.getElementById('notice-container')?.textContent ?? '';
  (navigator.storage as StorageManager & { estimate: () => Promise<StorageEstimate> }).estimate = async () => ({ usage: 900, quota: 1000 });
  const firstLevel = await checkStorageQuota();
  const shownAfterFirst = notices().includes('90% full');
  const noticeCountAfterFirst = document.querySelectorAll('#notice-container > *').length;
  const secondLevel = await checkStorageQuota();
  const noticeCountAfterSecond = document.querySelectorAll('#notice-container > *').length;

  window.__HARNESS_RESULT__ = {
    quotaWarningLevel: firstLevel,
    quotaWarningShown: shownAfterFirst,
    quotaWarningRepeatSuppressed: secondLevel === 'warning' && noticeCountAfterSecond === noticeCountAfterFirst,
    ok: status.supported === true
      && typeof status.usageBytes === 'number'
      && typeof status.quotaBytes === 'number'
      && (status.quotaBytes ?? 0) > 0
      && document.getElementById('storage-persistence-status')?.textContent?.length! > 0
      && document.getElementById('storage-usage-summary')?.textContent?.includes('used of') === true
      && firstLevel === 'warning' && shownAfterFirst && secondLevel === 'warning' && noticeCountAfterSecond === noticeCountAfterFirst,
    supported: status.supported,
    usageBytes: status.usageBytes,
    quotaBytes: status.quotaBytes,
    level: storageLevel(status),
    persistedAfterRequest: persisted,
    persistenceText: document.getElementById('storage-persistence-status')?.textContent ?? null,
    meterValue: meter.value,
    meterHidden: meter.hidden
  };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack || `${error.name}: ${error.message}`) : String(error) };
});
