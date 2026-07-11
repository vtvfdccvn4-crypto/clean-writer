const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let classifyDocumentMode;
let buildFullDocumentMarkdown;
let buildExplorerTree;
let getSectionVisibilityNodes;
let compileMarkdown;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24681 } } });
  ({
    classifyDocumentMode,
    buildFullDocumentMarkdown
  } = await server.ssrLoadModule('/src/preview/document-rendering/index.ts'));
  ({ buildExplorerTree } = await server.ssrLoadModule('/src/utils/tree-utils.ts'));
  ({ getSectionVisibilityNodes } = await server.ssrLoadModule('/src/ui/components/SectionVisibilityDrawer.ts'));
  ({ compileMarkdown } = await server.ssrLoadModule('/src/compiler/index.ts'));
});

test('section configuration roots match the collapsed explorer for all document modes', () => {
  const fileOnly = buildExplorerTree([
    { path: 'one.md', isDir: false },
    { path: 'two.md', isDir: false }
  ]);
  const foldersOnly = buildExplorerTree([
    { path: 'Chapter A', isDir: true },
    { path: 'Chapter A/one.md', isDir: false },
    { path: 'Chapter B', isDir: true },
    { path: 'Chapter B/two.md', isDir: false }
  ]);
  const mixed = buildExplorerTree([
    { path: 'preface.md', isDir: false },
    { path: 'Chapters', isDir: true },
    { path: 'Chapters/one.md', isDir: false },
    { path: 'appendix.md', isDir: false }
  ]);

  assert.deepEqual(fileOnly.map(node => node.path), ['one.md', 'two.md']);
  assert.deepEqual(foldersOnly.map(node => node.path), ['Chapter A', 'Chapter B']);
  assert.deepEqual(mixed.map(node => node.path), ['preface.md', 'Chapters', 'appendix.md']);
});

test('section visibility drawer unwraps the storage sections folder', () => {
  const roots = getSectionVisibilityNodes([
    { path: 'sections/MySection.md', isDir: false },
    { path: 'sections/Chapter', isDir: true },
    { path: 'sections/Chapter/one.md', isDir: false }
  ]);

  assert.deepEqual(roots.map(node => ({ path: node.path, name: node.name, isDir: node.isDir })), [
    { path: 'sections/MySection.md', name: 'MySection.md', isDir: false },
    { path: 'sections/Chapter', name: 'Chapter', isDir: true }
  ]);
});

test('compiled sections preserve preview control metadata', async () => {
  const markdown = buildFullDocumentMarkdown([
    {
      path: 'chapter.md',
      isDir: false,
      pageBreak: false,
      hideHeader: true,
      hideFooter: true,
      numberHeadings: true,
      includeInToc: true
    }
  ], [{ path: 'chapter.md', markdown: ':::toc\n\n# Chapter' }]);
  const html = await compileMarkdown(markdown);

  assert.match(html, /data-section-path="chapter\.md"/);
  assert.match(html, /data-hide-header="true"/);
  assert.match(html, /data-hide-footer="true"/);
  assert.match(html, /data-number-headings="true"/);
  assert.match(html, /data-include-in-toc="true"/);
  assert.match(html, /class="toc-placeholder"/);
});

after(async () => {
  await server?.close();
});

test('document rendering splits single, folder, and mixed structures deterministically', () => {
  const singleSections = [
    { path: 'a.md', isDir: false, pageBreak: false, hideHeader: false, hideFooter: false }
  ];
  const folderSections = [
    { path: 'Folder', isDir: true, pageBreak: false, hideHeader: false, hideFooter: false },
    { path: 'Folder/a.md', isDir: false, pageBreak: false, hideHeader: false, hideFooter: false }
  ];
  const mixedSections = [
    { path: 'a.md', isDir: false, pageBreak: false, hideHeader: true, hideFooter: false, numberHeadings: true, includeInToc: true },
    { path: 'Folder', isDir: true, pageBreak: false, hideHeader: false, hideFooter: false },
    { path: 'Folder/b.md', isDir: false, pageBreak: false, hideHeader: false, hideFooter: true }
  ];
  const blocks = [
    { path: 'a.md', markdown: '# A' },
    { path: 'Folder/b.md', markdown: '# B' }
  ];

  assert.equal(classifyDocumentMode(singleSections), 'single-files');
  assert.equal(classifyDocumentMode(folderSections), 'folders');
  assert.equal(classifyDocumentMode(mixedSections), 'mixed');

  const singleHtml = buildFullDocumentMarkdown(singleSections, blocks);
  const folderHtml = buildFullDocumentMarkdown(folderSections, blocks);
  const mixedHtml = buildFullDocumentMarkdown(mixedSections, blocks);

  assert.match(singleHtml, /data-section-index="0"/);
  assert.doesNotMatch(singleHtml, /Folder\/b\.md/);

  assert.match(folderHtml, /data-section-index="0"/);
  assert.doesNotMatch(folderHtml, /a\.md/);

  assert.match(mixedHtml, /data-section-index="0"/);
  assert.match(mixedHtml, /data-section-index="1"/);
  assert.match(mixedHtml, /data-hide-header="true"/);
  assert.match(mixedHtml, /data-hide-footer="true"/);
  assert.match(mixedHtml, /data-number-headings="true"/);
  assert.match(mixedHtml, /data-include-in-toc="true"/);
  assert.match(mixedHtml, /^<div class="document-section"/);
});
