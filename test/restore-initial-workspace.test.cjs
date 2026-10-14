const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let state;
let restoreInitialWorkspace;

before(async () => {
  global.window = { location: { search: '?restoreLastWorkspace=true' } };
  server = await createTestServer({ server: { hmr: { port: 24696 } } });
  ({ state } = await server.ssrLoadModule('/src/state.ts'));
  ({ restoreInitialWorkspace } = await server.ssrLoadModule('/src/boot/restoreInitialWorkspace.ts'));
});

after(async () => {
  state.closeProject();
  await server?.close();
  delete global.window;
});

test('stale startup restoration cannot cover a project opened while storage is pending', async () => {
  state.closeProject();
  let finishLookup;
  const lookup = new Promise(resolve => { finishLookup = resolve; });
  let emptyRenders = 0;
  const platform = {
    workspaceRepository: {
      getLastOpenedWorkspace: () => lookup
    }
  };
  const editorManager = {
    renderEmptyWorkspace: () => { emptyRenders += 1; }
  };

  const restoration = restoreInitialWorkspace(platform, editorManager);
  await Promise.resolve();
  state.setProjectRef({ id: 'manually-opened', kind: 'memory', displayName: 'Manually opened' });
  finishLookup(null);
  await restoration;

  assert.equal(state.current.projectRef.id, 'manually-opened');
  assert.equal(emptyRenders, 0);
  state.closeProject();
});

test('startup still renders Welcome when no project is restored or opened', async () => {
  state.closeProject();
  let emptyRenders = 0;

  await restoreInitialWorkspace({
    workspaceRepository: {
      getLastOpenedWorkspace: async () => null
    }
  }, {
    renderEmptyWorkspace: () => { emptyRenders += 1; }
  });

  assert.equal(emptyRenders, 1);
});
