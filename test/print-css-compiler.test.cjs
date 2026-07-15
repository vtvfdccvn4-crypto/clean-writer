const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let createPrintLayoutSettings;
let compilePrintCss;
let defaults;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24719 } } });
  ({ createPrintLayoutSettings } = await server.ssrLoadModule('/src/print/PrintLayoutSettings.ts'));
  ({ compilePrintCss } = await server.ssrLoadModule('/src/print/PrintCssCompiler.ts'));
  defaults = await server.ssrLoadModule('/src/config/defaults.ts');
});

after(async () => server?.close());

test('compiles paper geometry and body typography from the frozen print snapshot', () => {
  const pageSetup = structuredClone(defaults.DEFAULT_PAGE_SETUP);
  const typographySetup = structuredClone(defaults.DEFAULT_TYPOGRAPHY_SETUP);
  pageSetup.paperWidth = 216;
  pageSetup.paperHeight = 279;
  pageSetup.marginTop = 18;
  pageSetup.marginRight = 17;
  pageSetup.marginBottom = 16;
  pageSetup.marginLeft = 15;
  pageSetup.header.centerWidth = '37mm';
  pageSetup.footer.centerWidth = '24%';
  pageSetup.header.left = {
    content: 'Document ${documentNumber} / {page}', fontFamily: 'Aptos Display', fontSize: 8,
    color: '#112233', isBold: true, isItalic: true, horizontalAlign: 'left', verticalAlign: 'top'
  };
  pageSetup.toc.h2 = { fontFamily: 'Verdana', fontSize: 17, color: '#445566', isBold: true, isItalic: true, isAllCaps: true };
  typographySetup.h1 = { fontFamily: 'Calibri', fontSize: 29, color: '#123456', isBold: false, isItalic: true, lineHeight: 1.8, marginTop: 21, marginBottom: 13 };

  const layout = createPrintLayoutSettings({
    pageSetup, typographySetup,
    listSetup: structuredClone(defaults.DEFAULT_LIST_SETUP),
    tableSetup: structuredClone(defaults.DEFAULT_TABLE_SETUP),
    imageSetup: structuredClone(defaults.DEFAULT_IMAGE_SETUP),
    projectMetadata: { ...defaults.DEFAULT_PROJECT_METADATA, documentNumber: 'CW-42' },
    customStyles: [{ id: 'quote', name: 'Quote', openingPair: '“', closingPair: '”', fontFamily: 'Georgia', fontSize: 14, color: '#654321', isBold: false, isItalic: true }],
    customBlockStyles: [{ id: 'callout', name: 'Callout', prefix: '!', icon: 'ℹ', fontFamily: 'Cambria', fontSize: 11, color: '#102030', isBold: true, isItalic: false, lineHeight: 1.6, marginTop: 7, marginBottom: 9 }], sections: []
  });
  const css = compilePrintCss(layout);

  assert.match(css, /size: 216mm 279mm/);
  assert.match(css, /margin: 18mm 17mm 16mm 15mm/);
  assert.match(css, /@top-left \{ content: ""; \}/);
  assert.match(css, /@bottom-right \{ content: ""; \}/);
  assert.match(css, /@top-(?:left|center|right)\s*\{/);
  assert.match(css, /@bottom-(?:left|center|right)\s*\{/);
  assert.doesNotMatch(css, /Document CW-42/);
  assert.match(css, /font-size: 29pt/);
  assert.match(css, /color: #123456/);
  assert.match(css, /line-height: 1\.8/);
  assert.match(css, /ul\[data-marker="asterisk"\]/);
  assert.match(css, /padding-inline-start: 20pt/);
  assert.match(css, /list-style: none/);
  assert.match(css, /grid-template-columns: max-content minmax\(0, 1fr\)/);
  assert.match(css, /content: "\*"/);
  assert.match(css, /table\[data-table-style="1"\]/);
  assert.match(css, /border-collapse: collapse/);
  assert.match(css, /clear-writer-print-image-block/);
  assert.match(css, /max-width: 100%/);
  assert.match(css, /custom-style\[data-custom-style-id="quote"\]/);
  assert.match(css, /font-family: "Georgia"/);
  assert.match(css, /custom-block-style\[data-custom-block-id="callout"\]/);
  assert.match(css, /font-family: "Cambria"/);
  assert.match(css, /line-height: 1\.6/);
  assert.match(css, /custom-block-glyph/);
  assert.match(css, /\[data-print-break-before="true"\]/);
  assert.match(css, /break-before: page/);
  assert.doesNotMatch(css, /special-heading\[data-special-heading-id=/);
  assert.match(css, /font-family: "Verdana"/);
  assert.match(css, /table-of-contents/);
  assert.match(css, /\.toc-leader\s*\{[^}]*border-bottom: 1px dotted currentColor;/s);
  assert.match(css, /\.toc-page-number\s*\{[^}]*min-width: 2ch;[^}]*text-align: right;/s);
  assert.doesNotMatch(css, /target-counter\(/);
  assert.match(css, /data-print-break-before/);
});

test('does not import preview defaults or browser-level page breaks', () => {
  const layout = createPrintLayoutSettings({
    pageSetup: structuredClone(defaults.DEFAULT_PAGE_SETUP),
    typographySetup: structuredClone(defaults.DEFAULT_TYPOGRAPHY_SETUP),
    listSetup: structuredClone(defaults.DEFAULT_LIST_SETUP),
    tableSetup: structuredClone(defaults.DEFAULT_TABLE_SETUP),
    imageSetup: structuredClone(defaults.DEFAULT_IMAGE_SETUP),
    projectMetadata: structuredClone(defaults.DEFAULT_PROJECT_METADATA),
    customStyles: [], customBlockStyles: [], sections: []
  });
  const css = compilePrintCss(layout);

  assert.doesNotMatch(css, /break-after:\s*page/);
  assert.doesNotMatch(css, /page-break-after/);
  assert.doesNotMatch(css, /paged-stage\.is-live-preview/);
});
