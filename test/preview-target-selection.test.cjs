const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let resolveSourceLineTarget;
let comparePreviewTargetsByPage;

before(async () => {
  server = await createTestServer({ server: { hmr: false } });
  ({ resolveSourceLineTarget, comparePreviewTargetsByPage } = await server.ssrLoadModule('/src/preview/navigation/PreviewTargetSelection.ts'));
});

after(async () => server?.close());

function target(startLine, endLine = startLine, pageIndex = 0, priority = 1) {
  return {
    pageIndex,
    element: {},
    entry: {
      anchor: `source-${startLine}-${pageIndex}`,
      range: { startLine, endLine },
      elementPath: [0],
      priority
    }
  };
}

test('selects the most specific containing target and preserves priority', () => {
  const resolved = resolveSourceLineTarget([
    target(1, 20),
    target(8, 10, 0, 1),
    target(8, 10, 1, 2)
  ], 9);

  assert.equal(resolved?.pageIndex, 1);
});

test('supports live next-or-preceding fallback while paginated navigation remains preceding-only', () => {
  const targets = [target(2, 3), target(10, 12)];

  assert.equal(resolveSourceLineTarget(targets, 8)?.entry.range.startLine, 2);
  assert.equal(resolveSourceLineTarget(targets, 8, 'next-or-preceding')?.entry.range.startLine, 10);
});

test('linked scrolling keeps the first physical copy of a split target', () => {
  const resolved = resolveSourceLineTarget(
    [target(8, 12, 2), target(8, 12, 1)],
    9,
    'preceding',
    comparePreviewTargetsByPage
  );

  assert.equal(resolved?.pageIndex, 1);
});

test('source-line selection scans large target sets once without sorting copies', () => {
  const count = 2_000;
  let rangeReads = 0;
  const targets = Array.from({ length: count }, (_, index) => ({
    pageIndex: 0,
    element: {},
    entry: {
      anchor: `source-${index}`,
      get range() {
        rangeReads += 1;
        return { startLine: index * 2 + 1, endLine: index * 2 + 1 };
      },
      elementPath: [0],
      priority: 1
    }
  }));

  const resolved = resolveSourceLineTarget(targets, count * 2 - 1);

  assert.equal(resolved?.entry.anchor, `source-${count - 1}`);
  assert.ok(rangeReads < count * 10, `expected linear target access, received ${rangeReads}`);
});
