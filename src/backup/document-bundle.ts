/**
 * The document bundle (`.cwdoc`): one document, stored as a ZIP archive with a manifest at its root. It is the
 * single save for a document, so it travels between browsers and devices. Every listed file carries a SHA-256
 * hash, so a damaged file is caught even when its size is right. Archives written by the ZIP backup
 * (`clear-writer-backup` version 1) are still read, through the same parser, and are never written again.
 */

import { createZip, readZip, safeArchivePath, ZipError, type ZipEntry } from './zip';
import {
  BACKUP_MANIFEST_PATH,
  BackupError,
  checkBackupFileSize,
  describeBackupFailure,
  parseProjectBackup,
  type BackupManifest
} from './project-backup';

export const DOCUMENT_EXTENSION = '.cwdoc';
export const DOCUMENT_MIME_TYPE = 'application/vnd.clearwriter.document+zip';
export const DOCUMENT_BUNDLE_FORMAT = 'clear-writer-document';
/** The container version. Bumped only when a reader would misread the file. */
export const DOCUMENT_BUNDLE_VERSION = 1;
export const DOCUMENT_MANIFEST_PATH = 'document.json';

const SETTINGS_PATH = 'settings.json';
const FILE_ROOTS = ['sections', 'images', 'assets'];

export interface DocumentManifestFile {
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
}

export interface DocumentManifest {
  readonly format: typeof DOCUMENT_BUNDLE_FORMAT;
  readonly bundleVersion: number;
  readonly minReaderVersion: number;
  readonly createdAt: string;
  readonly appVersion?: string;
  readonly settingsSchemaVersion: number;
  readonly title: string;
  readonly files: readonly DocumentManifestFile[];
}

export interface DocumentFileInput {
  readonly path: string;
  readonly data: Uint8Array<ArrayBuffer>;
}

export type ParsedDocumentBundle =
  | { readonly kind: 'document'; readonly manifest: DocumentManifest; readonly files: readonly ZipEntry[] }
  | { readonly kind: 'legacy-backup'; readonly manifest: BackupManifest; readonly files: readonly ZipEntry[] };

const isProjectPath = (path: string): boolean => path === SETTINGS_PATH || FILE_ROOTS.some(root => path.startsWith(`${root}/`));

export async function sha256Hex(data: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export interface CreateDocumentBundleOptions {
  readonly title: string;
  readonly files: readonly DocumentFileInput[];
  readonly settingsSchemaVersion: number;
  readonly appVersion?: string;
  readonly now?: Date;
}

/** Builds the `.cwdoc` bytes for a document. The settings file must be among `files`. */
export async function createDocumentBundle(options: CreateDocumentBundleOptions): Promise<Uint8Array> {
  const now = options.now ?? new Date();
  const files = [...options.files].sort((a, b) => a.path.localeCompare(b.path));
  if (!files.some(file => file.path === SETTINGS_PATH)) {
    throw new BackupError('The document cannot be saved: it has no settings.');
  }
  const hashed: DocumentManifestFile[] = [];
  for (const file of files) {
    if (!isProjectPath(file.path) || safeArchivePath(file.path) !== file.path) {
      throw new BackupError(`The document cannot be saved: "${file.path}" is not a document file.`);
    }
    hashed.push({ path: file.path, size: file.data.length, sha256: await sha256Hex(file.data) });
  }
  const manifest: DocumentManifest = {
    format: DOCUMENT_BUNDLE_FORMAT,
    bundleVersion: DOCUMENT_BUNDLE_VERSION,
    minReaderVersion: DOCUMENT_BUNDLE_VERSION,
    createdAt: now.toISOString(),
    ...(options.appVersion ? { appVersion: options.appVersion } : {}),
    settingsSchemaVersion: options.settingsSchemaVersion,
    title: options.title,
    files: hashed
  };
  const manifestEntry: ZipEntry = {
    path: DOCUMENT_MANIFEST_PATH,
    data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    modified: now
  };
  try {
    return createZip([manifestEntry, ...files.map(file => ({ path: file.path, data: file.data, modified: now }))], now);
  } catch (error) {
    if (error instanceof ZipError) throw new BackupError(`The document could not be saved: ${error.message}`);
    throw describeBackupFailure(error, 'make') ?? error;
  }
}

export interface ParseDocumentBundleOptions {
  /** The newest settings schema this app understands. A newer one is refused rather than normalised down. */
  readonly supportedSettingsSchemaVersion: number;
}

/**
 * Reads and checks a `.cwdoc` file, or a legacy ZIP backup, before anything is created from it. Nothing is
 * written here: the caller creates a document only from a bundle that comes back without error.
 */
export async function parseDocumentBundle(bytes: Uint8Array, options: ParseDocumentBundleOptions): Promise<ParsedDocumentBundle> {
  checkBackupFileSize(bytes.length);
  let entries: ZipEntry[];
  try {
    entries = await readZip(bytes);
  } catch (error) {
    if (error instanceof ZipError) throw new BackupError(`This file cannot be used as a document: ${error.message}`);
    throw describeBackupFailure(error, 'read') ?? error;
  }
  const byPath = new Map(entries.map(entry => [entry.path, entry]));

  const manifestEntry = byPath.get(DOCUMENT_MANIFEST_PATH);
  if (!manifestEntry && byPath.has(BACKUP_MANIFEST_PATH)) {
    const legacy = await parseProjectBackup(bytes);
    return { kind: 'legacy-backup', manifest: legacy.manifest, files: legacy.files };
  }
  if (!manifestEntry) throw new BackupError('This ZIP file is not a Clear Writer document: it has no document manifest.');

  let manifest: DocumentManifest;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data)) as DocumentManifest;
  } catch {
    throw new BackupError('This document is damaged: its manifest cannot be read.');
  }
  if (manifest?.format !== DOCUMENT_BUNDLE_FORMAT || typeof manifest.bundleVersion !== 'number' || !Array.isArray(manifest.files)) {
    throw new BackupError('This ZIP file is not a Clear Writer document.');
  }
  if (manifest.minReaderVersion > DOCUMENT_BUNDLE_VERSION || manifest.bundleVersion > DOCUMENT_BUNDLE_VERSION) {
    throw new BackupError('This document was made by a newer version of Clear Writer. Update the app, then try again.');
  }
  if (typeof manifest.settingsSchemaVersion !== 'number' || manifest.settingsSchemaVersion > options.supportedSettingsSchemaVersion) {
    throw new BackupError('This document uses project settings from a newer version of Clear Writer. Update the app, then try again. Nothing was opened.');
  }

  const files: ZipEntry[] = [];
  for (const listed of manifest.files) {
    const path = typeof listed?.path === 'string' ? safeArchivePath(listed.path) : null;
    if (!path || !isProjectPath(path)) throw new BackupError(`This document is damaged: it lists an unusable file "${String(listed?.path)}".`);
    const entry = byPath.get(path);
    if (!entry) throw new BackupError(`This document is incomplete: "${path}" is missing.`);
    if (entry.data.length !== listed.size) throw new BackupError(`This document is damaged: "${path}" is not the size it should be.`);
    if ((await sha256Hex(entry.data as Uint8Array<ArrayBuffer>)) !== listed.sha256) {
      throw new BackupError(`This document is damaged: "${path}" does not match its checksum, so it was not opened.`);
    }
    files.push(entry);
  }
  if (!files.some(file => file.path === SETTINGS_PATH)) throw new BackupError('This document is incomplete: it has no project settings.');
  try {
    JSON.parse(new TextDecoder().decode(files.find(file => file.path === SETTINGS_PATH)!.data));
  } catch {
    throw new BackupError('This document is damaged: its settings cannot be read.');
  }

  return { kind: 'document', manifest, files };
}
