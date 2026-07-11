const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let resolveSectionVisibility;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24680 } } });
  ({ resolveSectionVisibility } = await server.ssrLoadModule('/src/visibility/sectionVisibility.ts'));
});

after(async () => {
  await server?.close();
});

test('folder visibility cascades through the full ancestor chain', () => {
  const sections = [
    { path: 'chapter-a', hideHeader: true, hideFooter: false, numberHeadings: true },
    { path: 'chapter-a/part-2.md', hideHeader: false, hideFooter: true, numberHeadings: false },
    { path: 'chapter-b/intro.md', hideHeader: false, hideFooter: false }
  ];

  assert.deepEqual(resolveSectionVisibility(sections, 'chapter-a/part-1.md'), {
    hideHeader: true,
    hideFooter: false,
    matchedHeaderPath: 'chapter-a',
    matchedFooterPath: null,
    numberHeadings: true,
    matchedNumberingPath: 'chapter-a',
    includeInToc: false,
    matchedTocPath: null
  });

  assert.deepEqual(resolveSectionVisibility(sections, 'chapter-a/part-2.md'), {
    hideHeader: true,
    hideFooter: true,
    matchedHeaderPath: 'chapter-a',
    matchedFooterPath: 'chapter-a/part-2.md',
    numberHeadings: true,
    matchedNumberingPath: 'chapter-a',
    includeInToc: false,
    matchedTocPath: null
  });

  assert.deepEqual(resolveSectionVisibility(sections, 'chapter-b/intro.md'), {
    hideHeader: false,
    hideFooter: false,
    matchedHeaderPath: null,
    matchedFooterPath: null,
    numberHeadings: false,
    matchedNumberingPath: null,
    includeInToc: false,
    matchedTocPath: null
  });
});

test('TOC inclusion cascades from folders while unrelated files remain excluded', () => {
  const sections = [
    { path: 'front-matter.md', includeInToc: false },
    { path: 'chapters', includeInToc: true },
    { path: 'chapters/one.md', includeInToc: false },
    { path: 'appendix/notes.md', includeInToc: true }
  ];

  assert.equal(resolveSectionVisibility(sections, 'front-matter.md').includeInToc, false);
  assert.equal(resolveSectionVisibility(sections, 'chapters/one.md').includeInToc, true);
  assert.equal(resolveSectionVisibility(sections, 'chapters/two.md').matchedTocPath, 'chapters');
  assert.equal(resolveSectionVisibility(sections, 'appendix/notes.md').includeInToc, true);
});
