import type { WorkspaceSession } from '../platform/types';
import { describeBytes } from './format';
import { BACKUP_LIMITS_BYTES, createZip, readZip, safeArchivePath, ZipError, type ZipEntry } from './zip';

/**
 * Project backup and restore. A backup is a ZIP archive of the project's files as stored: `settings.json`
 * (order, page breaks, numbering, page setup, styles, metadata), every file under `sections`, `images` and
 * `assets`, and a manifest. The trash is not included. It works in every browser and needs no local-folder access.
 */

export const BACKUP_FORMAT = 'clear-writer-backup';
export const BACKUP_VERSION = 1;
export const BACKUP_MANIFEST_PATH = 'clear-writer-backup.json';

const SETTINGS_PATH = 'settings.json';
const FILE_ROOTS = ['sections', 'images', 'assets'];

export interface BackupManifest {
  readonly format: typeof BACKUP_FORMAT;
  readonly version: number;
  readonly createdAt: string;
  readonly projectName: string;
  readonly files: ReadonlyArray<{ readonly path: string; readonly size: number }>;
}

/** An error whose message can be shown to the user as it is. */
export class BackupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BackupError';
  }
}

const OUT_OF_MEMORY = /allocation|out of memory|invalid array length|array buffer|buffer size|memory/i;

/**
 * Turns a failure while making or reading a backup into a message a person can act on. A backup is built in
 * memory, so running out of it is named as that, not reported as a general failure.
 */
export function describeBackupFailure(error: unknown, doing: 'make' | 'read'): BackupError | null {
  if (error instanceof BackupError) return error;
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (name === 'QuotaExceededError' || /quota|no space|disk full/i.test(message)) {
    return new BackupError('Browser storage ran out of space while importing the backup, so no project was created. Free space in this browser (delete projects you no longer need, or clear other site data) and try again.');
  }
  if ((error instanceof RangeError && OUT_OF_MEMORY.test(message)) || OUT_OF_MEMORY.test(message) || name === 'NotReadableError') {
    return new BackupError(doing === 'make'
      ? `This browser ran out of memory while making the backup (a backup is built in memory, up to ${describeBytes(BACKUP_LIMITS_BYTES.project)} of project files). Close other tabs and try again, or delete large images you no longer need.`
      : `This browser ran out of memory while reading the backup, or could not read the file. Close other tabs and try again. A backup can hold up to ${describeBytes(BACKUP_LIMITS_BYTES.project)} of project files.`);
  }
  return null;
}

/** Refuses a file that is too large to read in memory, before any of it is read. */
export function checkBackupFileSize(bytes: number): void {
  if (bytes > BACKUP_LIMITS_BYTES.archive) {
    throw new BackupError(`This file is ${describeBytes(bytes)}, larger than the ${describeBytes(BACKUP_LIMITS_BYTES.archive)} a backup can be. It cannot be imported here. If it is a Clear Writer backup, the project is too large for a browser-based restore.`);
  }
}

/** Refuses an import that would not fit in the free browser storage, before a project is created. Skipped when the browser cannot say. */
export async function checkStorageFor(projectBytes: number): Promise<void> {
  const estimate = typeof navigator !== 'undefined' ? await navigator.storage?.estimate?.().catch(() => undefined) : undefined;
  if (!estimate || typeof estimate.quota !== 'number' || typeof estimate.usage !== 'number') return;
  const free = estimate.quota - estimate.usage;
  const needed = Math.ceil(projectBytes * 1.1) + 1024 * 1024;
  if (free < needed) {
    throw new BackupError(`There is not enough browser storage to import this backup: it needs about ${describeBytes(needed)} and this browser has about ${describeBytes(Math.max(0, free))} free. Free space (delete projects you no longer need) and try again. Nothing was imported.`);
  }
}

export type BackupSource = Pick<WorkspaceSession, 'displayName' | 'listProjectFiles' | 'readProjectFile'>;
export type BackupTarget = Pick<WorkspaceSession, 'writeProjectFile'>;

export interface CreatedBackup {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly manifest: BackupManifest;
}

/** `Project Name-backup-2026-10-27.zip`, with characters that are not safe in file names replaced. */
export function backupFileName(projectName: string, now: Date): string {
  const safe = projectName.replace(/[^\p{L}\p{N} _.-]+/gu, '-').replace(/\s+/g, ' ').trim().replace(/^[.-]+/, '').slice(0, 80).replace(/[-.\s]+$/, '');
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${safe || 'project'}-backup-${day}.zip`;
}

export async function createProjectBackup(source: BackupSource, now: Date = new Date()): Promise<CreatedBackup> {
  const paths = (await source.listProjectFiles()).sort();
  const files: ZipEntry[] = [];
  let total = 0;
  try {
    for (const path of paths) {
      const data = await source.readProjectFile(path);
      total += data.length;
      if (total > BACKUP_LIMITS_BYTES.project) {
        throw new BackupError(`This project is larger than a backup can hold: its files add up to more than ${describeBytes(BACKUP_LIMITS_BYTES.project)}, and a backup is built in memory. Nothing was downloaded. Delete large images or assets you no longer need, then try again.`);
      }
      files.push({ path, data, modified: now });
    }
  } catch (error) {
    throw describeBackupFailure(error, 'make') ?? error;
  }
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: now.toISOString(),
    projectName: source.displayName,
    files: files.map(file => ({ path: file.path, size: file.data.length }))
  };
  const manifestEntry: ZipEntry = { path: BACKUP_MANIFEST_PATH, data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)), modified: now };
  try {
    return { bytes: createZip([manifestEntry, ...files], now), fileName: backupFileName(source.displayName, now), manifest };
  } catch (error) {
    if (error instanceof ZipError) throw new BackupError(`The backup could not be made: ${error.message}`);
    throw describeBackupFailure(error, 'make') ?? error;
  }
}

export interface ParsedBackup {
  readonly manifest: BackupManifest;
  readonly files: readonly ZipEntry[];
  /** Entries in the archive that are not part of a project, and were left out. */
  readonly ignored: readonly string[];
}

const isProjectPath = (path: string): boolean => path === SETTINGS_PATH || FILE_ROOTS.some(root => path.startsWith(`${root}/`));

/**
 * Reads and checks a backup before anything is created from it: it must be a ZIP, carry a manifest this version
 * understands, and hold every file the manifest lists at its listed size, including `settings.json`.
 */
export async function parseProjectBackup(bytes: Uint8Array): Promise<ParsedBackup> {
  checkBackupFileSize(bytes.length);
  let entries: ZipEntry[];
  try {
    entries = await readZip(bytes);
  } catch (error) {
    if (error instanceof ZipError) throw new BackupError(`This file cannot be used as a backup: ${error.message}`);
    throw describeBackupFailure(error, 'read') ?? error;
  }
  const byPath = new Map(entries.map(entry => [entry.path, entry]));
  const manifestEntry = byPath.get(BACKUP_MANIFEST_PATH);
  if (!manifestEntry) throw new BackupError('This ZIP file is not a Clear Writer backup: it has no backup manifest.');

  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data)) as BackupManifest;
  } catch {
    throw new BackupError('This backup is damaged: its manifest cannot be read.');
  }
  if (manifest?.format !== BACKUP_FORMAT || typeof manifest.version !== 'number' || !Array.isArray(manifest.files)) {
    throw new BackupError('This ZIP file is not a Clear Writer backup.');
  }
  if (manifest.version > BACKUP_VERSION) {
    throw new BackupError('This backup was made by a newer version of Clear Writer. Update the app, then try again.');
  }

  const files: ZipEntry[] = [];
  for (const listed of manifest.files) {
    const path = typeof listed?.path === 'string' ? safeArchivePath(listed.path) : null;
    if (!path || !isProjectPath(path)) throw new BackupError(`This backup is damaged: it lists an unusable file "${String(listed?.path)}".`);
    const entry = byPath.get(path);
    if (!entry) throw new BackupError(`This backup is incomplete: "${path}" is missing.`);
    if (entry.data.length !== listed.size) throw new BackupError(`This backup is damaged: "${path}" is not the size it should be.`);
    files.push(entry);
  }
  const settings = files.find(file => file.path === SETTINGS_PATH);
  if (!settings) throw new BackupError('This backup is incomplete: it has no project settings.');
  try {
    JSON.parse(new TextDecoder().decode(settings.data));
  } catch {
    throw new BackupError('This backup is damaged: its project settings cannot be read.');
  }

  const listedPaths = new Set(files.map(file => file.path));
  const ignored = entries.map(entry => entry.path).filter(path => path !== BACKUP_MANIFEST_PATH && !listedPaths.has(path));
  return { manifest, files, ignored };
}

/**
 * Writes a checked backup into an empty project: the content first and the settings last, so a restore that
 * stops part-way never leaves settings that point at files that are not there.
 */
export async function restoreProjectBackup(target: BackupTarget, backup: ParsedBackup): Promise<void> {
  const ordered = [...backup.files].sort((a, b) => Number(a.path === SETTINGS_PATH) - Number(b.path === SETTINGS_PATH) || a.path.localeCompare(b.path));
  try {
    for (const file of ordered) await target.writeProjectFile(file.path, file.data);
  } catch (error) {
    throw describeBackupFailure(error, 'read') ?? error;
  }
}

export const backupProjectBytes = (backup: ParsedBackup): number => backup.files.reduce((sum, file) => sum + file.data.length, 0);
