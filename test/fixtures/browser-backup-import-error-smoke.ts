/**
 * Verifies that the document open flow produces clear user-facing error messages
 * for common failure cases, exercised in a real browser against the real
 * checkBackupFileSize / parseDocumentBundle / checkStorageFor pipeline.
 */
import { BackupError, checkBackupFileSize, describeBackupFailure } from '../../src/backup/document-errors';
import { parseDocumentBundle } from '../../src/backup/document-bundle';
import { PROJECT_SETTINGS_SCHEMA_VERSION } from '../../src/project-settings/project-settings';
import { BACKUP_LIMITS_BYTES } from '../../src/backup/zip';

declare global {
  interface Window { __HARNESS_RESULT__?: Record<string, unknown>; }
}

async function run(): Promise<void> {
  const results: Record<string, unknown> = {};

  // ── 1. Oversized archive ──────────────────────────────────────────────────
  let oversizedMessage = '';
  try {
    checkBackupFileSize(BACKUP_LIMITS_BYTES.archive + 1);
  } catch (error) {
    oversizedMessage = error instanceof BackupError ? error.message : '';
  }
  results.oversizedError = oversizedMessage.length > 0;
  results.oversizedMentionsSize = oversizedMessage.includes('MB') || oversizedMessage.includes('GB');

  // ── 2. Non-ZIP file (random bytes) ───────────────────────────────────────
  let notZipMessage = '';
  try {
    await parseDocumentBundle(new Uint8Array([0x00, 0x01, 0x02, 0x03, 0x04]), { supportedSettingsSchemaVersion: PROJECT_SETTINGS_SCHEMA_VERSION });
  } catch (error) {
    notZipMessage = error instanceof BackupError ? error.message : '';
  }
  results.notZipError = notZipMessage.length > 0;

  // ── 3. ZIP that is not a backup (missing manifest) ───────────────────────
  // Build a minimal valid ZIP with no backup manifest entry.
  const emptyZip = new Uint8Array([
    0x50, 0x4b, 0x05, 0x06, // end-of-central-directory signature
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // rest of EOCD (all zeros = empty archive)
  ]);
  let notBackupMessage = '';
  try {
    await parseDocumentBundle(emptyZip, { supportedSettingsSchemaVersion: PROJECT_SETTINGS_SCHEMA_VERSION });
  } catch (error) {
    notBackupMessage = error instanceof BackupError ? error.message : '';
  }
  results.notBackupError = notBackupMessage.length > 0;

  // ── 4. OOM / read error classification ───────────────────────────────────
  const quotaErr = Object.assign(new DOMException('QuotaExceededError', 'QuotaExceededError'), {});
  const quotaDescription = describeBackupFailure(quotaErr, 'read');
  results.quotaMessageClear = quotaDescription !== null && quotaDescription.message.length > 0;

  const oomErr = new RangeError('Out of memory');
  const oomDescription = describeBackupFailure(oomErr, 'read');
  results.oomMessageClear = oomDescription !== null && oomDescription.message.length > 0;

  // ── 5. Insufficient storage preflight ────────────────────────────────────
  // Simulate 99% full storage via navigator.storage.estimate mock.
  const realEstimate = navigator.storage.estimate.bind(navigator.storage);
  (navigator.storage as StorageManager & { estimate(): Promise<StorageEstimate> }).estimate =
    async () => ({ usage: 990, quota: 1_000 });
  const { checkStorageFor } = await import('../../src/backup/document-errors');
  let storageMessage = '';
  try {
    await checkStorageFor(100); // needs 100 bytes but only 10 available
  } catch (error) {
    storageMessage = error instanceof BackupError ? error.message : '';
  }
  (navigator.storage as StorageManager & { estimate(): Promise<StorageEstimate> }).estimate = realEstimate;
  results.storageFullError = storageMessage.length > 0;
  results.storageFullMentionsBackup = storageMessage.toLowerCase().includes('document') || storageMessage.toLowerCase().includes('space');

  const ok = (
    results.oversizedError === true &&
    results.oversizedMentionsSize === true &&
    results.notZipError === true &&
    results.notBackupError === true &&
    results.quotaMessageClear === true &&
    results.oomMessageClear === true &&
    results.storageFullError === true
  );

  window.__HARNESS_RESULT__ = { ok, ...results };
}

run().catch(error => {
  window.__HARNESS_RESULT__ = { ok: false, error: error instanceof Error ? (error.stack ?? `${error.name}: ${error.message}`) : String(error) };
});
