const test = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let buildPdfPrintCss;

test.before(async () => {
  server = await createTestServer();
  ({ buildPdfPrintCss } = await server.ssrLoadModule('/src/platform/pdf-print-css.ts'));
});

test.after(async () => {
  await server.close();
});

test('builds print CSS from the stored millimetre page setup', () => {
  const css = buildPdfPrintCss({ paperWidth: 210, paperHeight: 297 });

  assert.match(css, /size: 210mm 297mm/);
  assert.match(css, /html,\s*body[\s\S]*margin: 0 !important/);
  assert.match(css, /transform: none !important/);
  assert.doesNotMatch(css, /break-after:\s*page/);
  assert.doesNotMatch(css, /page-break-after:\s*always/);
  assert.match(css, /Paged\.js has already made every physical page/);
  assert.doesNotMatch(css, /\.pagedjs_sheet\s*\{/);
  assert.doesNotMatch(css, /\.pagedjs_pagebox\s*\{/);
  assert.doesNotMatch(css, /size: 210pt 297pt/);
});
