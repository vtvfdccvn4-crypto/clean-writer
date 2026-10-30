/**
 * The document bundle (`.cwdoc`): one document, stored as a ZIP archive with a manifest at its root. It is the
 * single save for a document, so it travels between browsers and devices. Every listed file carries a SHA-256
 * hash, so a damaged file is caught even when its size is right.
 */

import type { WorkspaceSession } from '../platform/types';
import { createZip, readZip, safeArchivePath, ZipError, type ZipEntry } from './zip';
import { PROJECT_SETTINGS_SCHEMA_VERSION } from '../project-settings/project-settings';
import { BackupError, checkBackupFileSize, describeBackupFailure } from './document-errors';

/** What a document is read from when it is saved: the open project, through its session. */
export type BackupSource = Pick<WorkspaceSession, 'displayName' | 'listProjectFiles' | 'readProjectFile'>;
/** What an opened document is written into. */
export type BackupTarget = Pick<WorkspaceSession, 'writeProjectFile'>;

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

export interface ParsedDocumentBundle {
  readonly manifest: DocumentManifest;
  readonly files: readonly ZipEntry[];
}

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
 * Reads and checks a `.cwdoc` file before anything is created from it. Nothing is written here: the caller
 * creates a document only from a bundle that comes back without error.
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

  return { manifest, files };
}

/** A `.cwdoc` file name for a document title, with characters that are not safe in file names replaced. */
export function documentFileName(title: string): string {
  const safe = title.replace(/[^\p{L}\p{N} _.-]+/gu, '-').replace(/\s+/g, ' ').trim().replace(/^[.-]+/, '').slice(0, 80).replace(/[-.\s]+$/, '');
  return `${safe || 'Untitled'}${DOCUMENT_EXTENSION}`;
}

/** Editor preferences describe the device, not the document, so they are not saved in a `.cwdoc`. */
function settingsWithoutEditorSetup(data: Uint8Array): { readonly bytes: Uint8Array<ArrayBuffer>; readonly schemaVersion: number } {
  let settings: Record<string, unknown>;
  try {
    settings = JSON.parse(new TextDecoder().decode(data)) as Record<string, unknown>;
  } catch {
    throw new BackupError('The document cannot be saved: its project settings cannot be read.');
  }
  delete settings.editorSetup;
  const schemaVersion = typeof settings.schemaVersion === 'number' ? settings.schemaVersion : PROJECT_SETTINGS_SCHEMA_VERSION;
  return { bytes: new TextEncoder().encode(JSON.stringify(settings, null, 2)) as Uint8Array<ArrayBuffer>, schemaVersion };
}

export interface SavedDocument {
  readonly bytes: Uint8Array;
  readonly fileName: string;
}

/**
 * Reads the open project into a `.cwdoc`. Only document files are read: anything outside `settings.json`,
 * `sections/`, `images/` and `assets/` (such as the trash) stays out. Editor preferences are left out of the settings.
 */
export async function createDocumentFromSource(source: BackupSource, now: Date = new Date()): Promise<SavedDocument> {
  const paths = (await source.listProjectFiles()).filter(path => isProjectPath(path)).sort();
  const files: DocumentFileInput[] = [];
  let settingsSchemaVersion = PROJECT_SETTINGS_SCHEMA_VERSION;
  try {
    for (const path of paths) {
      const data = await source.readProjectFile(path);
      if (path === SETTINGS_PATH) {
        const settings = settingsWithoutEditorSetup(data);
        settingsSchemaVersion = settings.schemaVersion;
        files.push({ path, data: settings.bytes });
      } else {
        files.push({ path, data: data as Uint8Array<ArrayBuffer> });
      }
    }
  } catch (error) {
    throw describeBackupFailure(error, 'make') ?? error;
  }
  const bytes = await createDocumentBundle({ title: source.displayName, files, settingsSchemaVersion, now });
  return { bytes, fileName: documentFileName(source.displayName) };
}

/**
 * Writes the files of an opened document into an empty project: content first and settings last, so a restore
 * that stops part-way never leaves settings that point at files that are not there.
 */
export async function writeDocumentFiles(target: BackupTarget, files: readonly ZipEntry[]): Promise<void> {
  const ordered = [...files].sort((a, b) => Number(a.path === SETTINGS_PATH) - Number(b.path === SETTINGS_PATH) || a.path.localeCompare(b.path));
  try {
    for (const file of ordered) await target.writeProjectFile(file.path, file.data);
  } catch (error) {
    throw describeBackupFailure(error, 'read') ?? error;
  }
}
