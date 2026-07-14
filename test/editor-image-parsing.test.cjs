const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let parseEditorMarkdownImages;

before(async () => {
  server = await createTestServer();
  ({ parseEditorMarkdownImages } = await server.ssrLoadModule('/src/editor/markdown/parseMarkdownImage.ts'));
});

after(async () => server?.close());

test('only standalone image lines are eligible for future block rendering', () => {
  const source = [
    'Before ![Inline](images/inline.png){width=24px} after.',
    '',
    '![Block](images/block.png){width=320px}',
    '',
    'Final text.'
  ].join('\n');
  const images = parseEditorMarkdownImages(source);

  assert.deepEqual(images.map(image => ({
    source: source.slice(image.start, image.end),
    isBlock: image.isBlock
  })), [
    { source: '![Inline](images/inline.png){width=24px}', isBlock: false },
    { source: '![Block](images/block.png){width=320px}', isBlock: true }
  ]);
});
