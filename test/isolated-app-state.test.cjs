const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let AppState;
let globalState;
let ProjectSessionStore;
let InMemoryWorkspaceSession;
let projectServiceFor;
let ProjectService;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24722 } } });
  ({ AppState, state: globalState } = await server.ssrLoadModule('/src/state.ts'));
  ({ ProjectSessionStore } = await server.ssrLoadModule('/src/services/ProjectSessionStore.ts'));
  ({ InMemoryWorkspaceSession } = await server.ssrLoadModule('/src/platform/InMemoryWorkspace.ts'));
  ({ projectServiceFor, ProjectService } = await server.ssrLoadModule('/src/services/ProjectService.ts'));
});

after(async () => server?.close());

test('a session store given its own app state never touches the global one', async () => {
  const isolated = new AppState();
  const store = new ProjectSessionStore(isolated);
  const session = new InMemoryWorkspaceSession('isolated-project', 'Isolated');
  session.seedSection('chapter.md', '# Chapter');
  const globalBefore = globalState.current;

  await store.activate({ id: session.id, kind: 'memory', displayName: session.displayName }, session);
  await store.createSection('second', '# Second');

  assert.equal(isolated.current.projectRef.id, 'isolated-project');
  assert.deepEqual(isolated.current.sections.map(section => section.path).sort(), ['sections/chapter.md', 'sections/second.md']);
  assert.equal(globalState.current, globalBefore);

  store.close();
  assert.equal(isolated.current.projectRef, null);
  assert.equal(globalState.current, globalBefore);
});

test('each app state gets one shared project service', () => {
  const isolated = new AppState();

  assert.equal(projectServiceFor(isolated), projectServiceFor(isolated));
  assert.notEqual(projectServiceFor(isolated), ProjectService);
  assert.equal(projectServiceFor(globalState), ProjectService);
});
