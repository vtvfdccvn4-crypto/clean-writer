const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let errors;
let zip;

before(async () => {
  server = await createTestServer();
  errors = await server.ssrLoadModule('/src/backup/document-errors.ts');
  zip = await server.ssrLoadModule('/src/backup/zip.ts');
});

after(async () => {
  await server?.close();
});

test('an archive over the size limit is refused by its size alone, with the limit in the message', () => {
  assert.throws(() => errors.checkBackupFileSize(zip.BACKUP_LIMITS_BYTES.archive + 1), error => error instanceof errors.BackupError && /larger than/.test(error.message));
  assert.doesNotThrow(() => errors.checkBackupFileSize(zip.BACKUP_LIMITS_BYTES.archive));
});

test('running out of memory or storage is named, not reported as a general failure', () => {
  assert.match(errors.describeBackupFailure(new RangeError('Out of memory'), 'read').message, /ran out of memory/);
  assert.match(errors.describeBackupFailure(Object.assign(new Error('full'), { name: 'QuotaExceededError' }), 'make').message, /ran out of space/);
  assert.equal(errors.describeBackupFailure(new Error('something else'), 'read'), null);
});

test('an import that cannot fit in free browser storage is refused before a document is created', async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'storage');
  Object.defineProperty(globalThis.navigator, 'storage', { configurable: true, value: { estimate: async () => ({ usage: 990, quota: 1000 }) } });
  try {
    await assert.rejects(() => errors.checkStorageFor(100), error => error instanceof errors.BackupError && /Nothing was imported/.test(error.message));
  } finally {
    if (original) Object.defineProperty(globalThis.navigator, 'storage', original);
    else delete globalThis.navigator.storage;
  }
});
