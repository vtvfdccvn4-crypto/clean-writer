const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let InMemoryWorkspaceSession;
let createProjectBackup;
let parseProjectBackup;
let restoreProjectBackup;
let backupFileName;
let BackupError;
let createZip;
let BACKUP_MANIFEST_PATH;
let describeBackupFailure;
let checkBackupFileSize;
let checkStorageFor;
let BACKUP_LIMITS_BYTES;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24727 } } });
  ({ InMemoryWorkspaceSession } = await server.ssrLoadModule('/src/platform/InMemoryWorkspace.ts'));
  ({ createProjectBackup, parseProjectBackup, restoreProjectBackup, backupFileName, BackupError, BACKUP_MANIFEST_PATH, describeBackupFailure, checkBackupFileSize, checkStorageFor } = await server.ssrLoadModule('/src/backup/project-backup.ts'));
  ({ createZip, BACKUP_LIMITS_BYTES } = await server.ssrLoadModule('/src/backup/zip.ts'));
});

after(async () => server?.close());

const bytes = text => new TextEncoder().encode(text);
const FIXED = new Date(2026, 9, 27, 12, 0, 0);
const PNG = new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 3, 250, 251, 252, 253])]);

async function realisticProject(name) {
  const session = new InMemoryWorkspaceSession(name, name);
  await session.initialize();
  session.seedSection('Chapter One.md', '# Chapter One\n\nIt was a quiet morning – café ✓.\n');
  session.seedSection('Part Two/Ünï.md', '# Two\n\n![pic](images/cover.png)\n');
  session.seedSection('Part Two/Empty.md', '');
  session.seedSection('日本語.md', 'こんにちは');
  session.seedImage('cover.png', PNG);
  session.seedImage('assets/logo.png', PNG);
  await session.mutateSettings({ type: 'set-order', order: ['sections/Part Two', 'sections/Part Two/Ünï.md', 'sections/Part Two/Empty.md', 'sections/Chapter One.md', 'sections/日本語.md'] });
  await session.mutateSettings({ type: 'set-path-flag', key: 'pageBreaks', path: 'sections/Chapter One.md', enabled: true });
  await session.mutateSettings({ type: 'set-path-flag', key: 'hiddenHeaders', path: 'sections/Part Two/Ünï.md', enabled: true });
  await session.mutateSettings({ type: 'set-path-flag', key: 'numberedHeadings', path: 'sections/Chapter One.md', enabled: true });
  await session.mutateSettings({ type: 'set-path-flag', key: 'tocSections', path: 'sections/日本語.md', enabled: true });
  const settings = await session.readSettings();
  const metadataKey = Object.keys(settings.projectMetadata).find(key => typeof settings.projectMetadata[key] === 'string');
  await session.mutateSettings({ type: 'patch', values: {
    pageSetup: { ...settings.pageSetup, marginLeft: 31 },
    projectMetadata: metadataKey ? { ...settings.projectMetadata, [metadataKey]: 'Backup Round Trip' } : settings.projectMetadata
  } });
  return session;
}

test('a project round-trips through a backup: every file byte for byte, and the settings exactly', async () => {
  const original = await realisticProject('round-trip');
  const backup = await createProjectBackup(original, FIXED);
  const parsed = await parseProjectBackup(backup.bytes);

  const restored = new InMemoryWorkspaceSession('restored', 'restored');
  await restored.initialize();
  await restoreProjectBackup(restored, parsed);

  const originalFiles = await original.listProjectFiles();
  assert.deepEqual(await restored.listProjectFiles(), originalFiles);
  for (const path of originalFiles) {
    assert.deepEqual(Array.from(await restored.readProjectFile(path)), Array.from(await original.readProjectFile(path)), path);
  }
  assert.deepEqual(await restored.readSettings(), await original.readSettings());

  // Order, page breaks and numbering survived, and the sections read back as text.
  const settings = await restored.readSettings();
  assert.equal(settings.order[0], 'sections/Part Two');
  assert.deepEqual(settings.pageBreaks, ['sections/Chapter One.md']);
  assert.deepEqual(settings.hiddenHeaders, ['sections/Part Two/Ünï.md']);
  assert.deepEqual(settings.numberedHeadings, ['sections/Chapter One.md']);
  assert.deepEqual(settings.tocSections, ['sections/日本語.md']);
  assert.equal(settings.pageSetup.marginLeft, 31);
  assert.equal(await restored.readSection('sections/Chapter One.md'), '# Chapter One\n\nIt was a quiet morning – café ✓.\n');
  assert.equal(await restored.readSection('sections/Part Two/Empty.md'), '');
});

test('a backup lists every project file and describes itself', async () => {
  const project = await realisticProject('manifest');
  const backup = await createProjectBackup(project, FIXED);
  assert.equal(backup.manifest.format, 'clear-writer-backup');
  assert.equal(backup.manifest.projectName, 'manifest');
  assert.equal(backup.manifest.createdAt, FIXED.toISOString());
  assert.deepEqual(backup.manifest.files.map(file => file.path), await project.listProjectFiles());
  assert.equal(backup.fileName, 'manifest-backup-2026-10-27.zip');
});

test('the trash is not part of a backup', async () => {
  const project = await realisticProject('trash-excluded');
  await project.deleteSection('sections/日本語.md');
  assert.equal((await project.listTrash()).length, 1);
  const backup = await createProjectBackup(project, FIXED);
  assert.ok(!backup.manifest.files.some(file => file.path.includes('.trash') || file.path.includes('日本語')));
});

test('backup file names are safe and readable', () => {
  assert.equal(backupFileName('My Novel', FIXED), 'My Novel-backup-2026-10-27.zip');
  assert.equal(backupFileName('a/b\\c:d*e?', FIXED), 'a-b-c-d-e-backup-2026-10-27.zip');
  assert.equal(backupFileName('   ', FIXED), 'project-backup-2026-10-27.zip');
  assert.equal(backupFileName('Roman – Café', FIXED), 'Roman - Café-backup-2026-10-27.zip');
});

const manifestFor = (files, overrides = {}) => ({ format: 'clear-writer-backup', version: 1, createdAt: FIXED.toISOString(), projectName: 'x', files: files.map(file => ({ path: file.path, size: file.data.length })), ...overrides });
const archive = (files, manifest = manifestFor(files)) => createZip([{ path: BACKUP_MANIFEST_PATH, data: bytes(JSON.stringify(manifest)) }, ...files], FIXED);
const SETTINGS = { path: 'settings.json', data: bytes('{}') };

test('files that are not valid backups are refused with a message the user can read', async () => {
  await assert.rejects(() => parseProjectBackup(bytes('plain text')), /cannot be used as a backup/);
  await assert.rejects(() => parseProjectBackup(createZip([SETTINGS], FIXED)), /no backup manifest/);
  await assert.rejects(() => parseProjectBackup(archive([SETTINGS], manifestFor([SETTINGS], { format: 'something-else' }))), /not a Clear Writer backup/);
  await assert.rejects(() => parseProjectBackup(archive([SETTINGS], manifestFor([SETTINGS], { version: 2 }))), /newer version/);
  await assert.rejects(() => parseProjectBackup(createZip([{ path: BACKUP_MANIFEST_PATH, data: bytes('{not json') }], FIXED)), /manifest cannot be read/);
});

test('an incomplete or inconsistent backup is refused', async () => {
  const section = { path: 'sections/a.md', data: bytes('hello') };
  await assert.rejects(() => parseProjectBackup(archive([SETTINGS], manifestFor([SETTINGS, section]))), /"sections\/a.md" is missing/);
  await assert.rejects(() => parseProjectBackup(archive([SETTINGS, section], manifestFor([SETTINGS, section]).files && { ...manifestFor([SETTINGS, section]), files: [{ path: 'settings.json', size: 2 }, { path: 'sections/a.md', size: 99 }] })), /not the size it should be/);
  await assert.rejects(() => parseProjectBackup(archive([section])), /no project settings/);
  await assert.rejects(() => parseProjectBackup(archive([{ path: 'settings.json', data: bytes('{broken') }])), /settings cannot be read/);
});

test('a manifest cannot name a file outside the project', async () => {
  for (const path of ['../evil.md', '.trash/x/data/a.md', 'other/a.md', '/abs.md']) {
    const hostile = createZip([{ path: BACKUP_MANIFEST_PATH, data: bytes(JSON.stringify({ ...manifestFor([SETTINGS]), files: [{ path: 'settings.json', size: 2 }, { path, size: 1 }] })) }, SETTINGS], FIXED);
    await assert.rejects(() => parseProjectBackup(hostile), /unusable file/, path);
  }
});

test('extra files in the archive that are not part of a project are left out, and reported', async () => {
  const stray = { path: '__MACOSX/._a.md', data: bytes('x') };
  const parsed = await parseProjectBackup(archive([SETTINGS, stray], manifestFor([SETTINGS])));
  assert.deepEqual(parsed.files.map(file => file.path), ['settings.json']);
  assert.deepEqual(parsed.ignored, ['__MACOSX/._a.md']);
});

test('a session refuses to write a file outside the project, and a settings file is normalised', async () => {
  const session = new InMemoryWorkspaceSession('guard', 'guard');
  await session.initialize();
  for (const path of ['.trash/x', 'other/a.md', 'sections/../x.md', 'sections//a.md', 'sections']) {
    await assert.rejects(() => session.writeProjectFile(path, bytes('x')), /Not a project file path/, path);
  }
  await session.writeProjectFile('settings.json', bytes('{"order":["sections/a.md"]}'));
  const settings = await session.readSettings();
  assert.deepEqual(settings.order, ['sections/a.md']);
  assert.ok(settings.pageSetup, 'missing settings are filled in with defaults');
});

test('an archive over the size limit is refused by its size alone, with the limit in the message', async () => {
  assert.doesNotThrow(() => checkBackupFileSize(BACKUP_LIMITS_BYTES.archive));
  assert.throws(() => checkBackupFileSize(BACKUP_LIMITS_BYTES.archive + 1), error => error instanceof BackupError && /larger than the 200 MB a backup can be/.test(error.message));
  await assert.rejects(() => parseProjectBackup({ length: BACKUP_LIMITS_BYTES.archive + 1 }), /200 MB/);
});

test('a project over the size limit is refused before the archive is built, naming the limit', async () => {
  const huge = { length: BACKUP_LIMITS_BYTES.project + 1 };
  const source = { displayName: 'big', listProjectFiles: async () => ['assets/a.bin'], readProjectFile: async () => huge };
  await assert.rejects(() => createProjectBackup(source), error => error instanceof BackupError && /larger than a backup can hold.*300 MB.*Nothing was downloaded/.test(error.message));
});

test('a ZIP64 archive is named as unsupported, not reported as damaged', async () => {
  const zip = createZip([{ path: 'a.md', data: bytes('x') }]);
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  view.setUint16(zip.length - 22 + 10, 0xffff, true);
  await assert.rejects(() => parseProjectBackup(zip), error => error instanceof BackupError && /ZIP64.*cannot read/.test(error.message));
});

test('files that are not backups give a plain message', async () => {
  await assert.rejects(() => parseProjectBackup(bytes('just some text, not a zip file at all')), /not a ZIP file/);
  await assert.rejects(() => parseProjectBackup(createZip([{ path: 'a.md', data: bytes('x') }])), /not a Clear Writer backup/);
});

test('running out of memory or storage is named, not reported as a general failure', () => {
  const memory = describeBackupFailure(new RangeError('Array buffer allocation failed'), 'read');
  assert.match(memory.message, /ran out of memory while reading/);
  assert.match(describeBackupFailure(new RangeError('Invalid array length'), 'make').message, /ran out of memory while making/);
  const quota = new Error('The quota has been exceeded.');
  quota.name = 'QuotaExceededError';
  assert.match(describeBackupFailure(quota, 'read').message, /ran out of space while importing.*no project was created/);
  assert.equal(describeBackupFailure(new TypeError('something else'), 'read'), null);
});

test('an import that cannot fit in free browser storage is refused before a project is created', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const setEstimate = estimate => Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { storage: { estimate: async () => estimate } } });
  try {
    setEstimate({ quota: 100 * 1024 * 1024, usage: 95 * 1024 * 1024 });
    await assert.rejects(() => checkStorageFor(20 * 1024 * 1024), error => error instanceof BackupError && /not enough browser storage.*Nothing was imported/.test(error.message));
    await checkStorageFor(1024);
    setEstimate({});
    await checkStorageFor(10 ** 12);
  } finally {
    if (original) Object.defineProperty(globalThis, 'navigator', original); else delete globalThis.navigator;
  }
});
