const assert = require('node:assert/strict');
const { before, after, describe, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

describe('Platform Adapter Contract Tests', () => {
  let server;
  let InMemoryWorkspaceRepository;

  before(async () => {
    server = await createTestServer({ server: { hmr: { port: 24687 } } });
    ({ InMemoryWorkspaceRepository } = await server.ssrLoadModule('/src/platform/InMemoryWorkspace.ts'));
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

    await session.createFolder('Folder');
    await session.createFolder('Folder/Subfolder');
    await session.createSection('Folder/Subfolder/nested.md', '# Nested');
    await session.mutateSettings({ type: 'append-order', path: 'Folder' });
    await session.mutateSettings({ type: 'append-order', path: 'Folder/Subfolder' });
    await session.mutateSettings({ type: 'append-order', path: 'Folder/Subfolder/nested.md' });
    await session.mutateSettings({ type: 'set-path-flag', key: 'tocSections', path: 'Folder/Subfolder/nested.md', enabled: true });
    await session.mutateSettings({ type: 'set-path-flag', key: 'pageBreaks', path: 'Folder/Subfolder/nested.md', enabled: true });

    const renamed = await session.renameSection('Folder', 'Renamed');
    assert.equal(renamed, true);

    let settings = await session.readSettings();
    assert.deepEqual(settings.order, ['Renamed', 'Renamed/Subfolder', 'Renamed/Subfolder/nested.md']);
    assert.deepEqual(settings.tocSections, ['Renamed/Subfolder/nested.md']);
    assert.deepEqual(settings.pageBreaks, ['Renamed/Subfolder/nested.md']);

    const moved = await session.moveSection('Renamed/Subfolder/nested.md', 'Renamed', 'before');
    assert.deepEqual(moved, { success: true, newPath: 'nested.md' });

    settings = await session.readSettings();
    assert.deepEqual(settings.order, ['nested.md', 'Renamed', 'Renamed/Subfolder']);
    assert.deepEqual(settings.tocSections, ['nested.md']);
    assert.deepEqual(settings.pageBreaks, ['nested.md']);

    const deleted = await session.deleteSection('Renamed');
    assert.equal(deleted, true);

    settings = await session.readSettings();
    assert.deepEqual(settings.order, ['nested.md']);
    assert.deepEqual(settings.tocSections, ['nested.md']);
    assert.deepEqual(settings.pageBreaks, ['nested.md']);
  });

  test('InMemory Workspace Adapter - rejects invalid moves instead of reporting success', async () => {
    const repo = new InMemoryWorkspaceRepository();
    const session = await repo.open({ id: 'move-mem-proj', kind: 'memory', displayName: 'Move Proj' });

    await session.createFolder('Folder');
    await session.createFolder('Folder/Subfolder');
    await session.createSection('Folder/Subfolder/nested.md', '# Nested');

    const missingSource = await session.moveSection('missing.md', 'Folder', 'before');
    assert.deepEqual(missingSource, { success: false });

    const invalidTarget = await session.moveSection('Folder', 'Folder/Subfolder', 'inside');
    assert.deepEqual(invalidTarget, { success: false });
  });
});
