const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let resolvePageNumber;
let adjacentHeadingIndex;

before(async () => {
  server = await createTestServer();
  ({ resolvePageNumber, adjacentHeadingIndex } = await server.ssrLoadModule('/src/preview/navigation/pageNavigation.ts'));
});

after(async () => server?.close());

test('page numbers are accepted only as whole numbers within the document', () => {
  assert.deepEqual(resolvePageNumber(' 3 ', 10), { ok: true, page: 3 });
  assert.deepEqual(resolvePageNumber('1', 10), { ok: true, page: 1 });
  assert.deepEqual(resolvePageNumber('10', 10), { ok: true, page: 10 });
  for (const value of ['0', '11', '-2', '2.5', '', 'page 3', '1e2']) {
    const result = resolvePageNumber(value, 10);
    assert.equal(result.ok, false, `accepted ${JSON.stringify(value)}`);
    assert.match(result.message, /from 1 to 10/);
  }
  assert.equal(resolvePageNumber('1', 0).ok, false);
});

test('forward movement goes to the first heading below the aligned line', () => {
  const tops = [-400, -120, 12, 300, 700];
  assert.equal(adjacentHeadingIndex(tops, 12, 1), 3);
  assert.equal(adjacentHeadingIndex([-400, -120], 12, 1), null);
});

test('backward movement from an aligned heading goes to the one before it', () => {
  const tops = [-400, -120, 12, 300, 700];
  assert.equal(adjacentHeadingIndex(tops, 12, -1), 1);
  assert.equal(adjacentHeadingIndex([12, 300], 12, -1), null);
});

test('backward movement from a scrolled-past heading returns to that heading', () => {
  const tops = [-400, -120, 12, 300, 700];
  // The third heading is above the line by 80px, so it is the one passed.
  assert.equal(adjacentHeadingIndex([-400, -120, -80, 300], 12, -1), 2);
  assert.equal(adjacentHeadingIndex([-400, -120, -80, 300], 12, 1), 3);
  assert.equal(adjacentHeadingIndex(tops, 12, -1), 1);
});

test('no headings or no position gives no movement', () => {
  assert.equal(adjacentHeadingIndex([], 12, 1), null);
  assert.equal(adjacentHeadingIndex([], 12, -1), null);
  assert.equal(adjacentHeadingIndex([100, 200], 12, -1), null);
});

test('a heading a fraction of a pixel below the line counts as reached', () => {
  // Scrolling aligns the heading at 12.4px, so "next" must move on rather than find it again.
  assert.equal(adjacentHeadingIndex([12.4, 53, 93], 12, 1), 1);
  assert.equal(adjacentHeadingIndex([12.4, 53, 93], 12, -1), null);
});
