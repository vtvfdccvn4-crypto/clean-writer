const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let resolveEditorImageSource;

before(async () => {
  server = await createTestServer();
  ({ resolveEditorImageSource } = await server.ssrLoadModule('/src/editor/images/resolveEditorImageSource.ts'));
});

after(async () => server?.close());

test('editor image resolution preloads the Markdown source before returning its URL', async () => {
  const calls = [];
  const resolved = await resolveEditorImageSource('images/diagram.png', {
    async preloadImages(paths) { calls.push(['preload', paths]); },
    resolveSync(source) { calls.push(['resolve', source]); return `blob:project/${source}`; },
    release() {},
    releaseAll() {}
  });

  assert.equal(resolved, 'blob:project/images/diagram.png');
  assert.deepEqual(calls, [
    ['preload', ['images/diagram.png']],
    ['resolve', 'images/diagram.png']
  ]);
});
