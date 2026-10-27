const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let InMemoryWorkspaceSession;
let restoreTrashedEntry;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24724 } } });
  ({ InMemoryWorkspaceSession } = await server.ssrLoadModule('/src/platform/InMemoryWorkspace.ts'));
  ({ restoreTrashedEntry } = await server.ssrLoadModule('/src/platform/trash.ts'));
});

after(async () => server?.close());

function freshSession(id) {
  const session = new InMemoryWorkspaceSession(id, id);
  session.seedSection('chapter.md', '# Chapter');
  return session;
}

async function readOnDisk(session, path) {
  const file = await session.projectDir.getDirectoryHandle('sections').then(dir => dir.getFileHandle(path.split('/').pop()));
  return (await file.getFile()).text();
}

test('a section changed outside the app is not overwritten, and the conflict is reported', async () => {
  const session = freshSession('conflict');
  await session.readSection('sections/chapter.md');

  session.seedSection('chapter.md', '# Changed in another program');
  assert.equal(await session.writeSectionChecked('sections/chapter.md', '# Our edit'), 'conflict');
  assert.equal(await readOnDisk(session, 'sections/chapter.md'), '# Changed in another program');
});

test('the session saves its own writes, including several in a row', async () => {
  const session = freshSession('own-writes');
  await session.readSection('sections/chapter.md');

  assert.equal(await session.writeSectionChecked('sections/chapter.md', '# First'), 'saved');
  assert.equal(await session.writeSectionChecked('sections/chapter.md', '# Second'), 'saved');
  assert.equal(await readOnDisk(session, 'sections/chapter.md'), '# Second');
});

test('a section created by the session is protected from later outside changes', async () => {
  const session = freshSession('created');
  assert.equal((await session.createSection('sections/notes.md', '# Notes')).success, true);

  session.seedSection('notes.md', '# Edited elsewhere');
  assert.equal(await session.writeSectionChecked('sections/notes.md', '# Ours'), 'conflict');
});

test('a boolean write reports a conflict as not saved', async () => {
  const session = freshSession('boolean');
  await session.readSection('sections/chapter.md');
  session.seedSection('chapter.md', '# Elsewhere');
  assert.equal(await session.writeSection('sections/chapter.md', '# Ours'), false);
});

test('a deleted section is moved to the trash and can be restored', async () => {
  const session = freshSession('trash');
  assert.equal(await session.deleteSection('sections/chapter.md'), true);
  await assert.rejects(() => session.readSection('sections/chapter.md'), /File not found/);

  const trash = await session.projectDir.getDirectoryHandle('.trash');
  const batches = [];
  for await (const [name] of trash) batches.push(name);
  assert.equal(batches.length, 1);

  const trashPath = `.trash/${batches[0]}/data/chapter.md`;
  assert.equal(await restoreTrashedEntry(session.projectDir, trashPath, 'sections/chapter.md'), true);
  assert.equal(await session.readSection('sections/chapter.md'), '# Chapter');
});

test('the trash is not listed among the project sections', async () => {
  const session = freshSession('trash-listing');
  await session.deleteSection('sections/chapter.md');
  const sections = await session.listSections();
  assert.equal(sections.some(node => node.path.includes('.trash')), false);
});
