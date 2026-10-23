const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let InMemoryWorkspaceSession;
let textReads = 0;
const originalText = File.prototype.text;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24723 } } });
  ({ InMemoryWorkspaceSession } = await server.ssrLoadModule('/src/platform/InMemoryWorkspace.ts'));
  File.prototype.text = function countedText() {
    textReads += 1;
    return originalText.call(this);
  };
});

after(async () => {
  File.prototype.text = originalText;
  await server?.close();
});

function freshSession(id) {
  const session = new InMemoryWorkspaceSession(id, id);
  session.seedSection('chapter.md', '# Chapter');
  return session;
}

test('unchanged sections are read from storage once', async () => {
  const session = freshSession('cache-hit');
  textReads = 0;

  for (let read = 0; read < 5; read += 1) {
    assert.equal(await session.readSection('sections/chapter.md'), '# Chapter');
  }
  assert.equal(textReads, 1);
});

test('a change made outside the session is picked up', async () => {
  const session = freshSession('external-change');
  await session.readSection('sections/chapter.md');

  session.seedSection('chapter.md', '# Edited elsewhere');
  assert.equal(await session.readSection('sections/chapter.md'), '# Edited elsewhere');
});

test('writes, renames and deletes through the session are never served stale', async () => {
  const session = freshSession('own-changes');
  await session.readSection('sections/chapter.md');

  assert.equal(await session.writeSection('sections/chapter.md', '# Rewritten'), true);
  assert.equal(await session.readSection('sections/chapter.md'), '# Rewritten');

  assert.equal(await session.renameSection('sections/chapter.md', 'sections/renamed.md'), true);
  assert.equal(await session.readSection('sections/renamed.md'), '# Rewritten');
  await assert.rejects(() => session.readSection('sections/chapter.md'), /File not found/);

  assert.equal(await session.deleteSection('sections/renamed.md'), true);
  await assert.rejects(() => session.readSection('sections/renamed.md'), /File not found/);
});
