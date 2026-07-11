const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let createHeadingNumberSequence;

before(async () => {
  server = await createTestServer({ server: { hmr: false } });
  ({ createHeadingNumberSequence } = await server.ssrLoadModule('/src/preview/headingNumbering.ts'));
});

after(async () => {
  await server?.close();
});

test('heading numbering follows six-level document hierarchy', () => {
  assert.deepEqual(
    createHeadingNumberSequence([1, 2, 3, 3, 2, 1, 2]),
    ['1', '1.1', '1.1.1', '1.1.2', '1.2', '2', '2.1']
  );
});
