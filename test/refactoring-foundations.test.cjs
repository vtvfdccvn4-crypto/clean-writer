const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let APP_STATE_EVENTS;
let state;
let escapeRegExp;
let readDrawerNumber;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24683 } } });
  ({ APP_STATE_EVENTS, state } = await server.ssrLoadModule('/src/state.ts'));
  ({ escapeRegExp } = await server.ssrLoadModule('/src/utils/regex.ts'));
  ({ readDrawerNumber } = await server.ssrLoadModule('/src/ui/components/drawerControls.ts'));
});

after(async () => server?.close());

test('typed state subscriptions can be disposed', () => {
  let changes = 0;
  const unsubscribe = state.on(APP_STATE_EVENTS.projectChanged, () => changes++);
  state.setProjectRef({ id: 'first', kind: 'memory', displayName: 'First' });
  unsubscribe();
  state.setProjectRef({ id: 'second', kind: 'memory', displayName: 'Second' });
  assert.equal(changes, 1);
  assert.equal(state.current.projectPath, 'second');
});

test('project snapshots are immutable and emit one atomic event', () => {
  let snapshotEvents = 0;
  let legacySettingEvents = 0;
  const unsubscribers = [
    state.on(APP_STATE_EVENTS.projectSnapshotChanged, () => snapshotEvents++),
    state.on(APP_STATE_EVENTS.pageSetupChanged, () => legacySettingEvents++),
    state.on(APP_STATE_EVENTS.typographySetupChanged, () => legacySettingEvents++),
    state.on(APP_STATE_EVENTS.listSetupChanged, () => legacySettingEvents++)
  ];
  const beforeRevision = state.current.projectRevision;
  const settings = {
    pageSetup: state.current.pageSetup,
    typographySetup: state.current.typographySetup,
    listSetup: state.current.listSetup,
    projectMetadata: state.current.projectMetadata,
    customStyles: state.current.customStyles,
    customBlockStyles: state.current.customBlockStyles
  };

  state.commitProjectSnapshot({
    projectRef: { id: 'snapshot', kind: 'memory', displayName: 'Snapshot' },
    sections: [{ path: 'chapter.md', isDir: false }],
    images: [{ path: 'cover.png', isDir: false }],
    ...settings
  });
  unsubscribers.forEach(unsubscribe => unsubscribe());

  assert.equal(snapshotEvents, 1);
  assert.equal(legacySettingEvents, 0);
  assert.equal(state.current.projectRevision, beforeRevision + 1);
  assert.equal(state.current.activeFile, null);
  assert.equal(state.current.isFullDocMode, true);
  assert.equal(Object.isFrozen(state.current), true);
  assert.equal(Object.isFrozen(state.current.sections), true);
  assert.equal(Object.isFrozen(state.current.sections[0]), true);
  assert.equal(Object.isFrozen(state.current.pageSetup.header.left), true);
  assert.equal(Reflect.set(state.current.sections[0], 'path', 'mutated.md'), false);
  assert.equal(state.current.sections[0].path, 'chapter.md');
});

test('tree refresh commits selection and file lists as one event', () => {
  let treeEvents = 0;
  let selectionEvents = 0;
  const unsubscribeTree = state.on(APP_STATE_EVENTS.projectTreeChanged, () => treeEvents++);
  const unsubscribeSelection = state.on(APP_STATE_EVENTS.selectionChanged, () => selectionEvents++);

  state.setProjectTree([{ path: 'renamed.md', isDir: false }], [], 'renamed.md');
  unsubscribeTree();
  unsubscribeSelection();

  assert.equal(treeEvents, 1);
  assert.equal(selectionEvents, 0);
  assert.equal(state.current.activeFile, 'renamed.md');
  assert.equal(state.current.isFullDocMode, false);
});

test('shared regex escaping treats configured delimiters literally', () => {
  const delimiter = '[[a+b?]]';
  assert.equal(new RegExp(`^${escapeRegExp(delimiter)}$`).test(delimiter), true);
});

test('shared drawer number parsing applies fallback and bounds', () => {
  assert.equal(readDrawerNumber({ value: '12.5' }, 0, { min: 1, max: 20 }), 12.5);
  assert.equal(readDrawerNumber({ value: '999' }, 0, { integer: true, max: 200 }), 200);
  assert.equal(readDrawerNumber({ value: 'nope' }, 8), 8);
});
