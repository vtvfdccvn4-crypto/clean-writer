const assert = require('node:assert/strict');
const { before, after, describe, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

describe('Platform Adapter Contract Tests', () => {
  let server;
  let InMemoryWorkspaceRepository;
  let ProjectService;
  let state;

  before(async () => {
    server = await createTestServer({ server: { hmr: { port: 24687 } } });
    ({ InMemoryWorkspaceRepository } = await server.ssrLoadModule('/src/platform/InMemoryWorkspace.ts'));
    ({ ProjectService } = await server.ssrLoadModule('/src/services/ProjectService.ts'));
    ({ state } = await server.ssrLoadModule('/src/state.ts'));
  });

  after(async () => {
    await server?.close();
  });

  test('InMemory Workspace Adapter - creates and manages settings in memory', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const ref = { id: 'test-mem-proj', kind: 'memory', displayName: 'Memory Proj' };
    const session = await repo.open(ref);

    assert.equal(session.id, 'test-mem-proj');
    assert.equal(session.kind, 'memory');
    
    const settings = await session.readSettings();
    assert.equal(settings.schemaVersion, 5);

    // Mutate settings
    await session.mutateSettings({ type: 'append-order', path: 'sections/intro.md' });
    const updated = await session.readSettings();
    assert.deepEqual(updated.order, ['sections/intro.md']);
  });

  test('InMemory Workspace Adapter - performs transient CRUD operations on sections', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const session = await repo.open({ id: 'crud-mem-proj', kind: 'memory', displayName: 'Crud Proj' });

    // Create section
    await session.createSection('sections/chapter1.md', '# Chapter 1\nHello World');
    const content = await session.readSection('sections/chapter1.md');
    assert.equal(content, '# Chapter 1\nHello World');

    const sections = await session.listSections();
    assert.ok(sections.some(s => s.path === 'sections/chapter1.md' && !s.isDir));

    // Rename section
    await session.renameSection('sections/chapter1.md', 'sections/chapter-one.md');
    const renamedContent = await session.readSection('sections/chapter-one.md');
    assert.equal(renamedContent, '# Chapter 1\nHello World');

    // Delete section
    await session.deleteSection('sections/chapter-one.md');
    await assert.rejects(() => session.readSection('sections/chapter-one.md'));
  });

  test('InMemory Workspace Adapter - keeps settings paths aligned during rename, move, and delete', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const session = await repo.open({ id: 'settings-mem-proj', kind: 'memory', displayName: 'Settings Proj' });

    await session.createFolder('sections/Folder');
    await session.createFolder('sections/Folder/Subfolder');
    await session.createSection('sections/Folder/Subfolder/nested.md', '# Nested');
    await session.mutateSettings({ type: 'append-order', path: 'sections/Folder' });
    await session.mutateSettings({ type: 'append-order', path: 'sections/Folder/Subfolder' });
    await session.mutateSettings({ type: 'append-order', path: 'sections/Folder/Subfolder/nested.md' });
    await session.mutateSettings({ type: 'set-path-flag', key: 'tocSections', path: 'sections/Folder/Subfolder/nested.md', enabled: true });
    await session.mutateSettings({ type: 'set-path-flag', key: 'pageBreaks', path: 'sections/Folder/Subfolder/nested.md', enabled: true });

    const renamed = await session.renameSection('sections/Folder', 'sections/Renamed');
    assert.equal(renamed, true);

    let settings = await session.readSettings();
    assert.deepEqual(settings.order, ['sections/Renamed', 'sections/Renamed/Subfolder', 'sections/Renamed/Subfolder/nested.md']);
    assert.deepEqual(settings.tocSections, ['sections/Renamed/Subfolder/nested.md']);
    assert.deepEqual(settings.pageBreaks, ['sections/Renamed/Subfolder/nested.md']);
    assert.equal(await session.readSection('sections/Renamed/Subfolder/nested.md'), '# Nested');

    const moved = await session.moveSection('sections/Renamed/Subfolder/nested.md', 'sections/Renamed', 'before');
    assert.deepEqual(moved, { success: true, newPath: 'sections/nested.md' });

    settings = await session.readSettings();
    assert.deepEqual(settings.order, ['sections/nested.md', 'sections/Renamed', 'sections/Renamed/Subfolder']);
    assert.deepEqual(settings.tocSections, ['sections/nested.md']);
    assert.deepEqual(settings.pageBreaks, ['sections/nested.md']);

    const deleted = await session.deleteSection('sections/Renamed');
    assert.equal(deleted, true);

    settings = await session.readSettings();
    assert.deepEqual(settings.order, ['sections/nested.md']);
    assert.deepEqual(settings.tocSections, ['sections/nested.md']);
    assert.deepEqual(settings.pageBreaks, ['sections/nested.md']);
    assert.deepEqual((await session.listSections()).map(entry => entry.path), ['sections/nested.md']);
  });

  test('InMemory Workspace Adapter - rejects invalid moves instead of reporting success', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const session = await repo.open({ id: 'move-mem-proj', kind: 'memory', displayName: 'Move Proj' });

    await session.createFolder('sections/Folder');
    await session.createFolder('sections/Folder/Subfolder');
    await session.createSection('sections/Folder/Subfolder/nested.md', '# Nested');

    const missingSource = await session.moveSection('sections/missing.md', 'sections/Folder', 'before');
    assert.deepEqual(missingSource, { success: false });

    const invalidTarget = await session.moveSection('sections/Folder', 'sections/Folder/Subfolder', 'inside');
    assert.deepEqual(invalidTarget, { success: false });
  });

  test('InMemory Workspace Adapter - resolves unprefixed names the same way as the real backends', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const session = await repo.open({ id: 'prefix-mem-proj', kind: 'memory', displayName: 'Prefix Proj' });

    assert.deepEqual(await session.createSection('chapter.md', '# Chapter'), { success: true, newPath: 'sections/chapter.md' });
    assert.equal(await session.readSection('chapter.md'), '# Chapter');
    assert.deepEqual((await session.listSections()).map(entry => entry.path), ['sections/chapter.md']);
  });

  test('InMemory Workspace Adapter - rejects same-path filesystem moves without deleting the source', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const session = await repo.open({ id: 'same-path-move-proj', kind: 'memory', displayName: 'Same Path Move' });
    await session.createSection('sections/One.md', '# One');
    await session.createSection('sections/Two.md', '# Two');

    const result = await session.moveSection('sections/Two.md', 'sections/One.md', 'before');
    assert.deepEqual(result, { success: false });
    assert.equal(await session.readSection('sections/Two.md'), '# Two');
  });

  test('ProjectService reorders siblings without touching their files', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const ref = { id: 'reorder-mem-proj', kind: 'memory', displayName: 'Reorder Proj' };
    const session = await repo.open(ref);
    await session.createSection('sections/One.md', '# One');
    await session.createSection('sections/Two.md', '# Two');
    await session.mutateSettings({ type: 'set-order', order: ['sections/One.md', 'sections/Two.md'] });
    state.setProjectRef(ref);

    const moved = await ProjectService.moveSection(session, 'sections/Two.md', 'sections/One.md', 'before');
    assert.equal(moved, true);
    assert.equal(await session.readSection('sections/One.md'), '# One');
    assert.equal(await session.readSection('sections/Two.md'), '# Two');
    assert.deepEqual((await session.readSettings()).order, ['sections/Two.md', 'sections/One.md']);
    state.closeProject();
  });

  test('ProjectService relocates a section between folders and persists the new path', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const ref = { id: 'relocate-mem-proj', kind: 'memory', displayName: 'Relocate Proj' };
    const session = await repo.open(ref);
    await session.createFolder('sections/Archive');
    await session.createFolder('sections/Notes');
    await session.createSection('sections/One.md', '# One');
    await session.mutateSettings({ type: 'set-order', order: ['sections/Archive', 'sections/Notes', 'sections/One.md'] });
    state.setProjectRef(ref);

    const moved = await ProjectService.moveSection(session, 'sections/One.md', 'sections/Archive', 'inside');
    assert.equal(moved, true);
    assert.equal(await session.readSection('sections/Archive/One.md'), '# One');
    await assert.rejects(() => session.readSection('sections/One.md'));
    assert.ok((await session.readSettings()).order.includes('sections/Archive/One.md'));
    state.closeProject();
  });

  test('ProjectService rejects an invalid relocation without changing the source', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const ref = { id: 'invalid-relocate-mem-proj', kind: 'memory', displayName: 'Invalid Relocate Proj' };
    const session = await repo.open(ref);
    await session.createFolder('sections/Archive');
    await session.createSection('sections/One.md', '# One');
    state.setProjectRef(ref);

    const moved = await ProjectService.moveSection(session, 'sections/missing.md', 'sections/Archive', 'inside');
    assert.equal(moved, false);
    assert.equal(await session.readSection('sections/One.md'), '# One');
    state.closeProject();
  });
});
