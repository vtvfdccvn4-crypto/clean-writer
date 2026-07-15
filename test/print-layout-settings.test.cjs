const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let createPrintLayoutSettings;
let defaults;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24718 } } });
  ({ createPrintLayoutSettings } = await server.ssrLoadModule('/src/print/PrintLayoutSettings.ts'));
  defaults = await server.ssrLoadModule('/src/config/defaults.ts');
});

after(async () => server?.close());

function input() {
  return {
    pageSetup: structuredClone(defaults.DEFAULT_PAGE_SETUP),
    typographySetup: structuredClone(defaults.DEFAULT_TYPOGRAPHY_SETUP),
    listSetup: structuredClone(defaults.DEFAULT_LIST_SETUP),
    tableSetup: structuredClone(defaults.DEFAULT_TABLE_SETUP),
    imageSetup: structuredClone(defaults.DEFAULT_IMAGE_SETUP),
    projectMetadata: structuredClone(defaults.DEFAULT_PROJECT_METADATA),
    customStyles: [{ id: 'note', name: 'Note', openingPair: ':::', closingPair: ':::', fontFamily: 'Inter', fontSize: 10, isBold: false, isItalic: false }],
    customBlockStyles: [{ id: 'warning', name: 'Warning', prefix: '!', icon: 'warning.svg', fontFamily: 'Inter', fontSize: 10, isBold: true, isItalic: false }],
    sections: [
      { path: 'folder', isDir: true },
      { path: 'intro.md', isDir: false, pageBreak: true, hideHeader: true },
      { path: 'body.md', isDir: false, hideFooter: true }
    ]
  };
}

test('captures all print settings as an immutable export-start snapshot', () => {
  const source = input();
  source.pageSetup.paperWidth = 216;
  source.pageSetup.header.centerWidth = '42mm';
  source.typographySetup.h1.fontSize = 31;
  source.pageSetup.toc.h2.fontFamily = 'Aptos';

  const snapshot = createPrintLayoutSettings(source);

  assert.equal(snapshot.paper.widthMm, 216);
  assert.equal(snapshot.paper.marginsMm.top, source.pageSetup.marginTop);
  assert.equal(snapshot.header.centerWidth, '42mm');
  assert.equal(snapshot.typography.h1.fontSize, 31);
  assert.equal(snapshot.toc.h2.fontFamily, 'Aptos');
  assert.deepEqual(snapshot.sections, [
    { path: 'intro.md', requiresPageBreak: true },
    { path: 'body.md', requiresPageBreak: false }
  ]);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.paper.marginsMm), true);
  assert.equal(Object.isFrozen(snapshot.typography.h1), true);

  source.typographySetup.h1.fontSize = 9;
  source.pageSetup.header.centerWidth = '100px';
  assert.equal(snapshot.typography.h1.fontSize, 31);
  assert.equal(snapshot.header.centerWidth, '42mm');
});

test('rejects a layout that would require invented paper geometry', () => {
  const source = input();
  source.pageSetup.marginLeft = source.pageSetup.paperWidth;

  assert.throws(
    () => createPrintLayoutSettings(source),
    /leave no horizontal content area/
  );
});
