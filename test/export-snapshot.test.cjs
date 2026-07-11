const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let compileExportSnapshot;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24691 } } });
  ({ compileExportSnapshot } = await server.ssrLoadModule('/src/services/ExportSnapshotService.ts'));
});

after(async () => server?.close());

test('export snapshot preserves sections, page breaks, and current Markdown', async () => {
  const files = new Map([
    ['sections/first.md', '# First\n\nDurable first section'],
    ['sections/second.md', '# Second\n\nDurable second section']
  ]);
  const session = {
    readSection: async path => files.get(path) || '',
    id: 'snapshot-test'
  };
  const sections = [
    { path: 'sections/first.md', isDir: false, pageBreak: false },
    { path: 'sections/second.md', isDir: false, pageBreak: true }
  ];
  const html = await compileExportSnapshot({
    session,
    assetResolver: { preloadImages: async () => {}, resolveSync: path => path },
    isFullDocMode: true,
    activeFile: null,
    sections
  }, {
    compile: async markdown => `<article>${markdown}</article>`
  });

  assert.match(html, /data-section-path="sections\/first\.md"/);
  assert.match(html, /data-section-path="sections\/second\.md"/);
  assert.match(html, /class="section-break"/);
  assert.match(html, /Durable first section/);
  assert.match(html, /Durable second section/);
});

test('export snapshot uses current Markdown for the active section', async () => {
  const session = { readSection: async () => '# Durable source' };
  const sections = [{ path: 'sections/current.md', isDir: false }];
  const html = await compileExportSnapshot({
    session,
    assetResolver: { preloadImages: async () => {}, resolveSync: path => path },
    isFullDocMode: false,
    activeFile: 'sections/current.md',
    sections,
    currentMarkdown: '# Current editor content'
  }, { compile: async markdown => markdown });

  assert.match(html, /Current editor content/);
  assert.doesNotMatch(html, /Durable source/);
});

test('full-document snapshot bounds concurrent section reads', async () => {
  let activeReads = 0;
  let maxActiveReads = 0;
  const sections = Array.from({ length: 10 }, (_, index) => ({
    path: `sections/section-${index}.md`,
    isDir: false
  }));
  const html = await compileExportSnapshot({
    session: {
      readSection: async path => {
        activeReads += 1;
        maxActiveReads = Math.max(maxActiveReads, activeReads);
        await new Promise(resolve => setTimeout(resolve, 5));
        activeReads -= 1;
        return `# ${path}`;
      }
    },
    assetResolver: { preloadImages: async () => {}, resolveSync: path => path },
    isFullDocMode: true,
    activeFile: null,
    sections
  }, { compile: async markdown => markdown });

  assert.equal(maxActiveReads, 4);
  assert.match(html, /sections\/section-9\.md/);
});
