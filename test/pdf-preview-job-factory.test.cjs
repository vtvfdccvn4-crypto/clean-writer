const { after, before, test } = require('node:test');
const assert = require('node:assert/strict');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let createPdfPreviewJob;
let createPrintLayoutSettings;
let defaults;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24720 } } });
  ({ createPdfPreviewJob } = await server.ssrLoadModule('/src/pdf-preview/PdfPreviewJobFactory.ts'));
  ({ createPrintLayoutSettings } = await server.ssrLoadModule('/src/print/PrintLayoutSettings.ts'));
  defaults = await server.ssrLoadModule('/src/config/defaults.ts');
});

after(async () => server?.close());

test('PDF preview job factory builds an immutable snapshot with html, css, and layout data', () => {
  const layout = createPrintLayoutSettings({
    pageSetup: structuredClone(defaults.DEFAULT_PAGE_SETUP),
    typographySetup: structuredClone(defaults.DEFAULT_TYPOGRAPHY_SETUP),
    listSetup: structuredClone(defaults.DEFAULT_LIST_SETUP),
    tableSetup: structuredClone(defaults.DEFAULT_TABLE_SETUP),
    imageSetup: structuredClone(defaults.DEFAULT_IMAGE_SETUP),
    projectMetadata: structuredClone(defaults.DEFAULT_PROJECT_METADATA),
    customStyles: [],
    customBlockStyles: [],
    sections: []
  });
  const noopResolver = { resolveAsset: () => null };
  const sourceHtml = '<div class="document-section" data-section-path="doc.md"><p>Hello world</p></div>';
  const job = createPdfPreviewJob(sourceHtml, layout, noopResolver);

  assert.ok(typeof job.html === 'string', 'job.html is a string');
  assert.ok(typeof job.css === 'string', 'job.css is a string');
  assert.ok(job.html.includes('Hello world'), 'source HTML is included in output');
  assert.ok(job.css.includes('clear-writer-print-content'), 'CSS is scoped to print content');
  assert.ok(Object.isFrozen(job.assets), 'assets array is frozen');
});

test('PDF preview job css does not leak live-preview scope', () => {
  const layout = createPrintLayoutSettings({
    pageSetup: structuredClone(defaults.DEFAULT_PAGE_SETUP),
    typographySetup: structuredClone(defaults.DEFAULT_TYPOGRAPHY_SETUP),
    listSetup: structuredClone(defaults.DEFAULT_LIST_SETUP),
    tableSetup: structuredClone(defaults.DEFAULT_TABLE_SETUP),
    imageSetup: structuredClone(defaults.DEFAULT_IMAGE_SETUP),
    projectMetadata: structuredClone(defaults.DEFAULT_PROJECT_METADATA),
    customStyles: [],
    customBlockStyles: [],
    sections: []
  });
  const noopResolver = { resolveAsset: () => null };
  const sourceHtml = '<div class="document-section" data-section-path="doc.md"><p>Test</p></div>';
  const job = createPdfPreviewJob(sourceHtml, layout, noopResolver);

  assert.doesNotMatch(job.css, /paged-stage\.is-live-preview/, 'print CSS must not contain live-preview scope');
  assert.doesNotMatch(job.css, /!important/, 'print CSS must not use !important');
});
