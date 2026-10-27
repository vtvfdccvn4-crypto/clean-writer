const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let readStorageStatus;
let storageLevel;
let requestPersistentStorage;
let formatStorageBytes;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24695 } } });
  ({ readStorageStatus, storageLevel, requestPersistentStorage, formatStorageBytes } =
    await server.ssrLoadModule('/src/platform/storage-quota.ts'));
});

after(async () => server?.close());

const manager = ({ persisted = false, persist = true, estimate = { usage: 0, quota: 1000 } } = {}) => ({
  persisted: async () => persisted,
  persist: async () => persist,
  estimate: async () => estimate
});

test('a missing storage manager reports unsupported, not zero usage', async () => {
  const status = await readStorageStatus(undefined);
  assert.equal(status.supported, false);
  assert.equal(status.ratio, null);
  assert.equal(storageLevel(status), 'unknown');
});

test('usage and quota give a ratio and a level', async () => {
  const status = await readStorageStatus(manager({ estimate: { usage: 500, quota: 1000 } }));
  assert.equal(status.supported, true);
  assert.equal(status.ratio, 0.5);
  assert.equal(storageLevel(status), 'ok');
});

test('the warning level starts at exactly 80% and critical at exactly 95%', async () => {
  const at = async usage => storageLevel(await readStorageStatus(manager({ estimate: { usage, quota: 1000 } })));
  assert.equal(await at(799), 'ok');
  assert.equal(await at(800), 'warning');
  assert.equal(await at(949), 'warning');
  assert.equal(await at(950), 'critical');
});

test('an estimate that fails or has no quota reports unknown, not a level', async () => {
  const failing = await readStorageStatus({ estimate: async () => { throw new Error('denied'); } });
  assert.equal(failing.supported, true);
  assert.equal(failing.usageBytes, null);
  assert.equal(storageLevel(failing), 'unknown');

  const noQuota = await readStorageStatus(manager({ estimate: { usage: 10, quota: 0 } }));
  assert.equal(noQuota.quotaBytes, null);
  assert.equal(storageLevel(noQuota), 'unknown');
});

test('a browser that cannot report persistence leaves it unknown', async () => {
  const status = await readStorageStatus({ estimate: async () => ({ usage: 1, quota: 2 }) });
  assert.equal(status.persisted, null);
});

test('persistence is requested only when not already granted, and reports the outcome', async () => {
  let requests = 0;
  const granted = manager({ persisted: false, persist: true });
  granted.persist = async () => { requests += 1; return true; };
  assert.equal(await requestPersistentStorage(granted), true);
  assert.equal(requests, 1);

  let asked = false;
  const alreadyGranted = manager({ persisted: true });
  alreadyGranted.persist = async () => { asked = true; return true; };
  assert.equal(await requestPersistentStorage(alreadyGranted), true);
  assert.equal(asked, false, 'an already protected origin must not ask again');
});

test('a refused or failing persistence request reports not protected instead of throwing', async () => {
  assert.equal(await requestPersistentStorage(manager({ persist: false })), false);
  assert.equal(await requestPersistentStorage(undefined), false);
  const throwing = manager();
  throwing.persist = async () => { throw new Error('blocked'); };
  assert.equal(await requestPersistentStorage(throwing), false);
});

test('byte counts are formatted in KB, MB and GB', () => {
  assert.equal(formatStorageBytes(512 * 1024), '512 KB');
  assert.equal(formatStorageBytes(1.5 * 1024 * 1024), '1.5 MB');
  assert.equal(formatStorageBytes(2 * 1024 ** 3), '2.0 GB');
});

test('the shell preferences drawer contains the storage card the refresh fills', async () => {
  const { shellPreferencesDrawerTemplate } = await server.ssrLoadModule('/src/ui/components/ShellPreferencesDrawer.ts');
  const html = shellPreferencesDrawerTemplate();
  for (const id of ['storage-persistence-status', 'storage-usage-meter', 'storage-usage-summary']) {
    assert.ok(html.includes(`id="${id}"`), `${id} is missing from the storage card`);
  }
});
