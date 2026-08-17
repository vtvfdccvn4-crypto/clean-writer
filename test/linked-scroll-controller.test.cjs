const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let resolvePreviewTargetForLine;
let calculateLinkedScrollTop;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24688 } } });
  ({ resolvePreviewTargetForLine, calculateLinkedScrollTop } = await server.ssrLoadModule('/src/preview/navigation/LinkedScrollController.ts'));
});

after(async () => {
  await server?.close();
});

function target(startLine, endLine = startLine, pageIndex = 0) {
  return {
    pageIndex,
    element: {},
    entry: {
      anchor: `source-${startLine}-${pageIndex}`,
      range: { startLine, endLine },
      elementPath: [0],
      priority: 1
    }
  };
}

test('resolves the most specific preview target containing an editor line', () => {
  const resolved = resolvePreviewTargetForLine([target(1, 20), target(8, 10)], 9);

  assert.equal(resolved?.entry.range.startLine, 8);
});

test('uses the preceding preview target when a source line has no rendered block', () => {
  const resolved = resolvePreviewTargetForLine([target(2, 3), target(10, 12)], 8);

  assert.equal(resolved?.entry.range.startLine, 2);
});

test('prefers the first physical copy of a split target', () => {
  const resolved = resolvePreviewTargetForLine([target(8, 12, 2), target(8, 12, 1)], 9);

  assert.equal(resolved?.pageIndex, 1);
});

test('places a follower target at the same relative viewport position', () => {
  assert.equal(calculateLinkedScrollTop(900, 400, 2_000, 0.5), 700);
});

test('clamps follower scrolling at both document edges', () => {
  assert.equal(calculateLinkedScrollTop(10, 400, 2_000, 0.5), 0);
  assert.equal(calculateLinkedScrollTop(1_990, 400, 2_000, 0.5), 1_600);
});
