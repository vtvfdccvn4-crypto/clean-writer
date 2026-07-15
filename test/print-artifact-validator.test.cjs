const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let isMeaningfulPageContent;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24721 } } });
  ({ isMeaningfulPageContent } = await server.ssrLoadModule('/src/print/PrintArtifactValidator.ts'));
});

after(async () => server?.close());

test('recognises text and visual page content while rejecting whitespace-only pages', () => {
  assert.equal(isMeaningfulPageContent({ textContent: ' \n\u00a0 ', querySelector: () => null }), false);
  assert.equal(isMeaningfulPageContent({ textContent: 'Chapter one', querySelector: () => null }), true);
  assert.equal(isMeaningfulPageContent({ textContent: '', querySelector: selector => selector === 'img, svg, canvas, table, hr, pre, blockquote' ? {} : null }), true);
});
