const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let CompileClient;

before(async () => {
  server = await createTestServer();
  ({ CompileClient } = await server.ssrLoadModule('/src/workers/CompileClient.ts'));
});

after(async () => server?.close());

const request = { lane: 'live', markdown: '# Hello', settings: {}, assets: {}, sourceLineOffset: 0 };
const localOutcome = async job => ({ compiled: { html: `local:${job.markdown}`, manifest: [] }, cacheHit: false, phases: {} });

test('a browser that cannot create the worker compiles on the page instead of failing', async () => {
  // Some browsers do not support module workers, so creating one throws.
  const client = new CompileClient({
    createWorker: () => { throw new Error('Module workers are not supported.'); },
    compileLocal: localOutcome
  });
  const outcome = await client.compile(request);
  assert.equal(outcome.compiled.html, 'local:# Hello');
  assert.equal(client.usesFallback, true);
});

test('later compiles in a browser without workers go straight to the page', async () => {
  let creations = 0;
  const client = new CompileClient({
    createWorker: () => { creations += 1; throw new Error('no workers'); },
    compileLocal: localOutcome
  });
  await client.compile(request);
  await client.compile({ ...request, markdown: '# Again' });
  assert.equal(creations, 1);
});
