const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let resolveExportMarginImageSource;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24703 } } });
  ({ resolveExportMarginImageSource } = await server.ssrLoadModule('/src/boot/export-pagination-frame.ts'));
});

after(async () => server?.close());

test('export pagination resolves header image sources to the main document asset URL', () => {
  const source = 'images/company-logo.png';
  const resolvedSource = 'blob:clear-writer/header-logo';

  assert.equal(
    resolveExportMarginImageSource(` ${source} `, { [source]: resolvedSource }),
    resolvedSource
  );
  assert.equal(
    resolveExportMarginImageSource('https://example.com/logo.png', {}),
    'https://example.com/logo.png'
  );
});
