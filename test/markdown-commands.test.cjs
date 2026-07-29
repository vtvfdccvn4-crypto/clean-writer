const assert = require('node:assert/strict');
const { before, after, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let applyMarkdownCommand;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24692 } } });
  ({ applyMarkdownCommand } = await server.ssrLoadModule('/src/editor/markdown-commands.ts'));
});

after(async () => {
  await server?.close();
});

test('italic command wraps the selected text in asterisks', () => {
  let dispatched = null;
  const view = {
    state: {
      doc: {
        toString: () => 'hello world',
        sliceString: (from, to) => 'world'
      },
      sliceDoc: (from, to) => 'world',
      selection: {
        ranges: [{ from: 6, to: 11 }]
      },
      changeByRange: (fn) => fn({ from: 6, to: 11 })
    },
    dispatch: (transaction) => {
      dispatched = transaction;
    },
    focus: () => {}
  };

  applyMarkdownCommand(view, 'italic');

  assert.ok(dispatched);
  assert.deepEqual(dispatched.changes, { from: 6, to: 11, insert: '*world*' });
  assert.equal(dispatched.range.from, 7);
  assert.equal(dispatched.range.to, 12);
});
