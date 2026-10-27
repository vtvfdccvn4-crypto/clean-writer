const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let InMemoryWorkspaceSession;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24725 } } });
  ({ InMemoryWorkspaceSession } = await server.ssrLoadModule('/src/platform/InMemoryWorkspace.ts'));
});

after(async () => server?.close());

async function freshSession(id) {
  const session = new InMemoryWorkspaceSession(id, id);
  await session.initialize();
  session.seedSection('a.md', '# A');
  session.seedSection('b.md', '# B');
  session.seedSection('c.md', '# C');
  await session.mutateSettings({ type: 'set-order', order: ['sections/a.md', 'sections/b.md', 'sections/c.md'] });
  return session;
}

test('a deleted section is listed in the trash with where it came from', async () => {
  const session = await freshSession('trash-list');
  await session.deleteSection('sections/b.md');
  const items = await session.listTrash();
  assert.equal(items.length, 1);
  assert.equal(items[0].name, 'b.md');
  assert.equal(items[0].originalPath, 'sections/b.md');
  assert.equal(items[0].kind, 'file');
  assert.ok(items[0].deletedAt > 0);
});

test('restoring a section puts the file back with its place in the order and its page break', async () => {
  const session = await freshSession('trash-restore');
  await session.mutateSettings({ type: 'set-path-flag', key: 'pageBreaks', path: 'sections/b.md', enabled: true });
  await session.deleteSection('sections/b.md');
  let settings = await session.readSettings();
  assert.deepEqual(settings.order, ['sections/a.md', 'sections/c.md']);
  assert.deepEqual(settings.pageBreaks, []);

  const [item] = await session.listTrash();
  const result = await session.restoreFromTrash(item.id);
  assert.deepEqual({ success: result.success, restoredPath: result.restoredPath }, { success: true, restoredPath: 'sections/b.md' });
  assert.equal(await session.readSection('sections/b.md'), '# B');
  settings = await session.readSettings();
  assert.deepEqual(settings.order, ['sections/a.md', 'sections/b.md', 'sections/c.md']);
  assert.deepEqual(settings.pageBreaks, ['sections/b.md']);
  assert.deepEqual(await session.listTrash(), [], 'a restored item leaves the trash');
});

test('restoring never overwrites a section that has taken the name since', async () => {
  const session = await freshSession('trash-name-taken');
  await session.deleteSection('sections/b.md');
  await session.createSection('b.md', '# A new B');
  const [item] = await session.listTrash();
  const result = await session.restoreFromTrash(item.id);
  assert.equal(result.success, true);
  assert.equal(result.restoredPath, 'sections/b (restored).md');
  assert.equal(await session.readSection('sections/b.md'), '# A new B');
  assert.equal(await session.readSection('sections/b (restored).md'), '# B');
  assert.ok((await session.readSettings()).order.includes('sections/b (restored).md'));
});

test('a folder is restored with its sections and their order', async () => {
  const session = await freshSession('trash-folder');
  session.seedSection('part/one.md', '# One');
  session.seedSection('part/two.md', '# Two');
  await session.mutateSettings({ type: 'set-order', order: ['sections/a.md', 'sections/part', 'sections/part/one.md', 'sections/part/two.md', 'sections/c.md'] });
  await session.deleteSection('sections/part');
  assert.deepEqual((await session.readSettings()).order, ['sections/a.md', 'sections/c.md']);

  const [item] = await session.listTrash();
  assert.equal(item.kind, 'folder');
  assert.equal((await session.restoreFromTrash(item.id)).success, true);
  assert.equal(await session.readSection('sections/part/one.md'), '# One');
  assert.equal(await session.readSection('sections/part/two.md'), '# Two');
  assert.deepEqual((await session.readSettings()).order, ['sections/a.md', 'sections/part', 'sections/part/one.md', 'sections/part/two.md', 'sections/c.md']);
});

test('one item can be deleted for good, and then the rest can be emptied', async () => {
  const session = await freshSession('trash-purge');
  await session.deleteSection('sections/a.md');
  await session.deleteSection('sections/b.md');
  await session.deleteSection('sections/c.md');
  const items = await session.listTrash();
  assert.equal(items.length, 3);

  assert.equal(await session.purgeTrash(items[0].id), true);
  assert.equal((await session.listTrash()).length, 2);
  assert.equal(await session.purgeTrash(), true);
  assert.deepEqual(await session.listTrash(), []);
  await assert.rejects(() => session.readSection('sections/a.md'), /File not found/);
});

test('a trash id cannot reach outside the trash, and an unknown id changes nothing', async () => {
  const session = await freshSession('trash-ids');
  await session.deleteSection('sections/b.md');
  assert.equal(await session.purgeTrash('../sections'), false);
  assert.equal(await session.purgeTrash('..'), false);
  const result = await session.restoreFromTrash('0-deadbeef');
  assert.equal(result.success, false);
  assert.equal(await session.readSection('sections/a.md'), '# A');
  assert.equal((await session.listTrash()).length, 1);
});

test('an item trashed before the metadata existed is listed and restored into sections', async () => {
  const session = await freshSession('trash-legacy');
  const trash = await session.projectDir.getDirectoryHandle('.trash', { create: true });
  const batch = await trash.getDirectoryHandle('1700000000000-abcd1234', { create: true });
  const file = await batch.getFileHandle('old.md', { create: true });
  const writable = await file.createWritable();
  await writable.write('# Old');
  await writable.close();

  const [item] = await session.listTrash();
  assert.equal(item.name, 'old.md');
  assert.equal(item.originalPath, 'sections/old.md');
  assert.equal(item.deletedAt, 1700000000000);
  assert.equal((await session.restoreFromTrash(item.id)).success, true);
  assert.equal(await session.readSection('sections/old.md'), '# Old');
});
