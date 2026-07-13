const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let normalizeProjectSettings;
let createDefaultProjectSettings;
let applyProjectSettingsMutation;

before(async () => {
  server = await createTestServer();
  ({ normalizeProjectSettings, createDefaultProjectSettings } = await server.ssrLoadModule('/src/services/project-settings.ts'));
  ({ applyProjectSettingsMutation } = await server.ssrLoadModule('/src/services/settings-mutations.ts'));
});

test('shared settings mutations preserve paths and apply typed patches', () => {
  const settings = createDefaultProjectSettings();

  applyProjectSettingsMutation(settings, { type: 'patch', values: { editorSetup: { ...settings.editorSetup, fontSize: '18pt' } } });
  applyProjectSettingsMutation(settings, { type: 'append-order', path: 'sections\\intro.md' });
  applyProjectSettingsMutation(settings, { type: 'set-path-flag', key: 'tocSections', path: 'sections/intro.md', enabled: true });
  applyProjectSettingsMutation(settings, { type: 'replace-path', oldPath: 'sections', newPath: 'chapters' });

  assert.equal(settings.editorSetup.fontSize, '18pt');
  assert.deepEqual(settings.order, ['chapters/intro.md']);
  assert.deepEqual(settings.tocSections, ['chapters/intro.md']);
});

test('untrusted settings values are clamped before CSS generation', () => {
  const { settings } = normalizeProjectSettings({
    pageSetup: {
      paperWidth: Number.POSITIVE_INFINITY,
      header: { centerWidth: '1fr; background:url(https://evil.test)' },
      toc: { fontFamily: 'serif; color:red', fontSize: 99999, color: 'expression(alert(1))', isBold: 'yes', isItalic: true, isAllCaps: 'yes' }
    },
    typographySetup: {
      paragraph: { fontFamily: 'serif; color:red', fontSize: 99999, color: 'expression(alert(1))' }
    }
  });

  assert.equal(settings.pageSetup.paperWidth, 210);
  assert.equal(settings.pageSetup.header.centerWidth, '100px');
  assert.equal(settings.pageSetup.toc.maxLevel, 6);
  assert.equal(settings.pageSetup.toc.h1.fontFamily, 'Times New Roman');
  assert.equal(settings.pageSetup.toc.h1.fontSize, 200);
  assert.equal(settings.pageSetup.toc.h1.color, '#000000');
  assert.equal(settings.pageSetup.toc.h1.isBold, false);
  assert.equal(settings.pageSetup.toc.h1.isItalic, true);
  assert.equal(settings.pageSetup.toc.h1.isAllCaps, false);
  assert.deepEqual(settings.pageSetup.toc.h6, settings.pageSetup.toc.h1);
  assert.equal(settings.typographySetup.paragraph.fontFamily, 'Times New Roman');
  assert.equal(settings.typographySetup.paragraph.fontSize, 200);
  assert.equal(settings.typographySetup.paragraph.color, '#000000');
});

after(async () => {
  await server?.close();
});

test('legacy project settings are migrated to the current schema', () => {
  const { settings, migrated } = normalizeProjectSettings({
    order: ['Folder\\Subfolder', 'root.md', 'Folder\\Subfolder'],
    pageBreaks: ['Folder\\Subfolder\\nested.md'],
    hiddenHeaders: ['Folder\\Subfolder'],
    pageSetup: {
      marginTop: 30
    },
    customStyles: [
      {
        id: 'style-1',
        name: 'Emphasis',
        openingPair: '{{',
        closingPair: '}}',
        fontFamily: 'Inter',
        fontSize: 11,
        color: '#111111',
        isBold: false,
        isItalic: true
      }
    ],
    legacyFlag: true
  });

  assert.equal(settings.schemaVersion, 4);
  assert.deepEqual(settings.order, ['Folder/Subfolder', 'root.md']);
  assert.deepEqual(settings.pageBreaks, ['Folder/Subfolder/nested.md']);
  assert.deepEqual(settings.hiddenHeaders, ['Folder/Subfolder']);
  assert.deepEqual(settings.hiddenFooters, []);
  assert.deepEqual(settings.numberedHeadings, []);
  assert.deepEqual(settings.tocSections, []);
  assert.equal(settings.pageSetup.marginTop, 30);
  assert.equal(settings.pageSetup.marginBottom, 25);
  assert.equal(settings.pageSetup.header.centerWidth, '100px');
  assert.equal(settings.pageSetup.toc.maxLevel, 6);
  assert.deepEqual(settings.pageSetup.toc.h1, {
    fontFamily: 'Times New Roman',
    fontSize: 11,
    color: '#000000',
    isBold: false,
    isItalic: false,
    isAllCaps: false
  });
  assert.deepEqual(settings.pageSetup.toc.h6, settings.pageSetup.toc.h1);
  assert.equal(settings.projectMetadata.documentTitle, '');
  assert.equal(settings.listSetup.ol.bulletIcon, 'decimal');
  assert.equal(settings.listSetup.olParen.bulletIcon, 'decimal');
  assert.equal(settings.tableSetup.table1.headerBackground, '#405a78');
  assert.equal(settings.tableSetup.table2.headerBackground, '#e8ece8');
  assert.equal(settings.customStyles.length, 1);
  assert.equal(settings.customBlockStyles.length, 0);
  assert.equal(settings.legacyFlag, true);
  assert.equal(migrated, true);
});

test('older configuration aliases preserve styles instead of falling back to defaults', () => {
  const { settings } = normalizeProjectSettings({
    settings: {
      page: {
        marginTop: '42',
        marginLeft: '12',
        header: {
          left: { content: 'Header', fontFamily: 'Arial', fontSize: '10', color: '#123456', bold: 'true' }
        }
      },
      typography: {
        paragraph: {
          fontFamily: 'Georgia',
          fontSize: '13',
          color: '#654321',
          bold: 'true',
          italic: 'false',
          lineHeight: '1.4',
          marginTop: '3',
          marginBottom: '9'
        }
      },
      metadata: {
        documentTitle: 'Migrated Title',
        author: 'Migrated Author'
      },
      styles: [{
        id: 'legacy-inline',
        name: 'Legacy Inline',
        openingPair: '{{',
        closingPair: '}}',
        fontFamily: 'Arial',
        fontSize: '12',
        color: '#abcdef',
        bold: 'true',
        italic: 'true'
      }],
      blockStyles: [{
        id: 'legacy-block',
        name: 'Legacy Block',
        prefix: '!!',
        icon: '',
        fontFamily: 'Arial',
        fontSize: '11',
        color: '#fedcba',
        bold: 'true',
        marginTop: '4',
        marginBottom: '5'
      }]
    }
  });

  assert.equal(settings.pageSetup.marginTop, 42);
  assert.equal(settings.pageSetup.marginLeft, 12);
  assert.equal(settings.pageSetup.header.left.fontSize, 10);
  assert.equal(settings.pageSetup.header.left.isBold, true);
  assert.equal(settings.typographySetup.paragraph.fontFamily, 'Georgia');
  assert.equal(settings.typographySetup.paragraph.fontSize, 13);
  assert.equal(settings.typographySetup.paragraph.isBold, true);
  assert.equal(settings.typographySetup.paragraph.marginBottom, 9);
  assert.equal(settings.projectMetadata.documentTitle, 'Migrated Title');
  assert.equal(settings.projectMetadata.author, 'Migrated Author');
  assert.equal(settings.customStyles[0].isBold, true);
  assert.equal(settings.customStyles[0].isItalic, true);
  assert.equal(settings.customBlockStyles[0].isBold, true);
  assert.equal(settings.customBlockStyles[0].marginTop, 4);
});
