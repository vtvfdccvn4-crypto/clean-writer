const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let parseEditorMarkdownImages;
let imageWidthAttribute;
let withImageWidthAttribute;

before(async () => {
  server = await createTestServer();
  ({ parseEditorMarkdownImages, imageWidthAttribute, withImageWidthAttribute } = await server.ssrLoadModule('/src/editor/markdown/parseMarkdownImage.ts'));
});

test('image width edits preserve other image attributes and can remove width', () => {
  const attributes = '{align=center margin="4mm 0" width=100%}'
  assert.equal(imageWidthAttribute(attributes), '100%');
  assert.equal(withImageWidthAttribute(attributes, '320px'), '{align=center margin="4mm 0" width=320px}');
  assert.equal(withImageWidthAttribute(attributes, ''), '{align=center margin="4mm 0"}');
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
