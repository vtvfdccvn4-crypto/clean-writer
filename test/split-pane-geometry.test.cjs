const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let calculateSplitPaneConstraints;
let clampSplitPaneRatio;
let leadingWidthForRatio;

before(async () => {
  server = await createTestServer();
  ({ calculateSplitPaneConstraints, clampSplitPaneRatio, leadingWidthForRatio } = await server.ssrLoadModule('/src/ui/split-pane/SplitPaneGeometry.ts'));
});

after(async () => {
  await server?.close();
});

test('split-pane geometry clamps an editor width while preserving the preview minimum', () => {
  const constraints = calculateSplitPaneConstraints(100, 1200, 7, 320, 360);
  assert.equal(constraints.usableWidth, 1193);
  assert.equal(constraints.minimumLeadingWidth, 320);
  assert.equal(constraints.maximumLeadingWidth, 833);
  assert.equal(clampSplitPaneRatio(0.01, constraints, 0.5), 320 / 1193);
  assert.equal(clampSplitPaneRatio(0.99, constraints, 0.5), 833 / 1193);
});

test('split-pane geometry uses the even split in compact layouts', () => {
  const constraints = calculateSplitPaneConstraints(0, 600, 7, 320, 360);
  assert.equal(constraints.compact, true);
  assert.equal(clampSplitPaneRatio(0.8, constraints, 0.5), 0.5);
  assert.equal(leadingWidthForRatio(0.5, constraints), Math.round(593 / 2));
});
