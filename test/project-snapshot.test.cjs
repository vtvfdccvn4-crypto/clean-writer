const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let ProjectService;
let state;
let previewMetrics;
let InMemoryWorkspaceSession;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24686 } } });
  ({ state } = await server.ssrLoadModule('/src/state.ts'));
  ({ ProjectService } = await server.ssrLoadModule('/src/services/ProjectService.ts'));
  ({ previewMetrics } = await server.ssrLoadModule('/src/perf/preview-metrics.ts'));
  ({ InMemoryWorkspaceSession } = await server.ssrLoadModule('/src/platform/InMemoryWorkspace.ts'));
});

after(async () => {
  await server?.close();
});

function createSession(id, sectionName = 'chapter.md') {
  const session = new InMemoryWorkspaceSession(id, id);
  session.sectionsMap.set(sectionName, `# ${sectionName}`);
  session.imagesMap.set('cover.png', new Blob(['image']));
  return session;
}

test('project loading reads each source once and publishes one snapshot', async () => {
  previewMetrics.reset();
  let snapshotEvents = 0;
  let treeEvents = 0;
  const unsubscribeSnapshot = state.onProjectSnapshotChanged(() => snapshotEvents++);
  const unsubscribeTree = state.onProjectTreeChanged(() => treeEvents++);
  const session = createSession('Project');

  state.setProjectRef({ id: session.id, kind: 'memory', displayName: session.displayName });
  await ProjectService.loadProjectSnapshot(session);
  unsubscribeSnapshot();
  unsubscribeTree();

  assert.equal(snapshotEvents, 1);
  assert.equal(treeEvents, 0);
  assert.equal(previewMetrics.snapshot().buckets.projectSnapshotLoad.count, 1);
  assert.equal(previewMetrics.snapshot().buckets.projectSnapshotLoad.totalMs >= 0, true);
  assert.match(previewMetrics.formatChipSummary(), /^snapshot\s+\d/);
  assert.match(previewMetrics.formatChipSummary(), /\|\s*renders\s+\d+/);
  assert.deepEqual(state.current.sections.map(section => section.path), ['chapter.md']);
  assert.deepEqual(state.current.images.map(image => image.path), ['cover.png']);
  assert.equal(Object.isFrozen(state.current.sections[0]), true);
});

test('a slower project read cannot overwrite a newer project snapshot', async () => {
  previewMetrics.reset();
  let releaseSlowRead;
  const slowRead = new Promise(resolve => { releaseSlowRead = resolve; });
  const slowSession = createSession('Slow', 'slow.md');
  const fastSession = createSession('Fast', 'fast.md');
  const originalSlowListSections = slowSession.listSections.bind(slowSession);
  const originalSlowReadSettings = slowSession.readSettings.bind(slowSession);
  slowSession.listSections = async () => {
    await slowRead;
    return originalSlowListSections();
  };
  slowSession.readSettings = async () => {
    await slowRead;
    return originalSlowReadSettings();
  };

  let snapshots = 0;
  const unsubscribe = state.onProjectSnapshotChanged(() => snapshots++);

  state.setProjectRef({ id: slowSession.id, kind: 'memory', displayName: slowSession.displayName });
  const staleLoad = ProjectService.loadProjectSnapshot(slowSession);
  state.setProjectRef({ id: fastSession.id, kind: 'memory', displayName: fastSession.displayName });
  await ProjectService.loadProjectSnapshot(fastSession);
  releaseSlowRead();
  await staleLoad;
  unsubscribe();

  assert.equal(snapshots, 1);
  assert.equal(state.current.projectPath, 'Fast');
  assert.deepEqual(state.current.sections.map(section => section.path), ['fast.md']);
  assert.equal(previewMetrics.snapshot().buckets.projectSnapshotLoad.count, 2);
});

test('tree refreshes are timed separately from project snapshot loads', async () => {
  previewMetrics.reset();
  const session = createSession('Project');
  state.setProjectRef({ id: session.id, kind: 'memory', displayName: session.displayName });
  await ProjectService.loadProjectSnapshot(session);
  await ProjectService.refreshProjectTree(session, 'chapter.md');

  const metrics = previewMetrics.snapshot().buckets;
  assert.equal(metrics.projectSnapshotLoad.count, 1);
  assert.equal(metrics.projectTreeRefresh.count, 1);
  assert.ok(metrics.projectSnapshotLoad.totalMs >= 0);
  assert.ok(metrics.projectTreeRefresh.totalMs >= 0);
});
