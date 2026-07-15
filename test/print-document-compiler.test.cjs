const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let createPrintLayoutSettings;
let compilePrintDocument;
let defaults;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24720 } } });
  ({ createPrintLayoutSettings } = await server.ssrLoadModule('/src/print/PrintLayoutSettings.ts'));
  ({ compilePrintDocument } = await server.ssrLoadModule('/src/print/PrintDocumentCompiler.ts'));
  defaults = await server.ssrLoadModule('/src/config/defaults.ts');
});

after(async () => server?.close());

function layout() {
  const pageSetup = structuredClone(defaults.DEFAULT_PAGE_SETUP);
  pageSetup.specialHeadings = [{
    id: 'exercise', name: 'Exercise', directive: ':::exercise', headingLevel: 3,
    counterStart: 1, counterPrefix: 'Exercise ', counterSuffix: '', breakBefore: true, includeInToc: true,
    fontFamily: 'Inter', fontSize: 12, color: '#000', isBold: true, isItalic: false, isAllCaps: false,
    lineHeight: 1.2, marginTop: 1, marginBottom: 1
  }];
  return createPrintLayoutSettings({
    pageSetup,
    typographySetup: structuredClone(defaults.DEFAULT_TYPOGRAPHY_SETUP),
    listSetup: structuredClone(defaults.DEFAULT_LIST_SETUP),
    tableSetup: structuredClone(defaults.DEFAULT_TABLE_SETUP),
    imageSetup: structuredClone(defaults.DEFAULT_IMAGE_SETUP),
    projectMetadata: structuredClone(defaults.DEFAULT_PROJECT_METADATA),
    customStyles: [], customBlockStyles: [],
    sections: [
      { path: 'one.md', isDir: false },
      { path: 'two.md', isDir: false, pageBreak: true },
      { path: 'three.md', isDir: false, pageBreak: true }
    ]
  });
}

test('deduplicates section, H1, and custom-heading requirements into canonical break markers', () => {
  const source = [
    '<div class="document-section" data-section-path="one.md"><h1>First</h1><p>Body</p></div>',
    '<div class="document-section" data-section-path="two.md"><div class="section-break">&nbsp;</div><h1>Second</h1><h3 class="special-heading" data-special-heading-id="exercise">Exercise</h3></div>',
    '<div class="document-section" data-section-path="three.md"><div class="section-break">&nbsp;</div><p>No heading</p></div>'
  ].join('');

  const compiled = compilePrintDocument(source, layout());

  assert.match(compiled.html, /^<article class="clear-writer-print-content">/);
  assert.doesNotMatch(compiled.html, /section-break/);
  assert.doesNotMatch(compiled.html, /<h1[^>]*First[^>]*data-print-break-before/);
  assert.match(compiled.html, /<h1[^>]*data-print-break-before="true"[^>]*>Second/);
  assert.match(compiled.html, /<h3[^>]*data-print-break-before="true"[^>]*><span class="special-heading-number"[^>]*>Exercise 1 <\/span>Exercise/);
  assert.match(compiled.html, /data-section-path="three\.md"[^>]*data-print-break-before="true"/);
  assert.deepEqual(compiled.breakManifest.map(entry => ({ path: entry.sectionPath, reasons: entry.reasons })), [
    { path: 'two.md', reasons: ['section', 'h1'] },
    { path: 'two.md', reasons: ['custom-heading'] },
    { path: 'three.md', reasons: ['section'] }
  ]);
});

test('breaks a later H1 even when it belongs to the first section', () => {
  const source = '<div class="document-section" data-section-path="one.md"><p>Preface</p><h1>Chapter</h1></div>';
  const compiled = compilePrintDocument(source, layout());

  assert.match(compiled.html, /<h1[^>]*data-print-break-before="true"[^>]*>Chapter/);
  assert.deepEqual(compiled.breakManifest[0].reasons, ['h1']);
});

test('annotates image-only paragraphs without CSS :has()', () => {
  const source = '<div class="document-section" data-section-path="one.md"><p><img data-image-source="screen.png" src="file:///screen.png"></p></div>';
  const compiled = compilePrintDocument(source, layout());

  assert.match(compiled.html, /<p class="clear-writer-print-image-block"><img data-image-source=/);
});

test('materialises custom-heading counters in the print artifact', () => {
  const source = '<div class="document-section" data-section-path="one.md"><h3 class="special-heading" data-special-heading-id="exercise">First</h3><h3 class="special-heading" data-special-heading-id="exercise">Second</h3></div>';
  const compiled = compilePrintDocument(source, layout());

  assert.match(compiled.html, /<span class="special-heading-number" aria-hidden="true">Exercise 1 <\/span>First/);
  assert.match(compiled.html, /<span class="special-heading-number" aria-hidden="true">Exercise 2 <\/span>Second/);
  assert.match(compiled.html, /style="font-family:&quot;Inter&quot;!important;font-size:12pt!important;color:#000!important;/);
});

test('materialises normal heading numbers only for opted-in sections', () => {
  const source = [
    '<div class="document-section" data-section-path="one.md" data-number-headings="true"><h1>One</h1><h2>Two</h2></div>',
    '<div class="document-section" data-section-path="two.md" data-number-headings="false"><h1>Unnumbered</h1></div>',
    '<div class="document-section" data-section-path="three.md" data-number-headings="true"><h2>Three</h2></div>'
  ].join('');
  const compiled = compilePrintDocument(source, layout());

  assert.match(compiled.html, /<h1><span class="heading-number" aria-hidden="true">1\. <\/span>One/);
  assert.match(compiled.html, /<h2><span class="heading-number" aria-hidden="true">1\.1\. <\/span>Two/);
  assert.match(compiled.html, /<h1(?:\s[^>]*)?>Unnumbered<\/h1>/);
  assert.match(compiled.html, /<h2><span class="heading-number" aria-hidden="true">1\.2\. <\/span>Three/);
});

test('materialises the TOC from headings in included sections', () => {
  const source = '<div class="document-section" data-section-path="one.md" data-include-in-toc="true"><div class="toc-placeholder"></div><h1>Chapter</h1><h2>Topic</h2><h2>Second topic</h2></div>';
  const compiled = compilePrintDocument(source, layout());

  assert.doesNotMatch(compiled.html, /toc-placeholder/);
  assert.match(compiled.html, /<nav class="table-of-contents"/);
  assert.match(compiled.html, /href="#heading-toc-0"[^>]*><span class="toc-label">Chapter[\s\S]*?<span class="toc-leader" aria-hidden="true"><\/span>/);
  assert.match(compiled.html, /href="#heading-toc-1"[^>]*><span class="toc-label">Topic/);
  assert.match(compiled.html, /href="#heading-toc-2"[^>]*><span class="toc-label">Second topic/);
});
