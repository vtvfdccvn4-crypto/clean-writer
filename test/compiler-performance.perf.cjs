const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let compileMarkdown;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24682 } } });
  ({ compileMarkdown } = await server.ssrLoadModule('/src/compiler/index.ts'));
});

after(async () => server?.close());

test('a 100-section document compiles within the regression budget', async () => {
  const markdown = Array.from({ length: 100 }, (_, index) =>
    `# Chapter ${index + 1}\n\n${'A representative paragraph with **formatting** and metadata. '.repeat(35)}`
  ).join('\n\n');
  const started = performance.now();
  const html = await compileMarkdown(markdown, 'D:\\Performance Project');
  const elapsed = performance.now() - started;

  assert.match(html, /Chapter 100/);
  // This intentionally generous budget catches accidental algorithmic
  // regressions without making CI sensitive to ordinary machine variance.
  assert.ok(elapsed < 5_000, `100-section compile took ${elapsed.toFixed(0)}ms`);
});
