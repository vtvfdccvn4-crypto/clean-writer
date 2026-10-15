const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let getImageBlockAtPosition;
let buildImageBlockMove;

before(async () => {
  server = await createTestServer();
  ({ getImageBlockAtPosition, buildImageBlockMove } = await server.ssrLoadModule('/src/editor/imageBlockMove.ts'));
});

after(async () => server?.close());

function applyChanges(document, changes) {
  return changes.reduce(
    (value, change) => `${value.slice(0, change.from)}${change.insert}${value.slice(change.to)}`,
    document
  );
}

test('moves a standalone image line below another line without losing attributes', () => {
  const image = '![Diagram](<images/diagram.png>){width=60% align=center margin="6mm 0"}';
  const source = ['Before.', image, 'After.'].join('\n');
  const block = getImageBlockAtPosition(source, source.indexOf('diagram.png'));
  const destination = source.length;
  const move = buildImageBlockMove(source, block, destination, false);

  assert.ok(move);
  assert.equal(applyChanges(source, move.changes), ['Before.', 'After.', image].join('\n'));
});

test('copies a standalone image line and keeps the original block', () => {
  const image = '![Diagram](images/diagram.png){align=right}';
  const source = ['Before.', image, 'After.'].join('\n');
  const block = getImageBlockAtPosition(source, source.indexOf('diagram.png'));
  const destination = source.indexOf('After.');
  const copy = buildImageBlockMove(source, block, destination, true);

  assert.ok(copy);
  assert.equal(applyChanges(source, copy.changes), ['Before.', image, image, 'After.'].join('\n'));
});

test('does not move inline images or drop a block onto itself', () => {
  const inline = 'Text ![Inline](images/inline.png) continues.';
  assert.equal(getImageBlockAtPosition(inline, inline.indexOf('inline.png')), null);

  const blockText = '![Block](images/block.png)';
  const block = getImageBlockAtPosition(blockText, blockText.indexOf('block.png'));
  assert.ok(block);
  assert.equal(buildImageBlockMove(blockText, block, block.from, false), null);
});
