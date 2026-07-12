const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let resolveSourceAnchor;

before(async () => {
  server = await createTestServer({ server: { hmr: false } });
  ({ resolveSourceAnchor } = await server.ssrLoadModule('/src/preview/SourceAnchorResolver.ts'));
});

after(async () => server?.close());

const anchors = [
  { id: 'intro', startLine: 1, endLine: 3, value: 'intro' },
  { id: 'image', startLine: 5, endLine: 5, value: 'image' },
  { id: 'paragraph', startLine: 7, endLine: 12, value: 'paragraph' }
];

test('resolves a line inside a multi-line source block', () => {
  assert.equal(resolveSourceAnchor(anchors, 10)?.id, 'paragraph');
});

test('uses the nearest preceding block for blank source lines', () => {
  assert.equal(resolveSourceAnchor(anchors, 6)?.id, 'image');
});

test('prefers the most specific containing block', () => {
  const nested = [...anchors, { id: 'list-item', startLine: 8, endLine: 9, value: 'item' }];
  assert.equal(resolveSourceAnchor(nested, 8)?.id, 'list-item');
});
