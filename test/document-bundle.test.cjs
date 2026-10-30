const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let bundle;
let zip;
let backup;

before(async () => {
  server = await createTestServer();
  bundle = await server.ssrLoadModule('/src/backup/document-bundle.ts');
  zip = await server.ssrLoadModule('/src/backup/zip.ts');
  backup = await server.ssrLoadModule('/src/backup/project-backup.ts');
});

after(async () => {
  await server?.close();
});

const encoder = new TextEncoder();
const text = value => encoder.encode(value);
const SETTINGS = text(JSON.stringify({ schemaVersion: 5, order: ['intro.md'] }));

function sampleFiles() {
  return [
    { path: 'settings.json', data: SETTINGS },
    { path: 'sections/intro.md', data: text('# Intro\n') },
    { path: 'images/fig-1.png', data: new Uint8Array([137, 80, 78, 71, 1, 2, 3]) }
  ];
}

async function make(files = sampleFiles(), extra = {}) {
  return bundle.createDocumentBundle({ title: 'My Essay', files, settingsSchemaVersion: 5, now: new Date(0), ...extra });
}

async function rebuildWithManifest(manifestPatch, files = sampleFiles()) {
  const manifest = {
    format: bundle.DOCUMENT_BUNDLE_FORMAT,
    bundleVersion: 1,
    minReaderVersion: 1,
    createdAt: new Date(0).toISOString(),
    settingsSchemaVersion: 5,
    title: 'My Essay',
    files: await Promise.all(files.map(async file => ({ path: file.path, size: file.data.length, sha256: await bundle.sha256Hex(file.data) })))
  };
  Object.assign(manifest, manifestPatch);
  const entries = [{ path: 'document.json', data: text(JSON.stringify(manifest)) }, ...files];
  return zip.createZip(entries);
}

const parse = bytes => bundle.parseDocumentBundle(bytes, { supportedSettingsSchemaVersion: 5 });

test('a created document round-trips with its title and every file', async () => {
  const parsed = await parse(await make());
  assert.equal(parsed.kind, 'document');
  assert.equal(parsed.manifest.title, 'My Essay');
  assert.equal(parsed.manifest.files.length, 3);
  assert.deepEqual(parsed.files.map(file => file.path).sort(), ['images/fig-1.png', 'sections/intro.md', 'settings.json']);
  const section = parsed.files.find(file => file.path === 'sections/intro.md');
  assert.equal(new TextDecoder().decode(section.data), '# Intro\n');
});

test('a document without settings cannot be created', async () => {
  await assert.rejects(make([{ path: 'sections/intro.md', data: text('x') }]), /has no settings/);
});

test('a file outside the document roots cannot be saved', async () => {
  await assert.rejects(make([...sampleFiles(), { path: '.trash/x', data: text('x') }]), /not a document file/);
});

test('same-size corruption is caught by the checksum and names the file', async () => {
  const original = sampleFiles();
  const manifestEntry = (await zip.readZip(await rebuildWithManifest({}, original))).find(entry => entry.path === 'document.json');
  const tampered = sampleFiles();
  tampered[1] = { path: 'sections/intro.md', data: text('# Intra\n') };
  const tamperedZip = zip.createZip([manifestEntry, ...tampered]);
  await assert.rejects(parse(tamperedZip), /sections\/intro\.md.*checksum/);
});

test('a newer bundle version is refused with an update message', async () => {
  const bytes = await rebuildWithManifest({ bundleVersion: 2, minReaderVersion: 2 });
  await assert.rejects(parse(bytes), /newer version of Clear Writer/);
});

test('settings from a newer schema are refused, not normalised down', async () => {
  const bytes = await rebuildWithManifest({ settingsSchemaVersion: 6 });
  await assert.rejects(parse(bytes), /newer version of Clear Writer/);
});

test('a listed file that is missing is reported as incomplete', async () => {
  const files = sampleFiles();
  const bytes = await rebuildWithManifest({}, files);
  const withoutImage = (await zip.readZip(bytes)).filter(entry => entry.path !== 'images/fig-1.png');
  await assert.rejects(parse(zip.createZip(withoutImage)), /"images\/fig-1\.png" is missing/);
});

test('a ZIP with no manifest is not a document', async () => {
  await assert.rejects(parse(zip.createZip([{ path: 'settings.json', data: SETTINGS }])), /not a Clear Writer document/);
});

test('a legacy ZIP backup still opens, as a legacy backup', async () => {
  const source = {
    displayName: 'Old Project',
    listProjectFiles: async () => ['settings.json', 'sections/intro.md'],
    readProjectFile: async path => (path === 'settings.json' ? SETTINGS : text('# Intro\n'))
  };
  const created = await backup.createProjectBackup(source, new Date(0));
  const parsed = await parse(created.bytes);
  assert.equal(parsed.kind, 'legacy-backup');
  assert.equal(parsed.files.length, 2);
});

function projectSource(files, displayName = 'My Essay') {
  const store = new Map(Object.entries(files).map(([path, value]) => [path, text(value)]));
  return {
    displayName,
    listProjectFiles: async () => [...store.keys()],
    readProjectFile: async path => store.get(path)
  };
}

test('saving a project leaves editor preferences and trash out of the document', async () => {
  const settings = JSON.stringify({ schemaVersion: 5, order: ['intro.md'], editorSetup: { lineWrapping: true } });
  const source = projectSource({
    'settings.json': settings,
    'sections/intro.md': '# Intro\n',
    '.trash/1/data/old.md': 'deleted'
  });
  const saved = await bundle.createDocumentFromSource(source, new Date(0));
  assert.equal(saved.fileName, 'My Essay.cwdoc');
  const parsed = await parse(saved.bytes);
  assert.equal(parsed.manifest.title, 'My Essay');
  assert.deepEqual(parsed.files.map(file => file.path).sort(), ['sections/intro.md', 'settings.json']);
  const savedSettings = JSON.parse(new TextDecoder().decode(parsed.files.find(file => file.path === 'settings.json').data));
  assert.equal('editorSetup' in savedSettings, false);
  assert.deepEqual(savedSettings.order, ['intro.md']);
});

test('a document name that is not safe in a file name is cleaned up', () => {
  assert.equal(bundle.documentFileName('a/b\\c:d*e?'), 'a-b-c-d-e.cwdoc');
  assert.equal(bundle.documentFileName('   '), 'Untitled.cwdoc');
});

test('opening writes the document content first and the settings last', async () => {
  const parsed = await parse(await make());
  const order = [];
  const target = { writeProjectFile: async path => order.push(path) };
  await bundle.writeDocumentFiles(target, parsed.files);
  assert.equal(order[order.length - 1], 'settings.json');
  assert.equal(order.length, 3);
});
