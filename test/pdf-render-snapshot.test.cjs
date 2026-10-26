const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let defaults;
let createPrintLayoutSettings;
let createPdfRenderSnapshot;
let samePdfArtifactKey;

before(async () => {
  server = await createTestServer();
  ({ createPrintLayoutSettings } = await server.ssrLoadModule('/src/print/PrintLayoutSettings.ts'));
  ({ createPdfRenderSnapshot, samePdfArtifactKey } = await server.ssrLoadModule('/src/pdf-preview/PdfRenderSnapshot.ts'));
  defaults = await server.ssrLoadModule('/src/config/defaults.ts');
});

after(async () => server?.close());

function snapshot({ header = '', footer = '', title = '', logo = '' } = {}) {
  const pageSetup = structuredClone(defaults.DEFAULT_PAGE_SETUP);
  pageSetup.header.left.content = header + logo;
  pageSetup.footer.right.content = footer;
  const layout = createPrintLayoutSettings({
    pageSetup,
    typographySetup: structuredClone(defaults.DEFAULT_TYPOGRAPHY_SETUP),
    listSetup: structuredClone(defaults.DEFAULT_LIST_SETUP),
    tableSetup: structuredClone(defaults.DEFAULT_TABLE_SETUP),
    imageSetup: structuredClone(defaults.DEFAULT_IMAGE_SETUP),
    projectMetadata: { ...defaults.DEFAULT_PROJECT_METADATA, documentTitle: title },
    customStyles: [], customBlockStyles: [], sections: []
  });
  return createPdfRenderSnapshot('<div class="document-section" data-section-path="body.md"><p>Body</p></div>', layout, {
    resolveSync: source => `asset://${source}`
  });
}

test('artifact identity includes every PDF rendering input', () => {
  const baseline = snapshot({ header: 'Header', footer: 'Footer', title: 'Title', logo: '![Logo](logo-a)' });
  const equal = snapshot({ header: 'Header', footer: 'Footer', title: 'Title', logo: '![Logo](logo-a)' });

  assert.equal(samePdfArtifactKey(baseline.key, equal.key), true);
  assert.equal(samePdfArtifactKey(baseline.key, snapshot({ header: 'Changed', footer: 'Footer', title: 'Title', logo: '![Logo](logo-a)' }).key), false);
  assert.equal(samePdfArtifactKey(baseline.key, snapshot({ header: 'Header', footer: 'Changed', title: 'Title', logo: '![Logo](logo-a)' }).key), false);
  assert.equal(samePdfArtifactKey(baseline.key, snapshot({ header: 'Header', footer: 'Footer', title: 'Changed', logo: '![Logo](logo-a)' }).key), false);
  assert.equal(samePdfArtifactKey(baseline.key, snapshot({ header: 'Header', footer: 'Footer', title: 'Title', logo: '![Logo](logo-b)' }).key), false);
});

test('the artifact key holds digests, not the document, so a snapshot carries the document once', () => {
  const baseline = snapshot();
  const digests = Object.entries(baseline.key).filter(([name]) => name !== 'compilerVersion');
  for (const [name, value] of digests) {
    assert.match(value, /^[0-9a-f]{64}$/, name);
  }
  assert.ok(JSON.stringify(baseline.key).length < 500, 'the key stays small whatever the document size');
  const layout = createPrintLayoutSettings({
    pageSetup: structuredClone(defaults.DEFAULT_PAGE_SETUP),
    typographySetup: structuredClone(defaults.DEFAULT_TYPOGRAPHY_SETUP),
    listSetup: structuredClone(defaults.DEFAULT_LIST_SETUP),
    tableSetup: structuredClone(defaults.DEFAULT_TABLE_SETUP),
    imageSetup: structuredClone(defaults.DEFAULT_IMAGE_SETUP),
    projectMetadata: { ...defaults.DEFAULT_PROJECT_METADATA },
    customStyles: [], customBlockStyles: [], sections: []
  });
  const resolver = { resolveSync: source => source };
  const first = createPdfRenderSnapshot('<div class="document-section" data-section-path="one.md"><p>One</p></div>', layout, resolver);
  const second = createPdfRenderSnapshot('<div class="document-section" data-section-path="two.md"><p>Two</p></div>', layout, resolver);
  assert.notEqual(first.key.documentDigest, second.key.documentDigest);
  assert.equal(samePdfArtifactKey(first.key, second.key), false);
});
