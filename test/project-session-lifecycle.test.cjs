const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let state;
let projectSession;
let InMemoryWorkspaceSession;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24697 } } });
  ({ state } = await server.ssrLoadModule('/src/state.ts'));
  ({ projectSession } = await server.ssrLoadModule('/src/services/ProjectSessionStore.ts'));
  ({ InMemoryWorkspaceSession } = await server.ssrLoadModule('/src/platform/InMemoryWorkspace.ts'));
});

after(async () => {
  projectSession.close();
  await server?.close();
});

function createSession(id) {
  const session = new InMemoryWorkspaceSession(id, id);
  session.sectionsMap.set('chapter.md', '# chapter.md');
  return session;
}

/** Holds the snapshot read open so the activating window can be observed. */
function withHeldRead(session) {
  let release;
  const held = new Promise(resolve => { release = resolve; });
  const listSections = session.listSections.bind(session);
  session.listSections = async () => {
    await held;
    return listSections();
  };
  return { session, release };
}

test('a project counts as present while its snapshot is still loading', async () => {
  projectSession.close();
  assert.equal(projectSession.getStatus(), 'closed');
  assert.equal(projectSession.isProjectPresent(), false);

  const { session, release } = withHeldRead(createSession('Pending'));
  const ref = { id: 'Pending', kind: 'memory', displayName: 'Pending' };
  const activation = projectSession.activate(ref, session);

  // The snapshot has not been published yet, so project state is still empty.
  assert.equal(state.current.projectRef, null);
  // The lifecycle nevertheless reports the project as present, which is what
  // keeps asynchronous startup and activation work from rendering Welcome over
  // a project that is on its way in.
  assert.equal(projectSession.getStatus(), 'activating');
  assert.equal(projectSession.isProjectPresent(), true);

  release();
  await activation;

  assert.equal(projectSession.getStatus(), 'open');
  assert.equal(state.current.projectRef.id, 'Pending');

  projectSession.close();
  assert.equal(projectSession.getStatus(), 'closed');
  assert.equal(projectSession.isProjectPresent(), false);
});

test('a failed activation returns the lifecycle to closed', async () => {
  projectSession.close();
  const session = createSession('Broken');
  session.listSections = async () => { throw new Error('storage unavailable'); };

  await assert.rejects(
    projectSession.activate({ id: 'Broken', kind: 'memory', displayName: 'Broken' }, session),
    /storage unavailable/
  );

  assert.equal(projectSession.getStatus(), 'closed');
  assert.equal(projectSession.isProjectPresent(), false);
});

test('a superseded activation does not reopen or close the project that replaced it', async () => {
  projectSession.close();
  const first = withHeldRead(createSession('First'));
  const firstActivation = projectSession.activate(
    { id: 'First', kind: 'memory', displayName: 'First' },
    first.session
  );

  const second = createSession('Second');
  await projectSession.activate({ id: 'Second', kind: 'memory', displayName: 'Second' }, second);
  assert.equal(state.current.projectRef.id, 'Second');

  first.release();
  await firstActivation;

  assert.equal(projectSession.getStatus(), 'open');
  assert.equal(state.current.projectRef.id, 'Second');
  projectSession.close();
});

test('status changes reach observers', async () => {
  projectSession.close();
  const seen = [];
  const unsubscribe = projectSession.onStatusChanged(status => seen.push(status));

  const session = createSession('Observed');
  await projectSession.activate({ id: 'Observed', kind: 'memory', displayName: 'Observed' }, session);
  projectSession.close();
  unsubscribe();

  assert.deepEqual(seen, ['activating', 'open', 'closed']);
});
