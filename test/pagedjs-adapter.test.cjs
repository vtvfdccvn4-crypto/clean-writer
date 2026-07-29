const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let PagedRenderSession;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24704 } } });
  ({ PagedRenderSession } = await server.ssrLoadModule('/src/preview/PagedJsAdapter.ts'));
  global.window = {
    setTimeout,
    clearTimeout
  };
});

after(async () => {
  delete global.window;
  await server?.close();
});

test('Paged.js session wait stops promptly when its signal is aborted', async () => {
  const controller = new AbortController();
  const session = new PagedRenderSession(
    {},
    { chunker: { pages: [] } },
    new Promise(() => undefined),
    () => undefined
  );

  const pending = session.wait(5_000, controller.signal);
  controller.abort();

  await assert.rejects(pending, error => error?.name === 'AbortError');
});
