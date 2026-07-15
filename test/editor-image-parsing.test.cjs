const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let parseEditorMarkdownImages;
let imageAlignmentAttribute;
let imageWidthAttribute;
let withImageWidthAttribute;
let resetImagePresentation;

before(async () => {
  server = await createTestServer();
  ({ parseEditorMarkdownImages, imageAlignmentAttribute, imageWidthAttribute, withImageWidthAttribute } = await server.ssrLoadModule('/src/editor/markdown/parseMarkdownImage.ts'));
  ({ resetImagePresentation } = await server.ssrLoadModule('/src/images/resetImagePresentation.ts'));
});

test('image width edits preserve other image attributes and can remove width', () => {
  const attributes = '{align=center margin="4mm 0" width=100%}'
  assert.equal(imageWidthAttribute(attributes), '100%');
  assert.equal(withImageWidthAttribute(attributes, '320px'), '{align=center margin="4mm 0" width=320px}');
  assert.equal(withImageWidthAttribute(attributes, ''), '{align=center margin="4mm 0"}');
});

test('image controls read attributes when they are first in an attribute block', () => {
  assert.equal(imageWidthAttribute('{width=10cm align=center}'), '10cm');
  assert.equal(imageAlignmentAttribute('{align=center width=10cm}'), 'center');
});

test('resetting image presentation preserves width and custom attributes across all images', () => {
  const source = [
    '![One](<images/one.png> "One title"){width=40% align=left margin="1mm 0" data-id=one}',
    'Text ![Two](images/two.png) here.'
  ].join('\n');
  assert.equal(
    resetImagePresentation(source, { alignment: 'right', marginTop: 4, marginBottom: 8 }),
    [
      '![One](<images/one.png> "One title"){width=40% data-id=one align=right margin="4mm 0 8mm"}',
      'Text ![Two](images/two.png){align=right margin="4mm 0 8mm"} here.'
    ].join('\n')
  );
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
