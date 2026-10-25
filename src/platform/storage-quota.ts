/**
 * Browser storage capacity and persistence, read through the StorageManager
 * API. Every function here tolerates a missing or failing API: a browser without
 * it reports "unsupported", and a failed call reports unknown rather than throwing.
 */

export const STORAGE_WARNING_RATIO = 0.8;
export const STORAGE_CRITICAL_RATIO = 0.95;

/** The subset of StorageManager this module uses. */
export interface StorageManagerLike {
  persisted?(): Promise<boolean>;
  persist?(): Promise<boolean>;
  estimate?(): Promise<{ usage?: number; quota?: number }>;
}

export interface StorageStatus {
  readonly supported: boolean;
  /** null when the browser cannot say whether storage is protected from eviction. */
  readonly persisted: boolean | null;
  readonly usageBytes: number | null;
  readonly quotaBytes: number | null;
  /** usage / quota, or null when either is unknown. */
  readonly ratio: number | null;
}

export type StorageLevel = 'unknown' | 'ok' | 'warning' | 'critical';

const UNSUPPORTED: StorageStatus = {
  supported: false,
  persisted: null,
  usageBytes: null,
  quotaBytes: null,
  ratio: null
};

async function settle<T>(read: () => Promise<T> | undefined): Promise<T | null> {
  try {
    const value = await read();
    return value === undefined ? null : value;
  } catch {
    return null;
  }
}

export async function readStorageStatus(manager: StorageManagerLike | undefined): Promise<StorageStatus> {
  if (!manager) return UNSUPPORTED;
  const persisted = await settle(() => manager.persisted?.());
  const estimate = await settle(() => manager.estimate?.());
  const usageBytes = typeof estimate?.usage === 'number' && Number.isFinite(estimate.usage) ? estimate.usage : null;
  const quotaBytes = typeof estimate?.quota === 'number' && Number.isFinite(estimate.quota) && estimate.quota > 0
    ? estimate.quota
    : null;
  return {
    supported: true,
    persisted: typeof persisted === 'boolean' ? persisted : null,
    usageBytes,
    quotaBytes,
    ratio: usageBytes !== null && quotaBytes !== null ? usageBytes / quotaBytes : null
  };
}

export function storageLevel(status: StorageStatus): StorageLevel {
  if (status.ratio === null) return 'unknown';
  if (status.ratio >= STORAGE_CRITICAL_RATIO) return 'critical';
  if (status.ratio >= STORAGE_WARNING_RATIO) return 'warning';
  return 'ok';
}

/**
 * Asks the browser to keep this origin's storage. Returns whether storage is
 * protected afterwards. Chromium decides on engagement; Firefox may prompt.
 */
export async function requestPersistentStorage(manager: StorageManagerLike | undefined): Promise<boolean> {
  if (!manager?.persist) return false;
  if ((await settle(() => manager.persisted?.())) === true) return true;
  return (await settle(() => manager.persist?.())) === true;
}

export function formatStorageBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.max(0, Math.round(bytes / 1024))} KB`;
}
