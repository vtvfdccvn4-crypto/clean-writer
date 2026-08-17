const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let compilePreviewDocument;
let rebaseManifest;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24685 } } });
  ({ compilePreviewDocument, rebaseManifest } = await server.ssrLoadModule('/src/compiler/index.ts'));
});

after(async () => {
  await server?.close();
});

test('preview compilation returns source ranges without emitting source-marker attributes', async () => {
  const compiled = await compilePreviewDocument([
    '# Heading',
    '',
    'Paragraph with an image.',
    '',
    '- First item',
    '- Second item'
  ].join('\n'));

  assert.doesNotMatch(compiled.html, /data-source-(?:line|start|end|id)=/);
  assert.deepEqual(
    compiled.manifest.map(entry => entry.range),
    [
      { startLine: 1, endLine: 1 },
      { startLine: 3, endLine: 3 },
      { startLine: 5, endLine: 5 },
      { startLine: 6, endLine: 6 }
    ]
  );
  assert.ok(compiled.manifest.every(entry => entry.elementPath.length > 0));
});

test('manifest includes image-only blocks and preserves their source range', async () => {
  const compiled = await compilePreviewDocument('![Logo](images/logo.png)');

  assert.deepEqual(compiled.manifest.map(entry => entry.range), [
    { startLine: 1, endLine: 1 },
    { startLine: 1, endLine: 1 }
  ]);
  assert.doesNotMatch(compiled.html, /data-source-/);
});

test('preview compilation rebases generated section-wrapper lines to editor lines', async () => {
  const compiled = await compilePreviewDocument(
    '<div class="document-section">\n\n# First heading\n\nParagraph\n\n</div>',
    null,
    { sourceLineOffset: 2 }
  );

  assert.deepEqual(compiled.manifest.map(entry => entry.range), [
    { startLine: 1, endLine: 1 },
    { startLine: 3, endLine: 3 }
  ]);
});

test('preview compilation associates manifest ranges with generated document sections', async () => {
  const compiled = await compilePreviewDocument(
    '<div class="document-section">\n\n# First\n\n</div>\n\n<div class="document-section">\n\n# Second\n\n</div>',
    null,
    {
      sourceSegments: [
        { filePath: 'one.md', generatedStartLine: 3, generatedEndLine: 3, sourceStartLine: 1 },
        { filePath: 'two.md', generatedStartLine: 9, generatedEndLine: 9, sourceStartLine: 1 }
      ]
    }
  );

  assert.deepEqual(compiled.manifest.map(entry => ({ filePath: entry.filePath, range: entry.range })), [
    { filePath: 'one.md', range: { startLine: 1, endLine: 1 } },
    { filePath: 'two.md', range: { startLine: 1, endLine: 1 } }
  ]);
});

test('manifest rebasing advances through ordered source segments linearly', () => {
  const count = 1_000;
  let segmentReads = 0;
  const segments = Array.from({ length: count }, (_, index) => ({
    filePath: `section-${index}.md`,
    get generatedStartLine() {
      segmentReads += 1;
      return index * 4 + 1;
    },
    get generatedEndLine() {
      segmentReads += 1;
      return index * 4 + 2;
    },
    sourceStartLine: 1
  }));
  const manifest = Array.from({ length: count }, (_, index) => ({
    anchor: `preview-source-${index}`,
    elementPath: [index],
    priority: 0,
    range: { startLine: index * 4 + 1, endLine: index * 4 + 1 }
  }));

  const rebased = rebaseManifest(manifest, 0, segments);

  assert.equal(rebased.length, count);
  assert.deepEqual(rebased[0].range, { startLine: 1, endLine: 1 });
  assert.deepEqual(rebased.at(-1).range, { startLine: 1, endLine: 1 });
  assert.equal(rebased.at(-1).filePath, 'section-999.md');
  assert.ok(segmentReads < count * 6, `expected linear segment reads, received ${segmentReads}`);
});
