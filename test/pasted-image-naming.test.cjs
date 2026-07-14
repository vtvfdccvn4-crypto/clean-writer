const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let nextPastedImageFilename;

before(async () => {
  server = await createTestServer();
  ({ nextPastedImageFilename } = await server.ssrLoadModule('/src/images/pastedImage.ts'));
});

test('pasted images receive the next section-scoped consecutive name', () => {
  assert.equal(
    nextPastedImageFilename('sections/Instrument Design.md', [
      'images/instrument_design-1.png',
      'images/instrument_design-3.png',
      'images/other_section-1.png'
    ], '.png'),
    'instrument_design-4.png'
  );
});

after(async () => {
  await server?.close();
});
