const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let isLargeDocument;
let LARGE_DOCUMENT_CHARACTERS;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24711 } } });
  ({ isLargeDocument, LARGE_DOCUMENT_CHARACTERS } = await server.ssrLoadModule('/src/preview/PreviewPolicy.ts'));
});

after(async () => server?.close());

test('documents at the threshold still open in the print preview', () => {
  assert.equal(isLargeDocument(LARGE_DOCUMENT_CHARACTERS), false);
  assert.equal(isLargeDocument(0), false);
});

test('documents above the threshold open in the live preview', () => {
  assert.equal(isLargeDocument(LARGE_DOCUMENT_CHARACTERS + 1), true);
  assert.equal(isLargeDocument(2_199_592), true);
});
