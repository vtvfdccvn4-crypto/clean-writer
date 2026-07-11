const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let sortRecentWorkspaceEntries;
let pickMostRecentWorkspace;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24690 } } });
  ({ sortRecentWorkspaceEntries, pickMostRecentWorkspace } = await server.ssrLoadModule('/src/platform/runtime.ts'));
});

after(async () => {
  await server?.close();
});

test('recent workspaces are deduped and sorted by newest timestamp', () => {
  const entries = sortRecentWorkspaceEntries([
    { ref: { id: 'dir-1', kind: 'directory', displayName: 'Folder A' }, displayName: 'Folder A', time: 100 },
    { ref: { id: 'opfs-1', kind: 'opfs', displayName: 'Browser A' }, displayName: 'Browser A', time: 300 },
    { ref: { id: 'dir-1', kind: 'directory', displayName: 'Folder A' }, displayName: 'Folder A', time: 200 },
    { ref: { id: 'opfs-2', kind: 'opfs', displayName: 'Browser B' }, displayName: 'Browser B', time: 250 }
  ]);

  assert.deepEqual(
    entries.map((entry) => `${entry.ref.kind}:${entry.ref.id}:${entry.time}`),
    [
      'opfs:opfs-1:300',
      'opfs:opfs-2:250',
      'directory:dir-1:200'
    ]
  );
});

test('pickMostRecentWorkspace returns the newest ref across workspace kinds', () => {
  const picked = pickMostRecentWorkspace([
    { ref: { id: 'dir-older', kind: 'directory', displayName: 'Folder Older' }, displayName: 'Folder Older', time: 50 },
    { ref: { id: 'opfs-newer', kind: 'opfs', displayName: 'Browser Newer' }, displayName: 'Browser Newer', time: 75 }
  ]);

  assert.deepEqual(picked, { id: 'opfs-newer', kind: 'opfs', displayName: 'Browser Newer' });
});
