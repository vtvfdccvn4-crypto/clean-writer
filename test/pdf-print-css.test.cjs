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
  assert.match(css, /\.pagedjs_page[\s\S]*width: 210mm/);
  assert.match(css, /\.pagedjs_page[\s\S]*height: 297mm/);
  assert.match(css, /\.pagedjs_sheet[\s\S]*width: 210mm/);
  assert.match(css, /\.pagedjs_pagebox[\s\S]*height: 100%/);
  assert.match(css, /html, body[\s\S]*margin: 0 !important/);
  assert.match(css, /transform: none !important/);
  assert.match(css, /break-after: page/);
  assert.match(css, /print dialog/);
  assert.doesNotMatch(css, /size: 210pt 297pt/);
});
