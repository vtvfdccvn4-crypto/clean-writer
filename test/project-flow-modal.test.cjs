const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { createTestServer } = require('./helpers/vite-test-server.cjs');

let server;
let escapeProjectFlowText;

before(async () => {
  server = await createTestServer({ server: { hmr: { port: 24689 } } });
  ({ escapeProjectFlowText } = await server.ssrLoadModule('/src/ui/project-flow-modal.ts'));
});

after(async () => {
  await server?.close();
});

test('recent project names are HTML-escaped before modal rendering', () => {
  const escaped = escapeProjectFlowText('<img src=x onerror=alert(1)>"quoted"&\'single\'');

  assert.equal(
    escaped,
    '&lt;img src=x onerror=alert(1)&gt;&quot;quoted&quot;&amp;&#39;single&#39;'
  );
  assert.doesNotMatch(escaped, /<|>/);
});
