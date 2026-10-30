const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let bundle;
let fileWorkspace;

before(async () => {
  server = await createTestServer();
  bundle = await server.ssrLoadModule('/src/backup/document-bundle.ts');
  fileWorkspace = await server.ssrLoadModule('/src/platform/CwdocFileWorkspace.ts');
});

after(async () => {
  await server?.close();
});

const text = value => new TextEncoder().encode(value);

/** A stand-in for a FileSystemFileHandle: it keeps the bytes on "disk" and counts writes. */
function fakeHandle(name, initial) {
  const disk = { bytes: initial, modified: 1, writes: 0 };
  return {
    name,
    disk,
    async getFile() {
      return new File([disk.bytes], name, { lastModified: disk.modified });
    },
    async createWritable() {
      let pending = null;
      return {
        async write(data) { pending = new Uint8Array(data); },
        async close() {
          disk.bytes = pending;
          disk.modified += 1;
          disk.writes += 1;
        },
        async abort() {}
      };
    }
  };
}

async function openedDocument() {
  const source = {
    displayName: 'Essay',
    listProjectFiles: async () => ['settings.json', 'sections/intro.md'],
    readProjectFile: async path => (path === 'settings.json'
      ? text(JSON.stringify({ schemaVersion: 5, order: ['intro.md'] }))
      : text('# Intro\n'))
  };
  const saved = await bundle.createDocumentFromSource(source, new Date(0));
  const parsed = await bundle.parseDocumentBundle(saved.bytes, { supportedSettingsSchemaVersion: 5 });
  const handle = fakeHandle('essay.cwdoc', saved.bytes);
  const session = new fileWorkspace.CwdocFileWorkspace('essay', 'Essay');
  await session.initialize();
  await bundle.writeDocumentFiles(session, parsed.files);
  session.attachFile(handle, (await handle.getFile()).lastModified);
  return { session, handle };
}

test('a change in an opened file is written back to that file', async () => {
  const { session, handle } = await openedDocument();
  await session.writeSection('intro.md', '# Changed\n');
  await session.flush();

  assert.equal(handle.disk.writes, 1);
  const reopened = await bundle.parseDocumentBundle(handle.disk.bytes, { supportedSettingsSchemaVersion: 5 });
  const section = reopened.files.find(file => file.path === 'sections/intro.md');
  assert.equal(new TextDecoder().decode(section.data), '# Changed\n');
});

test('a file that changed on disk is not overwritten', async () => {
  const { session, handle } = await openedDocument();
  handle.disk.modified += 10;
  await session.writeSection('intro.md', '# Mine\n');
  await assert.rejects(session.flush(), /changed on disk/);
  assert.equal(handle.disk.writes, 0);
});

test('a change is written after a short delay without an explicit save', async () => {
  const { session, handle } = await openedDocument();
  await session.writeSection('intro.md', '# Later\n');
  assert.equal(handle.disk.writes, 0, 'nothing is written during the delay');
  await new Promise(resolve => setTimeout(resolve, 1700));
  assert.equal(handle.disk.writes, 1);
});

test('loading a document is not a change, so nothing is written', async () => {
  const { handle } = await openedDocument();
  await new Promise(resolve => setTimeout(resolve, 1700));
  assert.equal(handle.disk.writes, 0);
});
