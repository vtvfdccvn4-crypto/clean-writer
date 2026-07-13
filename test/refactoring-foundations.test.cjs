const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let state;
let escapeRegExp;
let readDrawerNumber;
let ProjectSessionStore;
let InMemoryWorkspaceSession;
let bindProjectSettingsPanel;
let DocumentSessionController;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24683 } } });
  ({ state } = await server.ssrLoadModule('/src/state.ts'));
  ({ ProjectSessionStore } = await server.ssrLoadModule('/src/services/ProjectSessionStore.ts'));
  ({ InMemoryWorkspaceSession } = await server.ssrLoadModule('/src/platform/InMemoryWorkspace.ts'));
  ({ bindProjectSettingsPanel } = await server.ssrLoadModule('/src/ui/project-settings-panel.ts'));
  ({ DocumentSessionController } = await server.ssrLoadModule('/src/ui/DocumentSessionController.ts'));
  ({ escapeRegExp } = await server.ssrLoadModule('/src/utils/regex.ts'));
  ({ readDrawerNumber } = await server.ssrLoadModule('/src/ui/components/drawerControls.ts'));
});

after(async () => server?.close());

test('typed state subscriptions can be disposed', () => {
  let changes = 0;
  const unsubscribe = state.onProjectChanged(() => changes++);
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
    state.onProjectSnapshotChanged(() => snapshotEvents++),
    state.onPageSetupChanged(() => legacySettingEvents++),
    state.onTypographySetupChanged(() => legacySettingEvents++),
    state.onListSetupChanged(() => legacySettingEvents++)
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

test('editor setup is scoped to the active project and resets on close', () => {
  state.setProjectRef({ id: 'editor-scope', kind: 'memory', displayName: 'Editor scope' });
  state.setEditorSetup({ ...state.current.editorSetup, fontSize: '18pt', lineNumbers: false });

  state.closeProject();

  assert.equal(state.current.projectRef, null);
  assert.equal(state.current.editorSetup.fontSize, '10pt');
  assert.equal(state.current.editorSetup.lineNumbers, true);
});

test('project session owns active settings persistence and close lifecycle', async () => {
  const sessionStore = new ProjectSessionStore();
  const session = new InMemoryWorkspaceSession('session-project', 'Session project');
  const ref = { id: session.id, kind: 'memory', displayName: session.displayName };

  await sessionStore.activate(ref, session);
  await sessionStore.updateSettings({ editorSetup: { ...state.current.editorSetup, fontSize: '18pt' } });

  assert.equal((await session.readSettings()).editorSetup.fontSize, '18pt');
  sessionStore.close();
  assert.equal(state.current.projectRef, null);
});

test('project session rejects commands without an active project', async () => {
  const sessionStore = new ProjectSessionStore();
  assert.throws(() => sessionStore.requireSession(), /No project is open/);
  await assert.rejects(() => sessionStore.createSection('orphan.md'), /No project is open/);
  await assert.rejects(() => sessionStore.uploadImage('orphan.png', new Uint8Array([1])), /No project is open/);
});

test('project session activation replaces the active session atomically', async () => {
  const sessionStore = new ProjectSessionStore();
  const first = new InMemoryWorkspaceSession('first-session', 'First');
  const second = new InMemoryWorkspaceSession('second-session', 'Second');
  await sessionStore.activate({ id: first.id, kind: 'memory', displayName: first.displayName }, first);
  assert.equal(sessionStore.getSession(), first);
  await sessionStore.activate({ id: second.id, kind: 'memory', displayName: second.displayName }, second);
  assert.equal(sessionStore.getSession(), second);
  assert.equal(state.current.projectRef.id, second.id);
  sessionStore.close();
});

test('project settings panel binding refreshes from each project snapshot', () => {
  let refreshes = 0;
  const unsubscribe = bindProjectSettingsPanel(() => { refreshes += 1; });

  state.commitSettingsSnapshot({
    pageSetup: state.current.pageSetup,
    typographySetup: state.current.typographySetup,
    listSetup: state.current.listSetup,
    tableSetup: state.current.tableSetup,
    projectMetadata: state.current.projectMetadata,
    customStyles: state.current.customStyles,
    customBlockStyles: state.current.customBlockStyles,
    editorSetup: state.current.editorSetup
  });

  assert.equal(refreshes, 2);
  unsubscribe();
});

test('document session restores the saved view state for its owning project', () => {
  const controller = new DocumentSessionController();
  const ref = { id: 'project-a', kind: 'memory', displayName: 'Project A' };
  const createEditor = (selection) => ({
    getSelection: () => selection,
    getValue: () => 'abcdef',
    setSelection(from, to) { this.selection = { from, to }; },
    view: { scrollDOM: { scrollTop: 24 } },
    destroy() { this.destroyed = true; }
  });
  const firstEditor = createEditor({ from: 2, to: 4 });
  controller.activate(ref, 'section.md', firstEditor);
  controller.destroyActive();

  const restoredEditor = createEditor({ from: 0, to: 0 });
  controller.activate(ref, 'section.md', restoredEditor);
  const previousRaf = global.requestAnimationFrame;
  global.requestAnimationFrame = callback => { callback(); return 0; };
  try {
    controller.restoreViewState(ref, 'section.md');
  } finally {
    if (previousRaf === undefined) delete global.requestAnimationFrame;
    else global.requestAnimationFrame = previousRaf;
  }

  assert.deepEqual(restoredEditor.selection, { from: 2, to: 4 });
  assert.equal(restoredEditor.view.scrollDOM.scrollTop, 24);
});

test('tree refresh commits selection and file lists as one event', () => {
  let treeEvents = 0;
  let selectionEvents = 0;
  const unsubscribeTree = state.onProjectTreeChanged(() => treeEvents++);
  const unsubscribeSelection = state.onSelectionChanged(() => selectionEvents++);

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
