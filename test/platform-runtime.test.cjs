const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let createAppPlatform;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24688 } } });
  ({ createAppPlatform } = await server.ssrLoadModule('/src/platform/runtime.ts'));
});

after(async () => {
  await server?.close();
});

test('web runtime uses the OPFS-backed platform', async () => {
  const platform = createAppPlatform({ prompt: () => 'Runtime Test Project' });
  assert.equal(platform.workspaceRepository.constructor.name, 'CompositeWorkspaceRepository');
  assert.equal(typeof platform.workspaceRepository.pickWorkspace, 'function');
  assert.equal(typeof platform.workspaceRepository.getLastOpenedWorkspace, 'function');
  assert.strictEqual(platform.assetResolver.constructor.name, 'BlobUrlAssetResolver');
});

test('directory workspaces are rejected when local folder access is unavailable', async () => {
  const platform = createAppPlatform({});

  await assert.rejects(
    () => platform.workspaceRepository.open({
      id: 'directory-project',
      kind: 'directory',
      displayName: 'Local Project'
    }),
    /local folder access is unavailable/i
  );
});
