const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let createPdfArtifact;
let PDF_ARTIFACT_SCHEMA_VERSION;

before(async () => {
  server = await createTestServer();
  ({ createPdfArtifact, PDF_ARTIFACT_SCHEMA_VERSION } = await server.ssrLoadModule('/src/pdf-preview/PdfArtifact.ts'));
});

after(async () => server?.close());

const validArtifact = () => ({
  schemaVersion: PDF_ARTIFACT_SCHEMA_VERSION,
  artifactId: 'artifact-1',
  key: {
    compilerVersion: 'pdf-render-v2',
    documentDigest: 'a'.repeat(64),
    stylesheetDigest: 'b'.repeat(64),
    marginsDigest: 'c'.repeat(64),
    assetsDigest: 'd'.repeat(64)
  },
  html: '<main class="pagedjs_pages"><section class="pagedjs_page"></section></main>',
  css: '@page { size: A4; }',
  pageCount: 1,
  pages: [{ number: 1, anchor: 'section-1' }]
});

test('PDF artifacts are validated and frozen at the rendering boundary', () => {
  const artifact = createPdfArtifact(validArtifact());

  assert.equal(Object.isFrozen(artifact), true);
  assert.equal(Object.isFrozen(artifact.pages), true);
  assert.equal(Object.isFrozen(artifact.pages[0]), true);
  assert.equal(Object.isFrozen(artifact.key), true);
  assert.equal(artifact.artifactId, 'artifact-1');
});

test('PDF artifacts reject incomplete or inconsistent render products', () => {
  assert.throws(() => createPdfArtifact({ ...validArtifact(), html: '' }), /missing page HTML/);
  assert.throws(() => createPdfArtifact({ ...validArtifact(), pageCount: 2 }), /page metadata/);
  assert.throws(() => createPdfArtifact({ ...validArtifact(), schemaVersion: 999 }), /Unsupported/);
  assert.throws(() => createPdfArtifact({ ...validArtifact(), key: { ...validArtifact().key, assetsDigest: '' } }), /incomplete render identity/);
  assert.throws(() => createPdfArtifact({ ...validArtifact(), key: { ...validArtifact().key, documentDigest: 'not-a-digest' } }), /incomplete render identity/);
});
